const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeRecurringRule, makeSecondUser, today, daysFromNow } = require('./helpers');

describe('Phase 10 — Data Management (P3)', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  after(() => teardown());

  // ═══════════════════════════════════
  // 10.1 Transaction Templates
  // ═══════════════════════════════════

  describe('Transaction Templates', () => {
    it('POST /api/transaction-templates creates template', async () => {
      const account = makeAccount();
      const category = makeCategory();
      const res = await agent().post('/api/transaction-templates')
        .send({ name: 'Morning Coffee', description: 'Starbucks coffee', amount: 350, type: 'expense', category_id: category.id, account_id: account.id });
      assert.equal(res.status, 201);
      assert.ok(res.body.template);
      assert.equal(res.body.template.name, 'Morning Coffee');
      assert.equal(res.body.template.amount, 350);
      assert.equal(res.body.template.type, 'expense');
    });

    it('POST /api/transaction-templates requires name', async () => {
      const res = await agent().post('/api/transaction-templates')
        .send({ amount: 350 });
      assert.equal(res.status, 400);
    });

    it('GET /api/transaction-templates lists user templates', async () => {
      const account = makeAccount();
      await agent().post('/api/transaction-templates')
        .send({ name: 'Coffee', amount: 350, type: 'expense', account_id: account.id });
      await agent().post('/api/transaction-templates')
        .send({ name: 'Salary', amount: 50000, type: 'income', account_id: account.id });

      const res = await agent().get('/api/transaction-templates');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.templates));
      assert.equal(res.body.templates.length, 2);
    });

    it('POST /api/transactions/from-template/:id creates transaction with today date', async () => {
      const account = makeAccount();
      const category = makeCategory();
      await agent().post('/api/transaction-templates')
        .send({ name: 'Coffee', description: 'Morning coffee', amount: 350, type: 'expense', category_id: category.id, account_id: account.id });

      const templates = await agent().get('/api/transaction-templates');
      const templateId = templates.body.templates[0].id;

      const res = await agent().post(`/api/transactions/from-template/${templateId}`).send({});
      assert.equal(res.status, 201);
      assert.ok(res.body.transaction);
      assert.equal(res.body.transaction.date, today());
    });

    it('Template fields are copied to transaction', async () => {
      const account = makeAccount();
      const category = makeCategory();
      await agent().post('/api/transaction-templates')
        .send({ name: 'Rent', description: 'Monthly rent', amount: 25000, type: 'expense', category_id: category.id, account_id: account.id });

      const templates = await agent().get('/api/transaction-templates');
      const templateId = templates.body.templates[0].id;

      const res = await agent().post(`/api/transactions/from-template/${templateId}`).send({});
      assert.equal(res.body.transaction.description, 'Monthly rent');
      assert.equal(res.body.transaction.amount, 25000);
      assert.equal(res.body.transaction.type, 'expense');
      assert.equal(res.body.transaction.category_id, category.id);
      assert.equal(res.body.transaction.account_id, account.id);
    });

    it('Template creation can override amount', async () => {
      const account = makeAccount();
      await agent().post('/api/transaction-templates')
        .send({ name: 'Coffee', description: 'Morning coffee', amount: 350, type: 'expense', account_id: account.id });

      const templates = await agent().get('/api/transaction-templates');
      const templateId = templates.body.templates[0].id;

      const res = await agent().post(`/api/transactions/from-template/${templateId}`)
        .send({ amount: 500 });
      assert.equal(res.status, 201);
      assert.equal(res.body.transaction.amount, 500);
    });

    it('DELETE /api/transaction-templates/:id removes template', async () => {
      await agent().post('/api/transaction-templates')
        .send({ name: 'Coffee', amount: 350, type: 'expense' });

      const templates = await agent().get('/api/transaction-templates');
      const templateId = templates.body.templates[0].id;

      const res = await agent().delete(`/api/transaction-templates/${templateId}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);

      const after = await agent().get('/api/transaction-templates');
      assert.equal(after.body.templates.length, 0);
    });

    it('Templates are per-user (isolation)', async () => {
      await agent().post('/api/transaction-templates')
        .send({ name: 'My Template', amount: 100, type: 'expense' });

      const { agent: agent2 } = makeSecondUser();
      const res = await agent2.get('/api/transaction-templates');
      assert.equal(res.status, 200);
      assert.equal(res.body.templates.length, 0);
    });

    it('Invalid template ID returns 404', async () => {
      const res = await agent().post('/api/transactions/from-template/99999').send({});
      assert.equal(res.status, 404);
    });
  });

  // ═══════════════════════════════════
  // 10.2 Cash Flow Forecast
  // ═══════════════════════════════════

  describe('Cash Flow Forecast', () => {
    it('GET /api/reports/cashflow-forecast returns forecast array', async () => {
      const account = makeAccount({ balance: 100000 });
      const res = await agent().get('/api/reports/cashflow-forecast');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.forecast));
    });

    it('Forecast has date and projected_balance fields', async () => {
      const account = makeAccount({ balance: 100000 });
      const res = await agent().get('/api/reports/cashflow-forecast');
      assert.ok(res.body.forecast.length > 0);
      const first = res.body.forecast[0];
      assert.ok('date' in first);
      assert.ok('projected_balance' in first);
    });

    it('Default returns 30 days', async () => {
      const account = makeAccount({ balance: 100000 });
      const res = await agent().get('/api/reports/cashflow-forecast');
      assert.equal(res.body.forecast.length, 30);
    });

    it('?days=7 returns 7 data points', async () => {
      const account = makeAccount({ balance: 50000 });
      const res = await agent().get('/api/reports/cashflow-forecast?days=7');
      assert.equal(res.body.forecast.length, 7);
    });

    it('Starting balance matches current account balance total', async () => {
      const acct1 = makeAccount({ balance: 50000 });
      const acct2 = makeAccount({ name: 'Savings', type: 'savings', balance: 30000 });
      const res = await agent().get('/api/reports/cashflow-forecast');
      assert.equal(res.body.forecast[0].projected_balance, 80000);
    });
  });

  // ═══════════════════════════════════
  // 10.3 Category Suggestion
  // ═══════════════════════════════════

  describe('Category Suggestion', () => {
    it('GET /api/categories/suggest returns matching category', async () => {
      const category = makeCategory({ name: 'Food & Dining', type: 'expense' });
      // Create a rule that matches "coffee"
      db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, 0)').run(1, 'coffee|starbucks', category.id);

      const res = await agent().get('/api/categories/suggest?description=morning coffee');
      assert.equal(res.status, 200);
      assert.ok(res.body.suggestion);
      assert.equal(res.body.suggestion.category_id, category.id);
      assert.equal(res.body.suggestion.category_name, 'Food & Dining');
    });

    it('Returns null when no rule matches', async () => {
      const category = makeCategory({ name: 'Food & Dining', type: 'expense' });
      db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, 0)').run(1, 'coffee|starbucks', category.id);

      const res = await agent().get('/api/categories/suggest?description=uber ride');
      assert.equal(res.status, 200);
      assert.equal(res.body.suggestion, null);
    });

    it('Case-insensitive matching', async () => {
      const category = makeCategory({ name: 'Food & Dining', type: 'expense' });
      db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, 0)').run(1, 'coffee', category.id);

      const res = await agent().get('/api/categories/suggest?description=COFFEE%20HOUSE');
      assert.equal(res.status, 200);
      assert.ok(res.body.suggestion);
      assert.equal(res.body.suggestion.category_id, category.id);
    });
  });
});
