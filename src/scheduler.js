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
      try { job.fn(); } catch (err) { logger.error({ err, job: job.name }, 'Scheduler job failed on initial run'); }
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

  function registerBuiltinJobs() {
    const config = require('./config');
    register('cleanup', 6 * 3600000, runCleanup);
    register('recurring-spawn', 3600000, spawnDueRecurring);
    register('net-worth-snapshot', 24 * 3600000, runNetWorthSnapshot);
    register('rate-limit-cleanup', 3600000, runRateLimitCleanup);
    register('scheduled-backup', config.backup.intervalHours * 3600000, runScheduledBackup);
  }

  return { register, registerBuiltinJobs, start, stop, spawnDueRecurring, runCleanup, runNetWorthSnapshot, advanceDate };
};
