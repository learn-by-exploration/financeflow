/**
 * Lightweight background job scheduler.
 * Registers jobs with intervals and runs them on a timer.
 * Built-in jobs: session/audit cleanup, recurring transaction spawning.
 */
module.exports = function createScheduler(db, logger) {
  const jobs = [];

  function register(name, intervalMs, fn) {
    jobs.push({ name, intervalMs, fn, timer: null });
  }

  function start() {
    for (const job of jobs) {
      job.fn();
      job.timer = setInterval(() => {
        try { job.fn(); } catch (err) { logger.error({ err, job: job.name }, 'Scheduler job failed'); }
      }, job.intervalMs);
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

    const spawnTx = db.transaction(() => {
      for (const rule of rules) {
        // Check if end_date has passed
        if (rule.end_date && rule.end_date < todayStr) {
          db.prepare('UPDATE recurring_rules SET is_active = 0 WHERE id = ?').run(rule.id);
          continue;
        }

        // Create transaction
        db.prepare(`
          INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, payee, date, is_recurring, recurring_rule_id, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '[]')
        `).run(rule.user_id, rule.account_id, rule.category_id, rule.type, rule.amount,
          rule.currency, rule.description, rule.payee, todayStr, rule.id);

        // Update account balance
        const balanceChange = rule.type === 'income' ? rule.amount : -rule.amount;
        db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
          .run(balanceChange, rule.account_id, rule.user_id);

        // Advance next_date
        const nextDate = advanceDate(rule.next_date, rule.frequency);
        db.prepare('UPDATE recurring_rules SET next_date = ? WHERE id = ?').run(nextDate, rule.id);

        logger.info({ ruleId: rule.id, description: rule.description, nextDate }, 'Spawned recurring transaction');
      }
    });
    spawnTx();
  }

  function runCleanup() {
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
  }

  function registerBuiltinJobs() {
    register('cleanup', 6 * 3600000, runCleanup);
    register('recurring-spawn', 3600000, spawnDueRecurring);
  }

  return { register, registerBuiltinJobs, start, stop, spawnDueRecurring, runCleanup, advanceDate };
};
