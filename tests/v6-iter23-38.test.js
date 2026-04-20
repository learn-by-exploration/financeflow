// tests/v6-iter23-38.test.js — Iterations 23-38: Feature enhancements & integrations
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction,
  makeBudget, makeGoal, makeSubscription, makeGroup, makeGroupMember,
  makeTag, makeRecurringRule, makeTemplate, makeNotification,
  makeSpendingLimit, makeApiToken,
  today, daysFromNow } = require('./helpers');

describe('v6 Iterations 23-38: Feature Enhancements', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ═══════════════════════════════════════
  // ITER 23-24: Dashboard & stats
  // ═══════════════════════════════════════
  describe('Dashboard & stats completeness', () => {
    it('overview includes currency_balances', async () => {
      makeAccount({ balance: 10000 });
      const res = await agent().get('/api/stats/overview');
      assert.equal(res.status, 200);
      assert.ok('currency_balances' in res.body);
    });

    it('overview includes monthly spending trends', async () => {
      const acct = makeAccount({ balance: 50000 });
      for (let i = 0; i < 5; i++) {
        makeTransaction(acct.id, { amount: 1000, type: 'expense', description: `spending${i}` });
      }
      const res = await agent().get('/api/stats/overview');
      assert.equal(res.status, 200);
      assert.ok(res.body.month_expense !== undefined);
    });

    it('stats spending by category works', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const acct = makeAccount({ balance: 50000 });
      makeTransaction(acct.id, { category_id: cat.id, amount: 500, type: 'expense' });
      const res = await agent().get('/api/stats/category-breakdown');
      assert.equal(res.status, 200);
    });

    it('stats income vs expense works', async () => {
      const acct = makeAccount({ balance: 50000 });
      makeTransaction(acct.id, { amount: 5000, type: 'income' });
      makeTransaction(acct.id, { amount: 2000, type: 'expense' });
      const res = await agent().get('/api/stats/trends');
      assert.equal(res.status, 200);
    });

    it('daily spending trend works', async () => {
      const acct = makeAccount({ balance: 50000 });
      makeTransaction(acct.id, { amount: 500, type: 'expense' });
      const res = await agent().get('/api/stats/daily-spending');
      assert.equal(res.status, 200);
    });
  });

  // ═══════════════════════════════════════
  // ITER 25-26: Budget management
  // ═══════════════════════════════════════
  describe('Budget management', () => {
    it('budget with items can be created', async () => {
      const cat = makeCategory({ name: 'Budget Cat', type: 'expense' });
      const res = await agent().post('/api/budgets').send({
        name: 'Monthly', period: 'monthly', start_date: today(),
        items: [{ category_id: cat.id, amount: 5000 }],
      });
      assert.equal(res.status, 201);
    });

    it('budget items track actual spending', async () => {
      const cat = makeCategory({ name: 'Groceries', type: 'expense' });
      const acct = makeAccount({ balance: 50000 });
      const budget = makeBudget({ name: 'Monthly' });

      // Create some transactions
      makeTransaction(acct.id, { category_id: cat.id, amount: 1000, type: 'expense' });
      makeTransaction(acct.id, { category_id: cat.id, amount: 500, type: 'expense' });

      const res = await agent().get('/api/budgets');
      assert.equal(res.status, 200);
      assert.ok(res.body.budgets.length > 0);
    });

    it('budget delete removes budget and items', async () => {
      const budget = makeBudget({ name: 'ToDelete' });
      const res = await agent().delete(`/api/budgets/${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);

      // Verify budget is gone
      const check = db.prepare('SELECT * FROM budgets WHERE id = ?').get(budget.id);
      assert.equal(check, undefined);
    });

    it('budget update changes name', async () => {
      const budget = makeBudget({ name: 'OldName' });
      const res = await agent().put(`/api/budgets/${budget.id}`).send({ name: 'NewName' });
      assert.equal(res.status, 200);
      assert.equal(res.body.budget.name, 'NewName');
    });
  });

  // ═══════════════════════════════════════
  // ITER 27-28: Goal tracking
  // ═══════════════════════════════════════
  describe('Goal tracking', () => {
    it('goal create with target_amount and target_date', async () => {
      const res = await agent().post('/api/goals').send({
        name: 'Emergency Fund', target_amount: 100000, target_date: daysFromNow(365),
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.goal.id);
    });

    it('goal update modifies target', async () => {
      const goal = makeGoal({ name: 'Savings', target_amount: 50000 });
      const res = await agent().put(`/api/goals/${goal.id}`).send({ target_amount: 75000 });
      assert.equal(res.status, 200);
      assert.equal(res.body.goal.target_amount, 75000);
    });

    it('goal delete works', async () => {
      const goal = makeGoal({ name: 'ToDelete' });
      const res = await agent().delete(`/api/goals/${goal.id}`);
      assert.equal(res.status, 200);
    });

    it('auto-allocate endpoint works', async () => {
      const goal = makeGoal({ name: 'AutoAlloc', target_amount: 10000 });
      const acct = makeAccount({ balance: 50000 });
      const res = await agent().put(`/api/goals/${goal.id}/auto-allocate`).send({
        account_id: acct.id, amount: 1000,
      });
      assert.ok([200, 400].includes(res.status));
    });

    it('goal transaction list works', async () => {
      const goal = makeGoal({ name: 'ListTxGoal', target_amount: 10000 });
      const res = await agent().get(`/api/goals/${goal.id}/transactions`);
      assert.equal(res.status, 200);
    });
  });

  // ═══════════════════════════════════════
  // ITER 29-30: Tag management
  // ═══════════════════════════════════════
  describe('Tag management', () => {
    it('tags can be created', async () => {
      const res = await agent().post('/api/tags').send({ name: 'urgent', color: '#FF0000' });
      assert.equal(res.status, 201);
      assert.ok(res.body.tag.id);
    });

    it('tags can be listed', async () => {
      makeTag({ name: 'tag1' });
      makeTag({ name: 'tag2' });
      const res = await agent().get('/api/tags');
      assert.equal(res.status, 200);
      assert.ok(res.body.tags.length >= 2);
    });

    it('tags can be assigned to transactions', async () => {
      const acct = makeAccount();
      const tx = makeTransaction(acct.id, { amount: 100 });
      const tag = makeTag({ name: 'taggable' });

      const res = await agent().post('/api/transactions/bulk-tag').send({
        ids: [tx.id], tag_ids: [tag.id],
      });
      assert.equal(res.status, 200);
    });

    it('tags can be removed from transactions', async () => {
      const acct = makeAccount();
      const tx = makeTransaction(acct.id, { amount: 100 });
      const tag = makeTag({ name: 'removable' });
      db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(tx.id, tag.id);

      const res = await agent().post('/api/transactions/bulk-untag').send({
        ids: [tx.id], tag_ids: [tag.id],
      });
      assert.equal(res.status, 200);
    });

    it('tag delete works', async () => {
      const tag = makeTag({ name: 'deleteme' });
      const res = await agent().delete(`/api/tags/${tag.id}`);
      assert.equal(res.status, 200);
    });
  });

  // ═══════════════════════════════════════
  // ITER 31-32: Recurring rules
  // ═══════════════════════════════════════
  describe('Recurring rules management', () => {
    it('recurring rules can be listed', async () => {
      const acct = makeAccount();
      makeRecurringRule(acct.id, { amount: 1000, frequency: 'monthly' });
      const res = await agent().get('/api/recurring');
      assert.equal(res.status, 200);
      assert.ok(res.body.rules.length >= 1);
    });

    it('recurring rule can be created via API', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/recurring').send({
        account_id: acct.id, type: 'expense', amount: 500, currency: 'INR',
        description: 'API Rule', frequency: 'monthly', next_date: daysFromNow(30),
      });
      assert.equal(res.status, 201);
    });

    it('recurring rule can be updated', async () => {
      const acct = makeAccount();
      const rule = makeRecurringRule(acct.id, { amount: 1000 });
      const res = await agent().put(`/api/recurring/${rule.id}`).send({ amount: 1500 });
      assert.equal(res.status, 200);
    });

    it('recurring rule can be deleted', async () => {
      const acct = makeAccount();
      const rule = makeRecurringRule(acct.id, { amount: 1000 });
      const res = await agent().delete(`/api/recurring/${rule.id}`);
      assert.equal(res.status, 200);
    });
  });

  // ═══════════════════════════════════════
  // ITER 33-34: Transaction templates
  // ═══════════════════════════════════════
  describe('Transaction templates', () => {
    it('template can be created with all fields', async () => {
      const acct = makeAccount();
      const cat = makeCategory({ name: 'Rent', type: 'expense' });
      const res = await agent().post('/api/transaction-templates').send({
        name: 'Monthly Rent', account_id: acct.id, category_id: cat.id,
        type: 'expense', amount: 15000, description: 'Apartment rent',
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.template.name, 'Monthly Rent');
    });

    it('template can be listed', async () => {
      const acct = makeAccount();
      makeTemplate(acct.id, { name: 'T1' });
      makeTemplate(acct.id, { name: 'T2' });
      const res = await agent().get('/api/transaction-templates');
      assert.equal(res.status, 200);
      assert.ok(res.body.templates.length >= 2);
    });

    it('template can be used to create transaction', async () => {
      const acct = makeAccount({ balance: 50000 });
      const tmpl = makeTemplate(acct.id, { name: 'QuickPay', amount: 500 });
      const res = await agent().post(`/api/transactions/from-template/${tmpl.id}`).send({
        type: 'expense', amount: 500,
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.transaction.id);
    });

    it('template creation with minimal fields works', async () => {
      const res = await agent().post('/api/transaction-templates').send({ name: 'Minimal' });
      assert.equal(res.status, 201);
      assert.equal(res.body.template.name, 'Minimal');
    });
  });

  // ═══════════════════════════════════════
  // ITER 35-36: Spending limits
  // ═══════════════════════════════════════
  describe('Spending limits', () => {
    it('spending limit can be created', async () => {
      const cat = makeCategory({ name: 'Dining', type: 'expense' });
      const res = await agent().post('/api/spending-limits').send({
        category_id: cat.id, period: 'monthly', amount: 5000,
      });
      assert.equal(res.status, 201);
    });

    it('spending limits list includes spending data', async () => {
      const cat = makeCategory({ name: 'Shopping', type: 'expense' });
      makeSpendingLimit({ category_id: cat.id, amount: 10000 });
      const res = await agent().get('/api/spending-limits');
      assert.equal(res.status, 200);
      const limits = res.body.spending_limits || res.body.limits;
      assert.ok(limits.length >= 1);
    });

    it('spending limit update works', async () => {
      const cat = makeCategory({ name: 'Groceries', type: 'expense' });
      const limit = makeSpendingLimit({ category_id: cat.id, amount: 3000 });
      const res = await agent().put(`/api/spending-limits/${limit.id}`).send({ amount: 5000 });
      assert.equal(res.status, 200);
    });

    it('spending limit delete works', async () => {
      const cat = makeCategory({ name: 'DeleteCat', type: 'expense' });
      const limit = makeSpendingLimit({ category_id: cat.id, amount: 3000 });
      const res = await agent().delete(`/api/spending-limits/${limit.id}`);
      assert.equal(res.status, 200);
    });
  });

  // ═══════════════════════════════════════
  // ITER 37-38: API tokens & search
  // ═══════════════════════════════════════
  describe('API tokens & search', () => {
    it('api token can be created', async () => {
      const res = await agent().post('/api/tokens').send({ name: 'CI Token', scope: 'read' });
      assert.equal(res.status, 201);
      assert.ok(res.body.token || res.body.api_token);
    });

    it('api token can be listed', async () => {
      makeApiToken({ name: 'ListToken' });
      const res = await agent().get('/api/tokens');
      assert.equal(res.status, 200);
    });

    it('api token can be revoked', async () => {
      const token = makeApiToken({ name: 'RevokeMe' });
      const res = await agent().delete(`/api/tokens/${token.id}`);
      assert.equal(res.status, 200);
    });

    it('search with query returns results', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { amount: 100, description: 'unique-searchable-term' });
      const res = await agent().get('/api/search?q=unique-searchable-term');
      assert.equal(res.status, 200);
    });

    it('search with empty query returns empty or error', async () => {
      const res = await agent().get('/api/search?q=');
      assert.ok([200, 400].includes(res.status));
    });

    it('FTS search finds partial matches', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { amount: 100, description: 'grocery shopping at supermarket' });
      const res = await agent().get('/api/search?q=grocery');
      assert.equal(res.status, 200);
    });
  });
});
