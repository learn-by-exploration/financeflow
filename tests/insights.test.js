const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

describe('Insights API', () => {
  let acct, catFood, catRent, catTransport, catSalary;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Checking', balance: 100000 });
    catFood = makeCategory({ name: 'Food', type: 'expense' });
    catRent = makeCategory({ name: 'Rent', type: 'expense' });
    catTransport = makeCategory({ name: 'Transport', type: 'expense' });
    catSalary = makeCategory({ name: 'Salary', type: 'income' });
  });

  // ─── Spending Trends ───

  describe('GET /api/insights/trends', () => {
    it('shows increasing trend when spending grows each month', async () => {
      // Create increasing expenses over 3 months
      makeTransaction(acct.id, { type: 'expense', amount: 1000, date: '2025-11-15', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, date: '2025-12-15', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, date: '2026-01-15', category_id: catFood.id });

      const res = await agent().get('/api/insights/trends?months=6');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.months));
      assert.equal(res.body.direction, 'increasing');
    });

    it('shows decreasing trend when spending drops each month', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 5000, date: '2025-11-15', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, date: '2025-12-15', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, date: '2026-01-15', category_id: catFood.id });

      const res = await agent().get('/api/insights/trends?months=6');
      assert.equal(res.status, 200);
      assert.equal(res.body.direction, 'decreasing');
    });

    it('returns stable direction with no data', async () => {
      const res = await agent().get('/api/insights/trends?months=6');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.months, []);
      assert.equal(res.body.direction, 'stable');
    });

    it('excludes transfers from trends', async () => {
      makeTransaction(acct.id, { type: 'transfer', amount: 50000, date: '2026-01-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2026-01-15', category_id: catFood.id });

      const res = await agent().get('/api/insights/trends?months=3');
      assert.equal(res.status, 200);
      // Should only see the expense, not the transfer
      const jan = res.body.months.find(m => m.month === '2026-01');
      if (jan) {
        assert.equal(jan.total, 500);
      }
    });
  });

  // ─── Anomaly Detection ───

  describe('GET /api/insights/anomalies', () => {
    it('flags outlier transactions exceeding 2 standard deviations', async () => {
      // Normal food expenses ~100
      makeTransaction(acct.id, { type: 'expense', amount: 100, date: '2026-03-01', category_id: catFood.id, description: 'Lunch' });
      makeTransaction(acct.id, { type: 'expense', amount: 110, date: '2026-03-05', category_id: catFood.id, description: 'Dinner' });
      makeTransaction(acct.id, { type: 'expense', amount: 90, date: '2026-03-08', category_id: catFood.id, description: 'Snack' });
      makeTransaction(acct.id, { type: 'expense', amount: 105, date: '2026-03-10', category_id: catFood.id, description: 'Brunch' });
      makeTransaction(acct.id, { type: 'expense', amount: 95, date: '2026-03-12', category_id: catFood.id, description: 'Coffee' });
      // Outlier
      makeTransaction(acct.id, { type: 'expense', amount: 5000, date: '2026-03-15', category_id: catFood.id, description: 'Fancy dinner' });

      const res = await agent().get('/api/insights/anomalies?months=3');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.anomalies));
      assert.ok(res.body.anomalies.length >= 1, 'Should flag at least one anomaly');
      const fancy = res.body.anomalies.find(a => a.description === 'Fancy dinner');
      assert.ok(fancy, 'Fancy dinner should be flagged');
      assert.ok(fancy.deviation > 2, 'Deviation should be > 2');
      assert.ok(fancy.category_mean > 0);
      assert.ok(fancy.category_stddev > 0);
    });

    it('returns no anomalies when spending is uniform', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, date: '2026-03-01', category_id: catFood.id, description: 'A' });
      makeTransaction(acct.id, { type: 'expense', amount: 100, date: '2026-03-05', category_id: catFood.id, description: 'B' });
      makeTransaction(acct.id, { type: 'expense', amount: 100, date: '2026-03-10', category_id: catFood.id, description: 'C' });

      const res = await agent().get('/api/insights/anomalies?months=3');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.anomalies, []);
    });

    it('returns empty anomalies when no data exists', async () => {
      const res = await agent().get('/api/insights/anomalies?months=3');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.anomalies, []);
    });
  });

  // ─── Spending Velocity ───

  describe('GET /api/insights/velocity', () => {
    it('returns velocity comparison between current and previous month', async () => {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const prev = new Date(now);
      prev.setUTCDate(1);
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      const prevMonth = prev.toISOString().slice(0, 7);

      // Previous month spending
      makeTransaction(acct.id, { type: 'expense', amount: 3000, date: `${prevMonth}-05`, category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, date: `${prevMonth}-10`, category_id: catRent.id });

      // Current month spending (higher pace)
      makeTransaction(acct.id, { type: 'expense', amount: 5000, date: `${currentMonth}-01`, category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 4000, date: `${currentMonth}-02`, category_id: catRent.id });

      const res = await agent().get('/api/insights/velocity');
      assert.equal(res.status, 200);
      assert.equal(res.body.current_month, currentMonth);
      assert.equal(res.body.previous_month, prevMonth);
      assert.equal(res.body.current_total, 9000);
      assert.ok(res.body.daily_rate > 0);
      assert.ok(res.body.day_of_month > 0);
      assert.ok(['on_track', 'overspending', 'underspending'].includes(res.body.status));
    });

    it('returns defaults when no data exists', async () => {
      const res = await agent().get('/api/insights/velocity');
      assert.equal(res.status, 200);
      assert.equal(res.body.current_total, 0);
      assert.equal(res.body.previous_total, 0);
      assert.equal(res.body.status, 'on_track');
    });
  });

  // ─── Category Changes ───

  describe('GET /api/insights/categories', () => {
    it('shows month-over-month category changes', async () => {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const prev = new Date(now);
      prev.setUTCDate(1);
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      const prevMonth = prev.toISOString().slice(0, 7);

      // Previous month
      makeTransaction(acct.id, { type: 'expense', amount: 2000, date: `${prevMonth}-10`, category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, date: `${prevMonth}-15`, category_id: catTransport.id });

      // Current month — food increased, transport dropped
      makeTransaction(acct.id, { type: 'expense', amount: 4000, date: `${currentMonth}-05`, category_id: catFood.id });

      const res = await agent().get('/api/insights/categories');
      assert.equal(res.status, 200);
      assert.equal(res.body.current_month, currentMonth);
      assert.equal(res.body.previous_month, prevMonth);
      assert.ok(Array.isArray(res.body.changes));
      assert.ok(Array.isArray(res.body.most_increased));
      assert.ok(Array.isArray(res.body.most_decreased));

      const foodChange = res.body.changes.find(c => c.name === 'Food');
      assert.ok(foodChange);
      assert.equal(foodChange.current, 4000);
      assert.equal(foodChange.previous, 2000);
      assert.equal(foodChange.change, 2000);
      assert.equal(foodChange.change_pct, 100);

      // Transport dropped from 1000 to 0
      const transportChange = res.body.changes.find(c => c.name === 'Transport');
      assert.ok(transportChange);
      assert.equal(transportChange.current, 0);
      assert.equal(transportChange.change, -1000);
    });

    it('returns empty changes when no data exists', async () => {
      const res = await agent().get('/api/insights/categories');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.changes, []);
      assert.deepEqual(res.body.most_increased, []);
      assert.deepEqual(res.body.most_decreased, []);
    });
  });

  // ─── Top Payees ───

  describe('GET /api/insights/payees', () => {
    it('returns top payees sorted by total spending', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2026-03-01', category_id: catFood.id, description: 'Swiggy' });
      makeTransaction(acct.id, { type: 'expense', amount: 800, date: '2026-03-05', category_id: catFood.id, description: 'Swiggy' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, date: '2026-03-10', category_id: catFood.id, description: 'Zomato' });
      makeTransaction(acct.id, { type: 'expense', amount: 300, date: '2026-03-12', category_id: catTransport.id, description: 'Uber' });

      const res = await agent().get('/api/insights/payees?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.payees));
      assert.equal(res.body.payees.length, 3);
      // Zomato (2000) first, then Swiggy (1300), then Uber (300)
      assert.equal(res.body.payees[0].payee, 'Zomato');
      assert.equal(res.body.payees[0].total, 2000);
      assert.equal(res.body.payees[1].payee, 'Swiggy');
      assert.equal(res.body.payees[1].total, 1300);
      assert.equal(res.body.payees[1].count, 2);
      assert.equal(res.body.payees[2].payee, 'Uber');
      assert.equal(res.body.payees[2].total, 300);
    });

    it('returns empty payees when no data exists', async () => {
      const res = await agent().get('/api/insights/payees?from=2020-01-01&to=2020-12-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.payees, []);
    });

    it('validates from/to parameters', async () => {
      const res = await agent().get('/api/insights/payees');
      assert.equal(res.status, 400);
    });

    it('respects limit parameter', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2026-03-01', category_id: catFood.id, description: 'A' });
      makeTransaction(acct.id, { type: 'expense', amount: 400, date: '2026-03-02', category_id: catFood.id, description: 'B' });
      makeTransaction(acct.id, { type: 'expense', amount: 300, date: '2026-03-03', category_id: catFood.id, description: 'C' });

      const res = await agent().get('/api/insights/payees?from=2026-03-01&to=2026-03-31&limit=2');
      assert.equal(res.status, 200);
      assert.equal(res.body.payees.length, 2);
      assert.equal(res.body.payees[0].payee, 'A');
    });
  });

  // ─── Auth ───

  describe('Auth', () => {
    it('requires authentication for all insight endpoints', async () => {
      const { rawAgent } = require('./helpers');
      const noAuth = rawAgent();

      const endpoints = [
        '/api/insights/trends',
        '/api/insights/anomalies',
        '/api/insights/velocity',
        '/api/insights/categories',
        '/api/insights/payees?from=2026-01-01&to=2026-12-31',
      ];

      for (const url of endpoints) {
        const res = await noAuth.get(url);
        assert.equal(res.status, 401, `${url} should require auth`);
      }
    });
  });
});
