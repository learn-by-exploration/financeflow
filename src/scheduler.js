/**
 * Lightweight background job scheduler.
 * Registers jobs with intervals and runs them on a timer.
 * Built-in jobs: session/audit cleanup, recurring transaction spawning.
 */
module.exports = function createScheduler(db, logger) {
  const jobs = [];

  const JOB_TIMEOUT_MS = 30000; // 30s safety timeout per job

  function register(name, intervalMs, fn) {
    jobs.push({ name, intervalMs, fn, timer: null });
  }

  function runJobWithTimeout(job) {
    const start = Date.now();
    try {
      const result = job.fn();
      // Handle async jobs (Promise-returning)
      if (result && typeof result.then === 'function') {
        const timer = setTimeout(() => {
          logger.warn({ job: job.name, elapsed: JOB_TIMEOUT_MS }, 'Scheduler job timed out');
        }, JOB_TIMEOUT_MS);
        result
          .catch(err => logger.error({ err, job: job.name }, 'Scheduler async job failed'))
          .finally(() => clearTimeout(timer));
      }
    } catch (err) {
      logger.error({ err, job: job.name, durationMs: Date.now() - start }, 'Scheduler job failed');
    }
  }

  function start() {
    for (const job of jobs) {
      runJobWithTimeout(job);
      job.timer = setInterval(() => runJobWithTimeout(job), job.intervalMs);
    }
  }

  function stop() {
    for (const job of jobs) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
    }
  }

  function advanceDate(dateStr, frequency) {
    const d = new Date(dateStr + 'T00:00:00Z');
    switch (frequency) {
      case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
      case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
      case 'biweekly': d.setUTCDate(d.getUTCDate() + 14); break;
      case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
      case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
      case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    }
    return d.toISOString().slice(0, 10);
  }

  function spawnDueRecurring() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const rules = db.prepare(
      'SELECT * FROM recurring_rules WHERE is_active = 1 AND next_date <= ?'
    ).all(todayStr);

    const failures = [];

    for (const rule of rules) {
      try {
        db.transaction(() => {
          // Check if end_date has passed
          if (rule.end_date && rule.end_date < todayStr) {
            db.prepare('UPDATE recurring_rules SET is_active = 0 WHERE id = ?').run(rule.id);
            return;
          }

          // Create transaction
          db.prepare(`
            INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, payee, date, is_recurring, recurring_rule_id, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '[]')
          `).run(rule.user_id, rule.account_id, rule.category_id, rule.type, rule.amount,
            rule.currency, rule.description, rule.payee, todayStr, rule.id);

          // Update account balance
          const balanceChange = rule.type === 'income' ? rule.amount : -rule.amount;
          db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
            .run(Math.round((balanceChange + Number.EPSILON) * 100) / 100, rule.account_id, rule.user_id);

          // Advance next_date
          const nextDate = advanceDate(rule.next_date, rule.frequency);
          db.prepare('UPDATE recurring_rules SET next_date = ? WHERE id = ?').run(nextDate, rule.id);

          logger.info({ ruleId: rule.id, description: rule.description, nextDate }, 'Spawned recurring transaction');
        })();
      } catch (err) {
        logger.error({ err, ruleId: rule.id, description: rule.description }, 'Failed to spawn recurring transaction');
        failures.push({ ruleId: rule.id, error: err.message });
      }
    }

    return { processed: rules.length, failures };
  }

  function runCleanup() {
    try {
      // Session cleanup — delete expired sessions
      const sessions = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
      if (sessions.changes > 0) {
        logger.info({ deleted: sessions.changes }, 'Cleaned up expired sessions');
      }

      // Audit log cleanup — delete entries older than 90 days
      const audit = db.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')").run();
      if (audit.changes > 0) {
        logger.info({ deleted: audit.changes }, 'Cleaned up old audit log entries');
      }

      // Notification cleanup — keep max 200 per user, purge read notifications > 30 days
      const readPurge = db.prepare(
        "DELETE FROM notifications WHERE is_read = 1 AND created_at < datetime('now', '-30 days')"
      ).run();
      if (readPurge.changes > 0) {
        logger.info({ deleted: readPurge.changes }, 'Cleaned up old read notifications');
      }
      // Cap at 200 per user — delete oldest beyond limit
      const users = db.prepare('SELECT DISTINCT user_id FROM notifications').all();
      for (const { user_id } of users) {
        const overflow = db.prepare(
          'DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200)'
        ).run(user_id, user_id);
        if (overflow.changes > 0) {
          logger.info({ userId: user_id, deleted: overflow.changes }, 'Capped notifications to 200');
        }
      }

      // Exchange rate cleanup — keep last 365 days
      const rates = db.prepare(
        "DELETE FROM exchange_rates WHERE created_at < datetime('now', '-365 days')"
      ).run();
      if (rates.changes > 0) {
        logger.info({ deleted: rates.changes }, 'Cleaned up old exchange rates');
      }
    } catch (err) {
      logger.error({ err }, 'Cleanup job failed');
    }
  }

  function runRateLimitCleanup() {
    try {
      const createPerUserRateLimit = require('./middleware/per-user-rate-limit');
      createPerUserRateLimit._cleanup();
      logger.debug('Rate limit windows cleaned up');
    } catch (err) {
      logger.error({ err }, 'Rate limit cleanup failed');
    }
  }

  function runInactivityNudge() {
    try {
      // Batch query: find all users needing a nudge in one shot
      const candidates = db.prepare(`
        SELECT u.id as user_id,
          COALESCE(CAST(s.value AS INTEGER), 3) as nudge_days,
          MAX(t.created_at) as last_txn
        FROM users u
        LEFT JOIN settings s ON u.id = s.user_id AND s.key = 'inactivity_nudge_days'
        LEFT JOIN transactions t ON u.id = t.user_id
        WHERE COALESCE(CAST(s.value AS INTEGER), 3) > 0
        GROUP BY u.id
        HAVING last_txn IS NOT NULL
      `).all();

      for (const row of candidates) {
        const daysSince = Math.floor((Date.now() - new Date(row.last_txn).getTime()) / 86400000);
        if (daysSince < row.nudge_days) continue;

        // Deduplicate: check recent nudge
        const recentNudge = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'inactivity_nudge' AND created_at >= datetime('now', '-1 day')"
        ).get(row.user_id);
        if (!recentNudge) {
          db.prepare(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
          ).run(row.user_id, 'inactivity_nudge', 'Time to log!',
            `It's been ${daysSince} days since your last transaction. Keeping records current helps track your finances accurately.`);
          logger.info({ userId: row.user_id, daysSince }, 'Inactivity nudge sent');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Inactivity nudge job failed');
    }
  }

  function runMonthlyDigest() {
    try {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const fromDate = prevMonth.toISOString().slice(0, 10);
      const toDate = prevMonthEnd.toISOString().slice(0, 10);
      const monthLabel = prevMonth.toLocaleString('en', { month: 'long', year: 'numeric' });

      // Batch: get income/expenses for all users in one query
      const summaries = db.prepare(`
        SELECT u.id as user_id,
          COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as expenses
        FROM users u
        LEFT JOIN transactions t ON u.id = t.user_id AND t.date >= ? AND t.date <= ?
        GROUP BY u.id
      `).all(fromDate, toDate);

      for (const row of summaries) {
        const savingsRate = row.income > 0 ? Math.round(((row.income - row.expenses) / row.income) * 100) : 0;

        const topCats = db.prepare(`
          SELECT c.name, SUM(t.amount) as total FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
          GROUP BY t.category_id ORDER BY total DESC LIMIT 3
        `).all(row.user_id, fromDate, toDate);

        const topCatStr = topCats.map(c => `${c.name}: ₹${Math.round(c.total)}`).join(', ');

        db.prepare(
          'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
        ).run(row.user_id, 'monthly_digest', `${monthLabel} Summary`,
          `Income: ₹${Math.round(row.income)} | Expenses: ₹${Math.round(row.expenses)} | Savings Rate: ${savingsRate}%. Top categories: ${topCatStr || 'None'}.`);

        logger.info({ userId: row.user_id, monthLabel, income: row.income, expenses: row.expenses }, 'Monthly digest sent');
      }
    } catch (err) {
      logger.error({ err }, 'Monthly digest job failed');
    }
  }

  function runMilestoneCheck() {
    try {
      // Batch: get net worth and txn count for all users in one query each
      const netWorths = db.prepare(`
        SELECT user_id,
          COALESCE(SUM(CASE WHEN type IN ('credit_card','loan') THEN -ABS(balance) ELSE balance END), 0) as net_worth
        FROM accounts WHERE is_active = 1 AND include_in_net_worth = 1
        GROUP BY user_id
      `).all();

      const txCounts = db.prepare(`
        SELECT user_id, COUNT(*) as cnt FROM transactions GROUP BY user_id
      `).all();
      const txCountMap = {};
      for (const row of txCounts) txCountMap[row.user_id] = row.cnt;

      const milestones = [100000, 500000, 1000000, 2500000, 5000000, 10000000];
      const txMilestones = [100, 500, 1000, 5000];

      for (const row of netWorths) {
        const nw = row.net_worth;

        // Net worth milestones (₹1L, 5L, 10L, 25L, 50L, 1Cr)
        for (const m of milestones) {
          if (nw >= m) {
            const label = m >= 10000000 ? `₹${m / 10000000}Cr` : `₹${m / 100000}L`;
            const existing = db.prepare(
              "SELECT id FROM notifications WHERE user_id = ? AND type = 'milestone' AND message LIKE ?"
            ).get(row.user_id, `%net worth crossed ${label}%`);
            if (!existing) {
              db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)')
                .run(row.user_id, 'milestone', 'Net Worth Milestone! 🎉',
                  `Congratulations! Your net worth crossed ${label}!`);
              logger.info({ userId: row.user_id, milestone: m }, 'Net worth milestone achieved');
            }
          }
        }

        // Transaction count milestones
        const txCount = txCountMap[row.user_id] || 0;
        for (const m of txMilestones) {
          if (txCount >= m) {
            const existing = db.prepare(
              "SELECT id FROM notifications WHERE user_id = ? AND type = 'milestone' AND message LIKE ?"
            ).get(row.user_id, `%${m}th transaction%`);
            if (!existing) {
              db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)')
                .run(row.user_id, 'milestone', 'Transaction Milestone! 📊',
                  `You've logged your ${m}th transaction! Consistent tracking is key to financial health.`);
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Milestone check job failed');
    }
  }

  function runBillReminderNotifications() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);

      // Batch: get all enabled reminders across all users in one query
      const reminders = db.prepare(`
        SELECT br.id, br.user_id, br.days_before, br.subscription_id, br.recurring_rule_id,
          s.name as sub_name, s.amount as sub_amount, s.currency as sub_currency,
          s.next_billing_date, s.is_active as sub_active,
          r.description as rule_name, r.amount as rule_amount, r.currency as rule_currency,
          r.next_date as rule_next_date, r.is_active as rule_active
        FROM bill_reminders br
        LEFT JOIN subscriptions s ON br.subscription_id = s.id
        LEFT JOIN recurring_rules r ON br.recurring_rule_id = r.id
        WHERE br.is_enabled = 1
      `).all();

      for (const rem of reminders) {
          let name, amount, currency, dueDate, isActive;

          if (rem.subscription_id) {
            name = rem.sub_name;
            amount = rem.sub_amount;
            currency = rem.sub_currency;
            dueDate = rem.next_billing_date;
            isActive = rem.sub_active;
          } else {
            name = rem.rule_name;
            amount = rem.rule_amount;
            currency = rem.rule_currency;
            dueDate = rem.rule_next_date;
            isActive = rem.rule_active;
          }

          // Skip inactive items or items without a due date
          if (!isActive || !dueDate) continue;

          // Check if within reminder window: due_date - days_before <= today
          const dueDateObj = new Date(dueDate + 'T00:00:00Z');
          const reminderDateObj = new Date(dueDateObj);
          reminderDateObj.setUTCDate(reminderDateObj.getUTCDate() - rem.days_before);
          const reminderDateStr = reminderDateObj.toISOString().slice(0, 10);

          if (reminderDateStr > todayStr) continue; // Not yet in window
          if (dueDate < todayStr) continue; // Already past due

          // Deduplicate: check if we already notified today for this item
          const existing = db.prepare(
            "SELECT id FROM notifications WHERE user_id = ? AND type = 'bill_upcoming' AND title LIKE ? AND created_at >= datetime('now', '-1 day')"
          ).get(rem.user_id, `%${name}%`);
          if (existing) continue;

          const daysUntil = Math.round((dueDateObj - new Date(todayStr + 'T00:00:00Z')) / 86400000);
          const dueLabel = daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;

          db.prepare(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
          ).run(
            rem.user_id,
            'bill_upcoming',
            `Bill Due: ${name}`,
            `${name} (${currency || 'INR'} ${amount}) is due ${dueLabel}.`
          );

          logger.info({ userId: rem.user_id, name, dueDate, daysUntil }, 'Bill reminder notification sent');
        }
    } catch (err) {
      logger.error({ err }, 'Bill reminder notification job failed');
    }
  }

  // ─── L1: Savings Challenge Auto-Tracking ───
  function runChallengeTracking() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const challenges = db.prepare(
        "SELECT * FROM savings_challenges WHERE is_active = 1 AND is_completed = 0 AND start_date <= ? AND end_date >= ?"
      ).all(todayStr, todayStr);

      for (const ch of challenges) {
        try {
          let progress = 0;
          let isComplete = false;

          if (ch.type === 'no_spend') {
            // Count expense transactions in the target category during the challenge period
            const query = ch.category_id
              ? 'SELECT COALESCE(SUM(amount), 0) as spent FROM transactions WHERE user_id = ? AND type = \'expense\' AND category_id = ? AND date >= ? AND date <= ?'
              : 'SELECT COALESCE(SUM(amount), 0) as spent FROM transactions WHERE user_id = ? AND type = \'expense\' AND date >= ? AND date <= ?';
            const params = ch.category_id
              ? [ch.user_id, ch.category_id, ch.start_date, todayStr]
              : [ch.user_id, ch.start_date, todayStr];
            const { spent } = db.prepare(query).get(...params);
            // For no-spend: target is 0, progress = target - spent (clamped)
            progress = Math.max(0, (ch.target_amount || 0) - spent);
            isComplete = spent === 0;
          } else if (ch.type === 'savings_target') {
            // Sum income - expense during challenge period
            const { income } = db.prepare(
              "SELECT COALESCE(SUM(amount), 0) as income FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ? AND date <= ?"
            ).get(ch.user_id, ch.start_date, todayStr);
            const { expenses } = db.prepare(
              "SELECT COALESCE(SUM(amount), 0) as expenses FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?"
            ).get(ch.user_id, ch.start_date, todayStr);
            progress = Math.max(0, income - expenses);
            isComplete = progress >= ch.target_amount;
          } else if (ch.type === 'reduce_category') {
            // Compare category spending to the 30 days before the challenge as baseline
            const baselineStart = new Date(new Date(ch.start_date + 'T00:00:00Z').getTime() - 30 * 86400000).toISOString().slice(0, 10);
            const { baseline } = db.prepare(
              "SELECT COALESCE(SUM(amount), 0) as baseline FROM transactions WHERE user_id = ? AND type = 'expense' AND category_id = ? AND date >= ? AND date < ?"
            ).get(ch.user_id, ch.category_id, baselineStart, ch.start_date);
            const { current } = db.prepare(
              "SELECT COALESCE(SUM(amount), 0) as current FROM transactions WHERE user_id = ? AND type = 'expense' AND category_id = ? AND date >= ? AND date <= ?"
            ).get(ch.user_id, ch.category_id, ch.start_date, todayStr);
            progress = Math.max(0, baseline - current);
            isComplete = ch.target_amount > 0 && progress >= ch.target_amount;
          }

          // Update challenge progress
          db.prepare(
            "UPDATE savings_challenges SET current_amount = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(Math.round(progress * 100) / 100, ch.id);

          if (isComplete) {
            db.prepare(
              "UPDATE savings_challenges SET is_completed = 1, is_active = 0, updated_at = datetime('now') WHERE id = ?"
            ).run(ch.id);
            db.prepare(
              'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
            ).run(ch.user_id, 'challenge_completed', 'Challenge Completed! 🏆',
              `Congratulations! You completed the "${ch.name}" challenge!`);
            logger.info({ userId: ch.user_id, challengeId: ch.id, name: ch.name }, 'Challenge completed');
          }

          // Log automation activity
          try {
            db.prepare(
              'INSERT INTO automation_log (user_id, automation_type, description, metadata) VALUES (?, ?, ?, ?)'
            ).run(ch.user_id, 'challenge_tracking', `Updated progress for "${ch.name}": ₹${Math.round(progress)}`, JSON.stringify({ challenge_id: ch.id, progress }));
          } catch { /* non-critical */ }
        } catch (err) {
          logger.error({ err, challengeId: ch.id }, 'Failed to track challenge');
        }
      }

      // Auto-deactivate expired challenges
      db.prepare(
        "UPDATE savings_challenges SET is_active = 0, updated_at = datetime('now') WHERE is_active = 1 AND end_date < ?"
      ).run(todayStr);
    } catch (err) {
      logger.error({ err }, 'Challenge tracking job failed');
    }
  }

  // ─── L2: Financial Todo Reminders ───
  function runTodoReminders() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      // Find todos due tomorrow or overdue (not completed/cancelled)
      const dueTodos = db.prepare(`
        SELECT * FROM financial_todos
        WHERE status IN ('pending', 'in_progress')
          AND due_date IS NOT NULL
          AND due_date <= ?
      `).all(tomorrowStr);

      for (const todo of dueTodos) {
        const isOverdue = todo.due_date < todayStr;
        const isDueTomorrow = todo.due_date === tomorrowStr;
        const isDueToday = todo.due_date === todayStr;

        // Dedup: one notification per todo per day
        const existing = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'todo_reminder' AND message LIKE ? AND created_at >= datetime('now', '-1 day')"
        ).get(todo.user_id, `%todo #${todo.id}%`);
        if (existing) continue;

        let title, message;
        if (isOverdue) {
          title = '⚠️ Overdue Todo';
          message = `"${todo.title}" (todo #${todo.id}) was due on ${todo.due_date} and is overdue.`;
        } else if (isDueToday) {
          title = '📋 Todo Due Today';
          message = `"${todo.title}" (todo #${todo.id}) is due today.`;
        } else if (isDueTomorrow) {
          title = '📋 Todo Due Tomorrow';
          message = `"${todo.title}" (todo #${todo.id}) is due tomorrow.`;
        } else {
          continue;
        }

        db.prepare(
          'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
        ).run(todo.user_id, 'todo_reminder', title, message, '/financial-todos');
        logger.info({ userId: todo.user_id, todoId: todo.id, dueDate: todo.due_date }, 'Todo reminder sent');
      }
    } catch (err) {
      logger.error({ err }, 'Todo reminder job failed');
    }
  }

  // ─── L3: Weekly Check-in Digest ───
  function runWeeklyDigest() {
    try {
      const now = new Date();
      // Only run on Sundays (day 0) — check within 24h window
      if (now.getUTCDay() !== 0) return;

      const weekEnd = now.toISOString().slice(0, 10);
      const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

      const summaries = db.prepare(`
        SELECT u.id as user_id,
          COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as expenses,
          COUNT(t.id) as tx_count
        FROM users u
        LEFT JOIN transactions t ON u.id = t.user_id AND t.date >= ? AND t.date <= ?
        GROUP BY u.id
      `).all(weekStart, weekEnd);

      for (const row of summaries) {
        // Check user preference
        const pref = db.prepare(
          "SELECT value FROM settings WHERE user_id = ? AND key = 'notify_weekly_digest'"
        ).get(row.user_id);
        if (pref && pref.value === '0') continue;

        // Dedup: one weekly digest per week
        const existing = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'weekly_digest' AND created_at >= datetime('now', '-6 days')"
        ).get(row.user_id);
        if (existing) continue;

        // Upcoming bills this week
        const upcomingBills = db.prepare(`
          SELECT COUNT(*) as count FROM recurring_rules
          WHERE user_id = ? AND is_active = 1 AND next_date >= ? AND next_date <= ?
        `).get(row.user_id, weekEnd, new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)).count;

        // Budget remaining
        const budgetInfo = db.prepare(`
          SELECT b.name, bi.amount as allocated,
            COALESCE((SELECT SUM(t2.amount) FROM transactions t2
              WHERE t2.user_id = ? AND t2.type = 'expense' AND t2.category_id = bi.category_id
              AND t2.date >= b.start_date AND t2.date <= b.end_date), 0) as spent
          FROM budgets b
          JOIN budget_items bi ON bi.budget_id = b.id
          WHERE b.user_id = ? AND b.is_active = 1 AND b.start_date <= ? AND b.end_date >= ?
          ORDER BY (CAST(spent AS REAL) / NULLIF(bi.amount, 0)) DESC LIMIT 3
        `).all(row.user_id, row.user_id, weekEnd, weekEnd);

        let budgetStr = '';
        if (budgetInfo.length > 0) {
          const items = budgetInfo.map(b => {
            const pct = b.allocated > 0 ? Math.round(b.spent / b.allocated * 100) : 0;
            return `${b.name}: ${pct}% used`;
          });
          budgetStr = ` Budget status: ${items.join(', ')}.`;
        }

        const savings = row.income - row.expenses;
        const message = `Week of ${weekStart}: ${row.tx_count} transactions. Income: ₹${Math.round(row.income)} | Spent: ₹${Math.round(row.expenses)} | Saved: ₹${Math.round(savings)}.${budgetStr} ${upcomingBills} bills upcoming this week.`;

        db.prepare(
          'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
        ).run(row.user_id, 'weekly_digest', '📊 Weekly Check-in', message);
        logger.info({ userId: row.user_id }, 'Weekly digest sent');
      }
    } catch (err) {
      logger.error({ err }, 'Weekly digest job failed');
    }
  }

  // ─── L4: Streak Tracking ───
  function runStreakCheck() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // Get all users who logged a transaction today
      const activeToday = db.prepare(`
        SELECT DISTINCT user_id FROM transactions WHERE date = ?
      `).all(todayStr);
      const activeTodaySet = new Set(activeToday.map(r => r.user_id));

      const allUsers = db.prepare('SELECT id FROM users').all();

      for (const user of allUsers) {
        const existing = db.prepare('SELECT * FROM streak_tracking WHERE user_id = ?').get(user.id);

        if (activeTodaySet.has(user.id)) {
          if (!existing) {
            db.prepare(
              'INSERT INTO streak_tracking (user_id, current_streak, longest_streak, last_activity_date) VALUES (?, 1, 1, ?)'
            ).run(user.id, todayStr);
          } else if (existing.last_activity_date === todayStr) {
            // Already recorded today
            continue;
          } else if (existing.last_activity_date === yesterdayStr) {
            // Consecutive day — extend streak
            const newStreak = existing.current_streak + 1;
            const longest = Math.max(newStreak, existing.longest_streak);
            db.prepare(
              "UPDATE streak_tracking SET current_streak = ?, longest_streak = ?, last_activity_date = ?, updated_at = datetime('now') WHERE user_id = ?"
            ).run(newStreak, longest, todayStr, user.id);

            // Streak milestones
            const streakMilestones = [7, 30, 60, 100, 365];
            if (streakMilestones.includes(newStreak)) {
              db.prepare(
                'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
              ).run(user.id, 'streak_milestone', `🔥 ${newStreak}-Day Streak!`,
                `Amazing! You've logged transactions ${newStreak} days in a row. Keep it up!`);
            }
          } else {
            // Streak broken, restart
            db.prepare(
              "UPDATE streak_tracking SET current_streak = 1, last_activity_date = ?, updated_at = datetime('now') WHERE user_id = ?"
            ).run(todayStr, user.id);
          }
        } else if (existing && existing.last_activity_date && existing.last_activity_date < yesterdayStr) {
          // Missed yesterday and no activity today — streak broken if was active
          if (existing.current_streak > 0) {
            db.prepare(
              "UPDATE streak_tracking SET current_streak = 0, updated_at = datetime('now') WHERE user_id = ?"
            ).run(user.id);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Streak check job failed');
    }
  }

  // ─── L5: Goal Deadline/Pace Warnings ───
  function runGoalPaceCheck() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const today = new Date(todayStr + 'T00:00:00Z');

      const goals = db.prepare(`
        SELECT * FROM savings_goals
        WHERE is_completed = 0 AND deadline IS NOT NULL AND deadline > ?
      `).all(todayStr);

      for (const goal of goals) {
        // Check user preference
        const pref = db.prepare(
          "SELECT value FROM settings WHERE user_id = ? AND key = 'notify_goal_pace'"
        ).get(goal.user_id);
        if (pref && pref.value === '0') continue;

        const deadline = new Date(goal.deadline + 'T00:00:00Z');
        const daysRemaining = Math.max(1, Math.floor((deadline - today) / 86400000));
        const amountRemaining = goal.target_amount - goal.current_amount;

        if (amountRemaining <= 0) continue; // Already met

        // Calculate needed daily rate
        const dailyNeeded = amountRemaining / daysRemaining;
        const monthlyNeeded = dailyNeeded * 30;

        // Calculate current pace from last 30 days of contributions
        const recentContribs = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total FROM goal_transactions
          WHERE goal_id = ? AND created_at >= datetime('now', '-30 days')
        `).get(goal.id).total;

        const currentMonthlyPace = recentContribs; // last 30 days = ~1 month

        // If behind pace by >20%, warn
        if (currentMonthlyPace < monthlyNeeded * 0.8 && amountRemaining > 100) {
          // Dedup: one warning per goal per week
          const existing = db.prepare(
            "SELECT id FROM notifications WHERE user_id = ? AND type = 'goal_pace_warning' AND message LIKE ? AND created_at >= datetime('now', '-7 days')"
          ).get(goal.user_id, `%${goal.name}%`);
          if (existing) continue;

          db.prepare(
            'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
          ).run(goal.user_id, 'goal_pace_warning', '📈 Goal Pace Alert',
            `"${goal.name}": At current pace, you may miss your deadline (${goal.deadline}). Need ₹${Math.round(monthlyNeeded)}/month, currently ₹${Math.round(currentMonthlyPace)}/month. Remaining: ₹${Math.round(amountRemaining)}.`,
            `/goals/${goal.id}`);
          logger.info({ userId: goal.user_id, goalId: goal.id, monthlyNeeded, currentPace: currentMonthlyPace }, 'Goal pace warning sent');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Goal pace check job failed');
    }
  }

  // ─── L6: Positive Reinforcement ───
  function runPositiveReinforcement() {
    try {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const thisMonthEnd = now.toISOString().slice(0, 10);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

      // Only run in last 3 days of month or first 3 days of next
      const dayOfMonth = now.getUTCDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (dayOfMonth > 3 && dayOfMonth < daysInMonth - 2) return;

      const users = db.prepare('SELECT id FROM users').all();

      for (const user of users) {
        // Dedup: one reinforcement per month
        const existing = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'positive_reinforcement' AND created_at >= ?"
        ).get(user.id, thisMonthStart);
        if (existing) continue;

        const thisMonth = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
          FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?
        `).get(user.id, thisMonthStart, thisMonthEnd);

        const prevMonth = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
          FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?
        `).get(user.id, prevMonthStart, prevMonthEnd);

        if (thisMonth.income === 0 && thisMonth.expenses === 0) continue;

        const celebrations = [];

        // Better savings rate
        const thisRate = thisMonth.income > 0 ? (thisMonth.income - thisMonth.expenses) / thisMonth.income : 0;
        const prevRate = prevMonth.income > 0 ? (prevMonth.income - prevMonth.expenses) / prevMonth.income : 0;
        if (thisRate > prevRate && thisRate > 0.1) {
          celebrations.push(`savings rate improved to ${Math.round(thisRate * 100)}%`);
        }

        // Lower spending
        if (prevMonth.expenses > 0 && thisMonth.expenses < prevMonth.expenses * 0.9) {
          const reduction = Math.round(((prevMonth.expenses - thisMonth.expenses) / prevMonth.expenses) * 100);
          celebrations.push(`spending decreased by ${reduction}%`);
        }

        // Check budget adherence — under in majority of categories
        const budgetItems = db.prepare(`
          SELECT bi.amount as allocated,
            COALESCE((SELECT SUM(t.amount) FROM transactions t
              WHERE t.user_id = ? AND t.type = 'expense' AND t.category_id = bi.category_id
              AND t.date >= b.start_date AND t.date <= b.end_date), 0) as spent
          FROM budgets b JOIN budget_items bi ON bi.budget_id = b.id
          WHERE b.user_id = ? AND b.is_active = 1 AND b.start_date <= ? AND b.end_date >= ?
        `).all(user.id, user.id, thisMonthEnd, thisMonthStart);

        if (budgetItems.length > 0) {
          const underBudget = budgetItems.filter(bi => bi.spent <= bi.allocated).length;
          if (underBudget >= Math.ceil(budgetItems.length * 0.7)) {
            celebrations.push(`stayed under budget in ${underBudget}/${budgetItems.length} categories`);
          }
        }

        if (celebrations.length > 0) {
          db.prepare(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
          ).run(user.id, 'positive_reinforcement', '🎉 Great Job This Month!',
            `Wins: ${celebrations.join(', ')}. Keep up the great financial habits!`);
          logger.info({ userId: user.id, celebrations }, 'Positive reinforcement sent');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Positive reinforcement job failed');
    }
  }

  // ─── F3: Subscription Audit ───
  function runSubscriptionAudit() {
    try {
      const now = new Date();
      // Only run on 1st of the month
      if (now.getUTCDate() !== 1) return;

      const users = db.prepare('SELECT id FROM users').all();

      for (const user of users) {
        // Dedup: one audit per month
        const existing = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'subscription_audit' AND created_at >= datetime('now', '-28 days')"
        ).get(user.id);
        if (existing) continue;

        const subs = db.prepare(
          'SELECT name, amount, currency, frequency FROM subscriptions WHERE user_id = ? AND is_active = 1'
        ).all(user.id);

        const recurring = db.prepare(
          "SELECT description as name, amount, currency, frequency FROM recurring_rules WHERE user_id = ? AND is_active = 1 AND type = 'expense'"
        ).all(user.id);

        // Normalize to monthly cost
        function toMonthly(amount, frequency) {
          switch (frequency) {
            case 'weekly': return amount * 4.33;
            case 'biweekly': return amount * 2.17;
            case 'monthly': return amount;
            case 'quarterly': return amount / 3;
            case 'yearly': return amount / 12;
            default: return amount;
          }
        }

        const allRecurring = [...subs, ...recurring];
        if (allRecurring.length === 0) continue;

        const totalMonthly = allRecurring.reduce((sum, item) => sum + toMonthly(item.amount, item.frequency), 0);
        const itemList = allRecurring
          .sort((a, b) => toMonthly(b.amount, b.frequency) - toMonthly(a.amount, a.frequency))
          .slice(0, 5)
          .map(item => `${item.name}: ₹${Math.round(toMonthly(item.amount, item.frequency))}/mo`)
          .join(', ');

        db.prepare(
          'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
        ).run(user.id, 'subscription_audit', '📑 Monthly Subscription Review',
          `You have ${allRecurring.length} recurring expenses totaling ₹${Math.round(totalMonthly)}/month. Top: ${itemList}. Review for any you can cancel?`,
          '/subscriptions');
        logger.info({ userId: user.id, count: allRecurring.length, totalMonthly: Math.round(totalMonthly) }, 'Subscription audit sent');
      }
    } catch (err) {
      logger.error({ err }, 'Subscription audit job failed');
    }
  }

  // ─── F4: Spending Trend Detection ───
  function runSpendingTrendDetection() {
    try {
      const now = new Date();
      // Monthly check
      const months = [];
      for (let i = 0; i < 3; i++) {
        const start = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i, 0);
        months.push({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: start.toLocaleString('en', { month: 'short' }) });
      }

      const users = db.prepare('SELECT id FROM users').all();

      for (const user of users) {
        const categories = db.prepare(
          'SELECT DISTINCT c.id, c.name FROM transactions t JOIN categories c ON t.category_id = c.id WHERE t.user_id = ? AND t.type = \'expense\' AND t.date >= ?'
        ).all(user.id, months[2].start);

        for (const cat of categories) {
          const monthlySpending = months.map(m => {
            const { total } = db.prepare(
              'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = \'expense\' AND category_id = ? AND date >= ? AND date <= ?'
            ).get(user.id, cat.id, m.start, m.end);
            return total;
          });

          // Check for 3-month increasing trend (>25% increase from first to last)
          // months[0] = most recent, months[2] = 3 months ago
          const oldest = monthlySpending[2];
          const newest = monthlySpending[0];
          const middle = monthlySpending[1];

          if (oldest > 100 && middle > oldest && newest > middle && newest > oldest * 1.25) {
            const increasePercent = Math.round(((newest - oldest) / oldest) * 100);

            // Dedup: one trend alert per category per month
            const existing = db.prepare(
              "SELECT id FROM notifications WHERE user_id = ? AND type = 'spending_trend' AND message LIKE ? AND created_at >= datetime('now', '-28 days')"
            ).get(user.id, `%${cat.name}%`);
            if (existing) continue;

            db.prepare(
              'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
            ).run(user.id, 'spending_trend', '📈 Spending Trend Alert',
              `${cat.name} spending has increased ${increasePercent}% over 3 months: ₹${Math.round(oldest)} → ₹${Math.round(middle)} → ₹${Math.round(newest)}. Is this intentional?`,
              '/transactions?category=' + cat.id);
            logger.info({ userId: user.id, category: cat.name, increasePercent }, 'Spending trend alert sent');
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Spending trend detection job failed');
    }
  }

  // ─── A3: Balance Threshold Check (Scheduler companion) ───
  function runBalanceThresholdCheck() {
    try {
      const alerts = db.prepare(`
        SELECT ba.*, a.balance as current_balance, a.name as account_name
        FROM balance_alerts ba
        JOIN accounts a ON ba.account_id = a.id
        WHERE ba.is_enabled = 1
      `).all();

      for (const alert of alerts) {
        const triggered = alert.direction === 'below'
          ? alert.current_balance < alert.threshold_amount
          : alert.current_balance > alert.threshold_amount;

        if (!triggered) continue;

        // Dedup: don't re-trigger within 24h
        if (alert.last_triggered_at) {
          const lastTriggered = new Date(alert.last_triggered_at).getTime();
          if (Date.now() - lastTriggered < 24 * 3600000) continue;
        }

        const dirLabel = alert.direction === 'below' ? 'dropped below' : 'exceeded';
        db.prepare(
          'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
        ).run(alert.user_id, 'balance_alert', '💰 Balance Alert',
          `${alert.account_name} balance (₹${Math.round(alert.current_balance * 100) / 100}) has ${dirLabel} your threshold of ₹${alert.threshold_amount}.`,
          '/accounts');

        db.prepare("UPDATE balance_alerts SET last_triggered_at = datetime('now') WHERE id = ?").run(alert.id);
        logger.info({ userId: alert.user_id, account: alert.account_name, balance: alert.current_balance, threshold: alert.threshold_amount }, 'Balance threshold alert sent');
      }
    } catch (err) {
      logger.error({ err }, 'Balance threshold check job failed');
    }
  }

  function runScheduledBackup() {
    const config = require('./config');
    const backupPath = require('path').join(config.dbDir, 'backups');
    const { createBackup, rotateBackups } = require('./services/backup');
    createBackup(db, backupPath)
      .then((result) => {
        if (result && result.skipped) { logger.info({ reason: result.reason }, 'Scheduled backup skipped'); return; }
        const deleted = rotateBackups(backupPath, config.backup.retainCount);
        logger.info({ backup: result.filename, rotated: deleted.length }, 'Scheduled backup completed');

        // Update data watermark after successful backup
        try {
          const users = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
          const txns = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get().cnt;
          const accounts = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get().cnt;
          db.prepare(`
            UPDATE _data_watermark SET
              peak_users = MAX(peak_users, ?),
              peak_transactions = MAX(peak_transactions, ?),
              peak_accounts = MAX(peak_accounts, ?),
              last_updated = datetime('now')
            WHERE id = 1
          `).run(users, txns, accounts);
        } catch (err) {
          logger.error({ err }, 'Failed to update data watermark');
        }
      })
      .catch(err => logger.error({ err }, 'Scheduled backup failed'));
  }

  function runNetWorthSnapshot() {
    try {
      const users = db.prepare('SELECT id FROM users').all();
      for (const user of users) {
        const today = new Date().toISOString().slice(0, 10);
        // Check if snapshot already exists today
        const existing = db.prepare('SELECT id FROM net_worth_snapshots WHERE user_id = ? AND date = ?').get(user.id, today);
        if (existing) continue;

        const accounts = db.prepare(
          'SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 AND include_in_net_worth = 1'
        ).all(user.id);

        let totalAssets = 0;
        let totalLiabilities = 0;
        for (const a of accounts) {
          if (a.type === 'credit_card' || a.type === 'loan') {
            totalLiabilities += Math.abs(a.balance);
          } else {
            totalAssets += a.balance;
          }
        }
        const netWorth = totalAssets - totalLiabilities;
        const breakdown = JSON.stringify(accounts.map(a => ({ id: a.id, name: a.name, balance: a.balance })));

        db.prepare(
          'INSERT INTO net_worth_snapshots (user_id, date, total_assets, total_liabilities, net_worth, breakdown) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(user.id, today, totalAssets, totalLiabilities, netWorth, breakdown);

        logger.info({ userId: user.id, netWorth }, 'Net worth snapshot recorded');
      }
    } catch (err) {
      logger.error({ err }, 'Net worth snapshot job failed');
    }
  }

  function runHealthScoreSnapshot() {
    try {
      const createHealthService = require('./services/health.service');
      const healthService = createHealthService();
      const users = db.prepare('SELECT id FROM users').all();
      const today = new Date().toISOString().slice(0, 10);

      for (const user of users) {
        // Skip if already have a score for today
        const existing = db.prepare('SELECT id FROM financial_health_scores WHERE user_id = ? AND date = ?').get(user.id, today);
        if (existing) continue;

        // Need 30+ days of data
        const txnCount = db.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ? AND date >= date('now', '-30 days')").get(user.id).cnt;
        if (txnCount < 5) continue;

        // Calculate basic ratios
        const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1').all(user.id);
        let savingsBalance = 0, liabilities = 0;
        for (const a of accounts) {
          if (a.type === 'savings') savingsBalance += a.balance;
          if (a.type === 'credit_card' || a.type === 'loan') liabilities += Math.abs(a.balance);
        }
        const incomeData = db.prepare("SELECT COALESCE(SUM(amount), 0) as total, COUNT(DISTINCT strftime('%Y-%m', date)) as months FROM transactions WHERE user_id = ? AND type = 'income' AND date >= date('now', '-6 months')").get(user.id);
        const expenseData = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= date('now', '-6 months')").get(user.id);
        const months = Math.max(1, incomeData.months);
        const avgIncome = incomeData.total / months;
        const avgExpense = expenseData.total / months;

        const ratios = healthService.calculateRatios({ savingsBalance, avgMonthlyExpense: avgExpense, avgMonthlyIncome: avgIncome, liabilities });
        const score = healthService.calculateScore(ratios);
        const savingsRate = ratios.savingsRate;
        const dti = ratios.debtToIncome;
        const efMonths = ratios.emergencyFundMonths;

        // Budget adherence
        let budgetAdherence = null;
        try {
          const budgetItems = db.prepare(`
            SELECT bi.amount as allocated, COALESCE(SUM(t.amount), 0) as spent
            FROM budget_items bi
            JOIN budgets b ON bi.budget_id = b.id
            LEFT JOIN transactions t ON t.category_id = bi.category_id AND t.user_id = ? AND t.type = 'expense'
              AND t.date >= b.start_date AND t.date <= COALESCE(b.end_date, date('now'))
            WHERE b.user_id = ? AND b.is_active = 1
            GROUP BY bi.id
          `).all(user.id, user.id);
          budgetAdherence = healthService.calculateBudgetAdherence(budgetItems);
        } catch { /* non-critical */ }

        db.prepare(`
          INSERT OR REPLACE INTO financial_health_scores (user_id, date, overall_score, savings_rate, debt_to_income, emergency_fund_months, budget_adherence, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, today, score, savingsRate, dti, efMonths, budgetAdherence, JSON.stringify({ ratios }));

        logger.info({ userId: user.id, score, savingsRate: Math.round(savingsRate) }, 'Health score snapshot recorded');
      }
    } catch (err) {
      logger.error({ err }, 'Health score snapshot job failed');
    }
  }

  function registerBuiltinJobs() {
    const config = require('./config');
    register('cleanup', 6 * 3600000, runCleanup);
    register('recurring-spawn', 3600000, spawnDueRecurring);
    register('net-worth-snapshot', 24 * 3600000, runNetWorthSnapshot);
    register('health-score-snapshot', 24 * 3600000, runHealthScoreSnapshot);
    register('inactivity-nudge', 24 * 3600000, runInactivityNudge);
    register('monthly-digest', 24 * 3600000, runMonthlyDigest);
    register('milestone-check', 6 * 3600000, runMilestoneCheck);
    register('rate-limit-cleanup', 3600000, runRateLimitCleanup);
    register('scheduled-backup', config.backup.intervalHours * 3600000, runScheduledBackup);
    register('bill-reminder-notify', 12 * 3600000, runBillReminderNotifications);
    // New automation jobs
    register('challenge-tracking', 6 * 3600000, runChallengeTracking);
    register('todo-reminders', 12 * 3600000, runTodoReminders);
    register('weekly-digest', 24 * 3600000, runWeeklyDigest);
    register('streak-check', 12 * 3600000, runStreakCheck);
    register('goal-pace-check', 24 * 3600000, runGoalPaceCheck);
    register('positive-reinforcement', 24 * 3600000, runPositiveReinforcement);
    register('subscription-audit', 24 * 3600000, runSubscriptionAudit);
    register('spending-trend-detection', 24 * 3600000, runSpendingTrendDetection);
    register('balance-threshold-check', 6 * 3600000, runBalanceThresholdCheck);
  }

  return {
    register, registerBuiltinJobs, start, stop, advanceDate,
    spawnDueRecurring, runCleanup, runNetWorthSnapshot, runHealthScoreSnapshot, runBillReminderNotifications,
    runChallengeTracking, runTodoReminders, runWeeklyDigest, runStreakCheck,
    runGoalPaceCheck, runPositiveReinforcement, runSubscriptionAudit, runSpendingTrendDetection, runBalanceThresholdCheck,
  };
};
