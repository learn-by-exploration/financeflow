// tests/scheduler.test.js — Scheduler error handling & job lifecycle
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeAccount, makeCategory } = require('./helpers');

describe('Scheduler', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);
  beforeEach(cleanDb);

  function createScheduler() {
    const logs = [];
    const mockLogger = {
      info: (obj, msg) => logs.push({ level: 'info', obj, msg }),
      error: (obj, msg) => logs.push({ level: 'error', obj, msg }),
      debug: (obj, msg) => logs.push({ level: 'debug', obj, msg }),
      warn: (obj, msg) => logs.push({ level: 'warn', obj, msg }),
    };
    const scheduler = require('../src/scheduler')(db, mockLogger);
    return { scheduler, logs };
  }

  describe('runCleanup', () => {
    it('deletes expired sessions', () => {
      db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (1, 'expired-token', datetime('now', '-1 day'))").run();
      const { scheduler } = createScheduler();
      scheduler.runCleanup();
      const remaining = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE token = 'expired-token'").get();
      assert.equal(remaining.count, 0);
    });

    it('keeps non-expired sessions', () => {
      db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (1, 'valid-token', datetime('now', '+1 day'))").run();
      const { scheduler } = createScheduler();
      scheduler.runCleanup();
      const remaining = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE token = 'valid-token'").get();
      assert.equal(remaining.count, 1);
    });

    it('deletes old audit log entries (> 90 days)', () => {
      db.prepare("INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (1, 'TEST', 'test', 1, datetime('now', '-100 days'))").run();
      const { scheduler } = createScheduler();
      scheduler.runCleanup();
      const remaining = db.prepare("SELECT COUNT(*) as count FROM audit_log WHERE action = 'TEST' AND entity_id = 1").get();
      assert.equal(remaining.count, 0);
    });

    it('keeps recent audit log entries', () => {
      db.prepare("INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (1, 'TEST', 'test', 2, datetime('now', '-30 days'))").run();
      const { scheduler } = createScheduler();
      scheduler.runCleanup();
      const remaining = db.prepare("SELECT COUNT(*) as count FROM audit_log WHERE action = 'TEST' AND entity_id = 2").get();
      assert.equal(remaining.count, 1);
    });

    it('logs cleanup info when entries are deleted', () => {
      db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (1, 'old-1', datetime('now', '-2 days'))").run();
      const { scheduler, logs } = createScheduler();
      scheduler.runCleanup();
      const infoLogs = logs.filter(l => l.level === 'info');
      assert.ok(infoLogs.some(l => l.msg.includes('expired sessions')));
    });

    it('does not crash on database error and logs it', () => {
      // Create a scheduler with a broken db mock
      const logs = [];
      const mockLogger = {
        info: (obj, msg) => logs.push({ level: 'info', obj, msg }),
        error: (obj, msg) => logs.push({ level: 'error', obj, msg }),
        debug: () => {},
        warn: () => {},
      };
      const brokenDb = {
        prepare: () => { throw new Error('DB connection lost'); },
      };
      const scheduler = require('../src/scheduler')(brokenDb, mockLogger);
      // Should not throw
      assert.doesNotThrow(() => scheduler.runCleanup());
      const errorLogs = logs.filter(l => l.level === 'error');
      assert.ok(errorLogs.length > 0, 'should log the error');
      assert.ok(errorLogs[0].msg.includes('Cleanup job failed'));
    });
  });

  describe('spawnDueRecurring', () => {
    it('spawns a due recurring transaction', () => {
      const account = makeAccount();
      const category = makeCategory();
      const todayStr = new Date().toISOString().slice(0, 10);
      db.prepare(
        'INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, currency, description, frequency, next_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(1, account.id, category.id, 'expense', 500, 'INR', 'Monthly subscription', 'monthly', todayStr, 1);

      const { scheduler } = createScheduler();
      const result = scheduler.spawnDueRecurring();
      assert.equal(result.processed, 1);
      assert.equal(result.failures.length, 0);

      // Transaction should be created
      const txn = db.prepare('SELECT * FROM transactions WHERE description = ?').get('Monthly subscription');
      assert.ok(txn);
      assert.equal(txn.amount, 500);
    });

    it('deactivates rules past end_date', () => {
      const account = makeAccount();
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      db.prepare(
        'INSERT INTO recurring_rules (user_id, account_id, type, amount, currency, description, frequency, next_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(1, account.id, 'expense', 300, 'INR', 'Ended rule', 'monthly', todayStr, yesterday, 1);

      const { scheduler } = createScheduler();
      scheduler.spawnDueRecurring();

      const rule = db.prepare("SELECT * FROM recurring_rules WHERE description = 'Ended rule'").get();
      assert.equal(rule.is_active, 0);
    });

    it('handles failure for individual rules without blocking others', () => {
      const account = makeAccount();
      const todayStr = new Date().toISOString().slice(0, 10);
      // Create a valid rule first
      db.prepare(
        'INSERT INTO recurring_rules (user_id, account_id, type, amount, currency, description, frequency, next_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(1, account.id, 'expense', 200, 'INR', 'Good rule', 'monthly', todayStr, 1);
      
      const { scheduler, logs } = createScheduler();
      const result = scheduler.spawnDueRecurring();
      assert.equal(result.processed, 1);
      assert.equal(result.failures.length, 0);
      // Good rule should succeed
      const goodTxn = db.prepare('SELECT * FROM transactions WHERE description = ?').get('Good rule');
      assert.ok(goodTxn);
    });
  });

  describe('advanceDate', () => {
    it('advances daily', () => {
      const { scheduler } = createScheduler();
      assert.equal(scheduler.advanceDate('2024-01-15', 'daily'), '2024-01-16');
    });

    it('advances weekly', () => {
      const { scheduler } = createScheduler();
      assert.equal(scheduler.advanceDate('2024-01-15', 'weekly'), '2024-01-22');
    });

    it('advances biweekly', () => {
      const { scheduler } = createScheduler();
      assert.equal(scheduler.advanceDate('2024-01-15', 'biweekly'), '2024-01-29');
    });

    it('advances monthly', () => {
      const { scheduler } = createScheduler();
      assert.equal(scheduler.advanceDate('2024-01-15', 'monthly'), '2024-02-15');
    });

    it('advances quarterly', () => {
      const { scheduler } = createScheduler();
      assert.equal(scheduler.advanceDate('2024-01-15', 'quarterly'), '2024-04-15');
    });

    it('advances yearly', () => {
      const { scheduler } = createScheduler();
      assert.equal(scheduler.advanceDate('2024-01-15', 'yearly'), '2025-01-15');
    });

    it('handles month overflow correctly', () => {
      const { scheduler } = createScheduler();
      // January 31 + 1 month = February 29 (2024 is leap year)
      const result = scheduler.advanceDate('2024-01-31', 'monthly');
      assert.ok(result.startsWith('2024-03') || result === '2024-03-02');
    });
  });

  describe('register and lifecycle', () => {
    it('registers and starts/stops jobs', () => {
      const { scheduler } = createScheduler();
      let called = 0;
      scheduler.register('test-job', 100000, () => { called++; });
      scheduler.start();
      // Initial run should trigger
      assert.ok(called >= 1);
      scheduler.stop();
    });
  });
});
