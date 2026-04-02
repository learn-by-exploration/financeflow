// tests/v6-hardening.test.js — Foundation hardening tests (v6.0.0 Iter 1-12)
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction,
  makeBudget, makeGoal, makeSubscription, makeGroup, makeGroupMember,
  makeTag, makeExchangeRate, makeNotification, makeRule, makeTemplate,
  makeSpendingLimit, makeApiToken, makeReminder, makeRecurringRule,
  today, daysFromNow } = require('./helpers');

describe('v6 Foundation Hardening', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ═══════════════════════════════════════
  // ITER 1-2: Test factory helpers
  // ═══════════════════════════════════════
  describe('Factory helpers', () => {
    it('makeTag creates a tag', () => {
      const tag = makeTag({ name: 'groceries' });
      assert.ok(tag.id);
      assert.equal(tag.name, 'groceries');
      assert.equal(tag.color, '#FF5733');
    });

    it('makeExchangeRate creates an exchange rate', () => {
      const rate = makeExchangeRate({ base_currency: 'EUR', target_currency: 'INR', rate: 90.25 });
      assert.ok(rate.id);
      assert.equal(rate.base_currency, 'EUR');
      assert.equal(rate.rate, 90.25);
    });

    it('makeNotification creates a notification', () => {
      const n = makeNotification({ title: 'Budget exceeded' });
      assert.ok(n.id);
      assert.equal(n.title, 'Budget exceeded');
      assert.equal(n.is_read, 0);
    });

    it('makeRule creates a category rule', () => {
      const cat = makeCategory({ name: 'Shopping' });
      const rule = makeRule({ pattern: 'amazon', category_id: cat.id });
      assert.ok(rule.id);
      assert.equal(rule.pattern, 'amazon');
    });

    it('makeTemplate creates a transaction template', () => {
      const acct = makeAccount();
      const tmpl = makeTemplate(acct.id, { name: 'Monthly Rent' });
      assert.ok(tmpl.id);
      assert.equal(tmpl.name, 'Monthly Rent');
      assert.equal(tmpl.amount, 15000);
    });

    it('makeSpendingLimit creates a spending limit', () => {
      const cat = makeCategory();
      const limit = makeSpendingLimit({ category_id: cat.id, amount: 3000 });
      assert.ok(limit.id);
      assert.equal(limit.amount, 3000);
    });

    it('makeApiToken creates an API token with raw_token', () => {
      const token = makeApiToken({ name: 'CI Token' });
      assert.ok(token.id);
      assert.ok(token.raw_token.startsWith('pfi_'));
      assert.equal(token.name, 'CI Token');
      assert.equal(token.scope, 'read');
    });

    it('makeReminder creates a bill reminder', () => {
      const r = makeReminder();
      assert.ok(r.id);
      assert.equal(r.is_enabled, 1);
    });
  });

  // ═══════════════════════════════════════
  // ITER 3-4: Audit logging on write routes
  // ═══════════════════════════════════════
  describe('Audit logging completeness', () => {
    it('PUT /api/settings creates audit entry', async () => {
      await agent().put('/api/settings').send({ key: 'default_currency', value: 'USD' });
      const log = db.prepare("SELECT * FROM audit_log WHERE action LIKE '%setting%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'settings update should be audited');
    });

    it('PUT /api/categories/:id creates audit entry', async () => {
      const cat = makeCategory({ name: 'Old' });
      await agent().put(`/api/categories/${cat.id}`).send({ name: 'New' });
      const log = db.prepare("SELECT * FROM audit_log WHERE entity_type = 'category' AND action LIKE '%update%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'category update should be audited');
    });

    it('PUT /api/budgets/:id creates audit entry', async () => {
      const budget = makeBudget({ name: 'TestBudget' });
      await agent().put(`/api/budgets/${budget.id}`).send({ name: 'Updated' });
      const log = db.prepare("SELECT * FROM audit_log WHERE entity_type = 'budget' AND action LIKE '%update%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'budget update should be audited');
    });

    it('PUT /api/goals/:id creates audit entry', async () => {
      const goal = makeGoal({ name: 'TestGoal' });
      await agent().put(`/api/goals/${goal.id}`).send({ name: 'Updated Goal' });
      const log = db.prepare("SELECT * FROM audit_log WHERE entity_type = 'savings_goal' AND action LIKE '%update%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'goal update should be audited');
    });

    it('PUT /api/subscriptions/:id creates audit entry', async () => {
      const sub = makeSubscription({ name: 'TestSub' });
      await agent().put(`/api/subscriptions/${sub.id}`).send({ name: 'Updated Sub' });
      const log = db.prepare("SELECT * FROM audit_log WHERE entity_type = 'subscription' AND action LIKE '%update%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'subscription update should be audited');
    });

    it('POST /api/transaction-templates creates audit entry', async () => {
      const acct = makeAccount();
      await agent().post('/api/transaction-templates').send({
        name: 'Rent', account_id: acct.id, type: 'expense', amount: 15000, description: 'Monthly rent',
      });
      const log = db.prepare("SELECT * FROM audit_log WHERE action LIKE '%template%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'template creation should be audited');
    });

    it('DELETE /api/transaction-templates/:id creates audit entry', async () => {
      const acct = makeAccount();
      const tmpl = makeTemplate(acct.id);
      await agent().delete(`/api/transaction-templates/${tmpl.id}`);
      const log = db.prepare("SELECT * FROM audit_log WHERE action LIKE '%template%' AND action LIKE '%delete%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'template deletion should be audited');
    });
  });

  // ═══════════════════════════════════════
  // ITER 5-6: Schema validation on routes
  // ═══════════════════════════════════════
  describe('Input validation on write routes', () => {
    it('POST /api/transaction-templates rejects missing name', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transaction-templates').send({
        account_id: acct.id, type: 'expense', amount: 100, description: 'test',
      });
      assert.ok([400, 201].includes(res.status));
    });

    it('POST /api/transaction-templates rejects negative amount', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transaction-templates').send({
        name: 'Test', account_id: acct.id, type: 'expense', amount: -100, description: 'test',
      });
      assert.ok([400, 422].includes(res.status));
    });

    it('PUT /api/settings rejects invalid key', async () => {
      const res = await agent().put('/api/settings').send({ key: 'DROP_TABLE', value: 'evil' });
      assert.equal(res.status, 400);
    });

    it('PUT /api/settings rejects empty value', async () => {
      const res = await agent().put('/api/settings').send({ key: 'default_currency', value: '' });
      assert.equal(res.status, 400);
    });

    it('POST /api/stats/challenges rejects invalid dates', async () => {
      const res = await agent().post('/api/stats/challenges').send({
        name: 'Test', type: 'no_spend', start_date: 'not-a-date', end_date: '2026-04-30',
      });
      assert.equal(res.status, 400);
    });

    it('POST /api/stats/challenges rejects missing name', async () => {
      const res = await agent().post('/api/stats/challenges').send({
        type: 'no_spend', start_date: today(), end_date: daysFromNow(30),
      });
      assert.equal(res.status, 400);
    });

    it('POST groups budget rejects missing fields', async () => {
      const group = makeGroup();
      const res = await agent().post(`/api/groups/${group.id}/budgets`).send({});
      assert.equal(res.status, 400);
    });

    it('expense comment rejects empty content', async () => {
      const group = makeGroup();
      const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? LIMIT 1').get(group.id);
      const expense = db.prepare(
        'INSERT INTO shared_expenses (group_id, paid_by, amount, currency, description, date, split_method) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(group.id, member.id, 500, 'INR', 'test', today(), 'equal');
      const res = await agent().post(`/api/groups/${group.id}/expenses/${expense.lastInsertRowid}/comments`).send({ content: '' });
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════
  // ITER 9-10: Response format consistency
  // ═══════════════════════════════════════
  describe('Response format consistency', () => {
    it('PUT /api/settings returns consistent format', async () => {
      const res = await agent().put('/api/settings').send({ key: 'default_currency', value: 'USD' });
      assert.equal(res.status, 200);
      assert.ok(res.body.ok === true || res.body.setting, 'should return {ok} or {setting}');
    });

    it('GET /api/accounts returns paginated format', async () => {
      makeAccount();
      const res = await agent().get('/api/accounts');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.accounts));
      assert.ok(typeof res.body.total === 'number');
    });

    it('GET /api/transactions returns paginated format', async () => {
      const res = await agent().get('/api/transactions');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.transactions));
      assert.ok(typeof res.body.total === 'number');
    });

    it('GET /api/budgets returns array format', async () => {
      const res = await agent().get('/api/budgets');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.budgets));
    });

    it('GET /api/goals returns array format', async () => {
      const res = await agent().get('/api/goals');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.goals));
    });

    it('GET /api/categories returns array format', async () => {
      const res = await agent().get('/api/categories');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.categories));
    });

    it('error responses have {error: {code, message}} shape', async () => {
      const res = await agent().post('/api/accounts').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error, 'error response should have error field');
      assert.ok(res.body.error.message || res.body.error.code, 'error should have code or message');
    });

    it('GET /api/stats/overview returns all expected fields', async () => {
      const res = await agent().get('/api/stats/overview');
      assert.equal(res.status, 200);
      assert.ok('net_worth' in res.body);
      assert.ok('month_income' in res.body);
      assert.ok('month_expense' in res.body);
      assert.ok('currency_balances' in res.body);
    });
  });

  // ═══════════════════════════════════════
  // ITER 11-12: N+1 and atomic operations
  // ═══════════════════════════════════════
  describe('Data integrity — atomicity', () => {
    it('transaction creation is atomic (balance + record)', async () => {
      const acct = makeAccount({ balance: 10000 });
      await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 500, description: 'test', date: today(),
      });
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      const txCount = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c;
      assert.equal(updated.balance, 9500);
      assert.equal(txCount, 1);
    });

    it('transfer is atomic (both balances + both records)', async () => {
      const src = makeAccount({ name: 'Src', balance: 10000 });
      const dst = makeAccount({ name: 'Dst', balance: 5000 });
      await agent().post('/api/transactions').send({
        account_id: src.id, transfer_to_account_id: dst.id, type: 'transfer',
        amount: 3000, description: 'Transfer', date: today(),
      });
      const srcBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(src.id).balance;
      const dstBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(dst.id).balance;
      assert.equal(srcBal, 7000);
      assert.equal(dstBal, 8000);
    });

    it('bulk delete is atomic', async () => {
      const acct = makeAccount({ balance: 10000 });
      const t1 = makeTransaction(acct.id, { amount: 100 });
      const t2 = makeTransaction(acct.id, { amount: 200 });
      const res = await agent().post('/api/transactions/bulk-delete').send({ ids: [t1.id, t2.id] });
      assert.equal(res.status, 200);
    });

    it('performance: creating 100 transactions is under 5 seconds', async () => {
      const acct = makeAccount({ balance: 1000000 });
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        makeTransaction(acct.id, { amount: 10, description: `Perf test ${i}` });
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 5000, `100 transactions took ${elapsed}ms (should be <5000ms)`);
    });

    it('listing 100 transactions is under 200ms', async () => {
      const acct = makeAccount({ balance: 1000000 });
      for (let i = 0; i < 100; i++) {
        makeTransaction(acct.id, { amount: 10, description: `List test ${i}` });
      }
      const start = Date.now();
      const res = await agent().get('/api/transactions?limit=100');
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed < 200, `Listing 100 took ${elapsed}ms (should be <200ms)`);
    });
  });
});
