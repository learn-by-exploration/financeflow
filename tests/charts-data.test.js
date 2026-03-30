const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeTransaction, makeCategory, makeBudget } = require('./helpers');

describe('Charts Data — v0.2.5', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/stats/trends — chart-compatible', () => {
    it('returns trends with month, income, expense fields', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2025-01-15', description: 'Salary' });
      makeTransaction(acct.id, { type: 'expense', amount: 5000, date: '2025-01-20', description: 'Rent' });

      const res = await agent().get('/api/stats/trends?months=6').expect(200);
      assert.ok(Array.isArray(res.body.trends));
      if (res.body.trends.length > 0) {
        const t = res.body.trends[0];
        assert.ok('month' in t, 'should have month field');
        assert.ok('income' in t, 'should have income field');
        assert.ok('expense' in t, 'should have expense field');
      }
    });

    it('returns empty trends when no transactions', async () => {
      const res = await agent().get('/api/stats/trends').expect(200);
      assert.deepEqual(res.body.trends, []);
    });
  });

  describe('GET /api/stats/category-breakdown — chart-compatible', () => {
    it('returns breakdown with id, name, icon, color, total, count', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const cat = makeCategory({ name: 'Food', icon: '🍕', color: '#FF0000', type: 'expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 100, description: 'Lunch', category_id: cat.id, date: '2025-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, description: 'Dinner', category_id: cat.id, date: '2025-01-16' });

      const res = await agent().get('/api/stats/category-breakdown').expect(200);
      assert.ok(Array.isArray(res.body.breakdown));
      assert.ok(res.body.breakdown.length >= 1);
      const item = res.body.breakdown[0];
      assert.ok('id' in item);
      assert.ok('name' in item);
      assert.ok('icon' in item);
      assert.ok('color' in item);
      assert.ok('total' in item);
      assert.ok('count' in item);
      assert.equal(item.total, 300);
      assert.equal(item.count, 2);
    });

    it('filters by date range', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const cat = makeCategory({ name: 'Shopping', type: 'expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 100, description: 'Jan', category_id: cat.id, date: '2025-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, description: 'Mar', category_id: cat.id, date: '2025-03-15' });

      const res = await agent().get('/api/stats/category-breakdown?from=2025-03-01&to=2025-03-31').expect(200);
      assert.equal(res.body.breakdown.length, 1);
      assert.equal(res.body.breakdown[0].total, 200);
    });
  });

  describe('GET /api/stats/overview — chart-compatible', () => {
    it('returns all required fields', async () => {
      const res = await agent().get('/api/stats/overview').expect(200);
      const fields = ['net_worth', 'total_assets', 'total_liabilities', 'month_income', 'month_expense', 'month_savings', 'top_categories', 'recent_transactions', 'monthly_subscriptions'];
      for (const f of fields) {
        assert.ok(f in res.body, `should have ${f}`);
      }
    });

    it('top_categories has name, icon, total fields', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const cat = makeCategory({ name: 'Food', icon: '🍕', type: 'expense' });
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
      makeTransaction(acct.id, { type: 'expense', amount: 500, description: 'Pizza', category_id: cat.id, date: thisMonth });

      const res = await agent().get('/api/stats/overview').expect(200);
      if (res.body.top_categories.length > 0) {
        const c = res.body.top_categories[0];
        assert.ok('name' in c);
        assert.ok('icon' in c);
        assert.ok('total' in c);
      }
    });
  });

  describe('GET /api/stats/daily-spending — new endpoint', () => {
    it('returns daily spending totals for date range', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { type: 'expense', amount: 100, description: 'Day1', date: '2025-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, description: 'Day2', date: '2025-01-16' });
      makeTransaction(acct.id, { type: 'expense', amount: 50, description: 'Day2b', date: '2025-01-16' });

      const res = await agent().get('/api/stats/daily-spending?from=2025-01-15&to=2025-01-16').expect(200);
      assert.ok(Array.isArray(res.body.daily));
      assert.equal(res.body.daily.length, 2);
      assert.equal(res.body.daily[0].date, '2025-01-15');
      assert.equal(res.body.daily[0].total, 100);
      assert.equal(res.body.daily[1].total, 250);
    });

    it('returns empty array for no data', async () => {
      const res = await agent().get('/api/stats/daily-spending?from=2025-01-01&to=2025-01-31').expect(200);
      assert.deepEqual(res.body.daily, []);
    });
  });
});
