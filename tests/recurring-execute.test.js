// tests/recurring-execute.test.js — Bill pay automation / execute-now tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeRecurringRule, rawAgent } = require('./helpers');

describe('Recurring Execute-Now (Bill Pay Automation)', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);
  beforeEach(cleanDb);

  describe('POST /api/recurring/:id/execute-now', () => {
    it('creates a transaction from recurring rule', async () => {
      const account = makeAccount({ balance: 50000 });
      const category = makeCategory({ name: 'Rent', type: 'expense' });
      const rule = makeRecurringRule(account.id, {
        type: 'expense', amount: 15000, category_id: category.id,
        description: 'Monthly Rent', frequency: 'monthly',
      });

      const res = await agent().post(`/api/recurring/${rule.id}/execute-now`);
      assert.equal(res.status, 201);
      assert.ok(res.body.transaction);
      assert.equal(res.body.transaction.amount, 15000);
      assert.equal(res.body.transaction.description, 'Monthly Rent');
      assert.equal(res.body.transaction.is_recurring, 1);
      assert.equal(res.body.transaction.recurring_rule_id, rule.id);
    });

    it('updates account balance for expense', async () => {
      const account = makeAccount({ balance: 50000 });
      const rule = makeRecurringRule(account.id, {
        type: 'expense', amount: 10000, description: 'Bill',
      });

      await agent().post(`/api/recurring/${rule.id}/execute-now`);

      const updatedAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
      assert.equal(updatedAccount.balance, 40000);
    });

    it('updates account balance for income', async () => {
      const account = makeAccount({ balance: 50000 });
      const rule = makeRecurringRule(account.id, {
        type: 'income', amount: 30000, description: 'Salary',
      });

      await agent().post(`/api/recurring/${rule.id}/execute-now`);

      const updatedAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
      assert.equal(updatedAccount.balance, 80000);
    });

    it('returns 404 for non-existent rule', async () => {
      const res = await agent().post('/api/recurring/99999/execute-now');
      assert.equal(res.status, 404);
    });

    it('returns 401 for unauthenticated request', async () => {
      const res = await rawAgent().post('/api/recurring/1/execute-now');
      assert.equal(res.status, 401);
    });

    it('creates audit log entry', async () => {
      const account = makeAccount({ balance: 50000 });
      const rule = makeRecurringRule(account.id, {
        type: 'expense', amount: 1000, description: 'Test',
      });

      await agent().post(`/api/recurring/${rule.id}/execute-now`);

      const auditEntry = db.prepare(
        "SELECT * FROM audit_log WHERE action = 'recurring.execute' AND entity_id = ?"
      ).get(rule.id);
      assert.ok(auditEntry);
    });

    it('sets today as the transaction date', async () => {
      const account = makeAccount({ balance: 50000 });
      const rule = makeRecurringRule(account.id, {
        type: 'expense', amount: 500, description: 'Quick pay',
      });

      const res = await agent().post(`/api/recurring/${rule.id}/execute-now`);
      const todayStr = new Date().toISOString().slice(0, 10);
      assert.equal(res.body.transaction.date, todayStr);
    });
  });
});
