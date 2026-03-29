const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, makeAccount, makeRecurringRule } = require('./helpers');

describe('Recurring Transactions & Scheduler', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  function getScheduler() {
    const { db } = setup();
    const logger = { info: () => {}, error: () => {}, warn: () => {} };
    return require('../src/scheduler')(db, logger);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  describe('Recurring transaction spawn', () => {
    it('spawns transaction when next_date = today', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: today(), amount: 5000, description: 'Monthly rent' });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const txns = db.prepare('SELECT * FROM transactions WHERE recurring_rule_id = ?').all(rule.id);
      assert.equal(txns.length, 1);
      assert.equal(txns[0].amount, 5000);
      assert.equal(txns[0].description, 'Monthly rent');
    });

    it('spawns transaction when next_date is in the past (catches up)', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: daysAgo(3), amount: 1000 });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const txns = db.prepare('SELECT * FROM transactions WHERE recurring_rule_id = ?').all(rule.id);
      assert.ok(txns.length >= 1);
    });

    it('does NOT spawn when next_date is in the future', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      makeRecurringRule(acct.id, { next_date: daysFromNow(5), amount: 1000 });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const txns = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(1);
      assert.equal(txns.length, 0);
    });

    it('spawned transaction has correct fields', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, {
        next_date: today(), amount: 2500, type: 'expense',
        description: 'Netflix', frequency: 'monthly'
      });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const txn = db.prepare('SELECT * FROM transactions WHERE recurring_rule_id = ?').get(rule.id);
      assert.equal(txn.amount, 2500);
      assert.equal(txn.type, 'expense');
      assert.equal(txn.description, 'Netflix');
      assert.equal(txn.account_id, acct.id);
      assert.equal(txn.is_recurring, 1);
    });

    it('spawned transaction updates account balance', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      makeRecurringRule(acct.id, { next_date: today(), amount: 5000, type: 'expense' });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      assert.equal(updated.balance, 95000);
    });

    it('advances next_date correctly for daily frequency', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: today(), frequency: 'daily' });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const updated = db.prepare('SELECT next_date FROM recurring_rules WHERE id = ?').get(rule.id);
      assert.equal(updated.next_date, daysFromNow(1));
    });

    it('advances next_date correctly for weekly frequency', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: today(), frequency: 'weekly' });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const updated = db.prepare('SELECT next_date FROM recurring_rules WHERE id = ?').get(rule.id);
      assert.equal(updated.next_date, daysFromNow(7));
    });

    it('advances next_date correctly for monthly frequency', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: today(), frequency: 'monthly' });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const updated = db.prepare('SELECT next_date FROM recurring_rules WHERE id = ?').get(rule.id);
      const expected = new Date();
      expected.setMonth(expected.getMonth() + 1);
      assert.equal(updated.next_date, expected.toISOString().slice(0, 10));
    });

    it('advances next_date correctly for quarterly frequency', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: today(), frequency: 'quarterly' });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const updated = db.prepare('SELECT next_date FROM recurring_rules WHERE id = ?').get(rule.id);
      const expected = new Date();
      expected.setMonth(expected.getMonth() + 3);
      assert.equal(updated.next_date, expected.toISOString().slice(0, 10));
    });

    it('advances next_date correctly for yearly frequency', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: today(), frequency: 'yearly' });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const updated = db.prepare('SELECT next_date FROM recurring_rules WHERE id = ?').get(rule.id);
      const expected = new Date();
      expected.setFullYear(expected.getFullYear() + 1);
      assert.equal(updated.next_date, expected.toISOString().slice(0, 10));
    });

    it('skips inactive rules (is_active=0)', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      makeRecurringRule(acct.id, { next_date: today(), is_active: 0 });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const txns = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(1);
      assert.equal(txns.length, 0);
    });

    it('deactivates rule when end_date has passed', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 100000 });
      const rule = makeRecurringRule(acct.id, { next_date: today(), end_date: daysAgo(1) });
      const scheduler = getScheduler();
      scheduler.spawnDueRecurring();
      const txns = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(1);
      assert.equal(txns.length, 0);
      const updated = db.prepare('SELECT is_active FROM recurring_rules WHERE id = ?').get(rule.id);
      assert.equal(updated.is_active, 0);
    });
  });

  describe('Session cleanup', () => {
    it('deletes sessions older than 30 days', () => {
      const { db } = setup();
      // Create an old session
      db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (1, 'old-token', datetime('now', '-31 days'))").run();
      // Create a fresh session
      db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (1, 'new-token', datetime('now', '+1 day'))").run();
      const scheduler = getScheduler();
      scheduler.runCleanup();
      const sessions = db.prepare('SELECT token FROM sessions').all();
      const tokens = sessions.map(s => s.token);
      assert.ok(!tokens.includes('old-token'));
      assert.ok(tokens.includes('new-token'));
    });
  });

  describe('Audit log cleanup', () => {
    it('deletes audit_log entries older than 90 days', () => {
      const { db } = setup();
      // Create an old audit entry
      db.prepare("INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (1, 'test.old', 'test', 1, datetime('now', '-91 days'))").run();
      // Create a recent audit entry
      db.prepare("INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (1, 'test.new', 'test', 2, datetime('now'))").run();
      const scheduler = getScheduler();
      scheduler.runCleanup();
      const entries = db.prepare('SELECT action FROM audit_log').all();
      const actions = entries.map(e => e.action);
      assert.ok(!actions.includes('test.old'));
      assert.ok(actions.includes('test.new'));
    });
  });
});
