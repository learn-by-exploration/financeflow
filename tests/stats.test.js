const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, makeSubscription, today } = require('./helpers');

describe('Stats', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/stats/overview', () => {
    it('returns all zeros with no data (200)', async () => {
      const res = await agent().get('/api/stats/overview').expect(200);
      assert.equal(res.body.net_worth, 0);
      assert.equal(res.body.month_income, 0);
      assert.equal(res.body.month_expense, 0);
      assert.equal(res.body.month_savings, 0);
      assert.ok(Array.isArray(res.body.top_categories));
      assert.ok(Array.isArray(res.body.recent_transactions));
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/stats/overview').expect(401);
    });

    it('calculates net_worth from accounts', async () => {
      makeAccount({ name: 'Checking', type: 'checking', balance: 5000 });
      makeAccount({ name: 'Credit', type: 'credit_card', balance: -2000 });
      const res = await agent().get('/api/stats/overview').expect(200);
      assert.equal(res.body.net_worth, 3000);
    });

    it('reports month income and expense', async () => {
      const acct = makeAccount({ balance: 10000 });
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: today() });
      makeTransaction(acct.id, { type: 'expense', amount: 15000, date: today() });
      const res = await agent().get('/api/stats/overview').expect(200);
      assert.equal(res.body.month_income, 50000);
      assert.equal(res.body.month_expense, 15000);
      assert.equal(res.body.month_savings, 35000);
    });

    it('limits top_categories to 5', async () => {
      const acct = makeAccount({ balance: 100000 });
      for (let i = 0; i < 7; i++) {
        const cat = makeCategory({ name: `Cat ${i}`, type: 'expense' });
        makeTransaction(acct.id, { type: 'expense', amount: 100 * (i + 1), date: today(), category_id: cat.id });
      }
      const res = await agent().get('/api/stats/overview').expect(200);
      assert.ok(res.body.top_categories.length <= 5);
    });

    it('limits recent_transactions to 10', async () => {
      const acct = makeAccount({ balance: 100000 });
      for (let i = 0; i < 12; i++) {
        makeTransaction(acct.id, { description: `Tx${i}`, date: today() });
      }
      const res = await agent().get('/api/stats/overview').expect(200);
      assert.ok(res.body.recent_transactions.length <= 10);
    });

    it('includes monthly_subscriptions', async () => {
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      const res = await agent().get('/api/stats/overview').expect(200);
      assert.equal(res.body.monthly_subscriptions, 199);
    });
  });

  describe('GET /api/stats/trends', () => {
    it('returns monthly income vs expense arrays', async () => {
      const acct = makeAccount({ balance: 100000 });
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2024-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 20000, date: '2024-01-20' });
      const res = await agent().get('/api/stats/trends').expect(200);
      assert.ok(Array.isArray(res.body.trends));
      const jan = res.body.trends.find(t => t.month === '2024-01');
      assert.ok(jan);
      assert.equal(jan.income, 50000);
      assert.equal(jan.expense, 20000);
    });

    it('respects ?months= parameter', async () => {
      const acct = makeAccount({ balance: 100000 });
      for (let m = 1; m <= 8; m++) {
        makeTransaction(acct.id, { type: 'expense', amount: 1000, date: `2024-${String(m).padStart(2, '0')}-15` });
      }
      const res = await agent().get('/api/stats/trends?months=3').expect(200);
      assert.ok(res.body.trends.length <= 3);
    });
  });

  describe('GET /api/stats/category-breakdown', () => {
    it('groups by category with totals', async () => {
      const acct = makeAccount({ balance: 100000 });
      const food = makeCategory({ name: 'Food', type: 'expense' });
      const transport = makeCategory({ name: 'Transport', type: 'expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: food.id, date: today() });
      makeTransaction(acct.id, { type: 'expense', amount: 300, category_id: food.id, date: today() });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: transport.id, date: today() });
      const res = await agent().get('/api/stats/category-breakdown').expect(200);
      assert.ok(Array.isArray(res.body.breakdown));
      const foodItem = res.body.breakdown.find(b => b.name === 'Food');
      assert.equal(foodItem.total, 800);
      assert.equal(foodItem.count, 2);
    });

    it('filters by date range and type', async () => {
      const acct = makeAccount({ balance: 100000 });
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: cat.id, date: '2024-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 300, category_id: cat.id, date: '2024-06-15' });
      const res = await agent().get('/api/stats/category-breakdown?from=2024-06-01&to=2024-06-30').expect(200);
      const item = res.body.breakdown.find(b => b.name === 'Food');
      assert.equal(item.total, 300);
    });
  });
});
