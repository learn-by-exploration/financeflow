const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

describe('Chart Rendering — v0.3.31', () => {
  let acct, incomeCat, expenseCat, foodCat;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Checking', balance: 100000 });
    incomeCat = makeCategory({ name: 'Salary', type: 'income' });
    expenseCat = makeCategory({ name: 'Rent', type: 'expense' });
    foodCat = makeCategory({ name: 'Food', type: 'expense' });
  });

  // ─── Spending by Category (Doughnut) ───

  describe('GET /api/charts/spending-pie', () => {
    it('returns category breakdown with correct structure', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: expenseCat.id, date: '2025-06-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2025-06-12' });

      const res = await agent().get('/api/charts/spending-pie?from=2025-06-01&to=2025-06-30');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(Array.isArray(res.body.datasets));
      assert.ok(Array.isArray(res.body.meta));
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[0].name, 'Spending');
      assert.equal(res.body.total, 8000);
    });

    it('sums spending correctly per category', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2025-06-05' });
      makeTransaction(acct.id, { type: 'expense', amount: 2500, category_id: foodCat.id, date: '2025-06-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 4000, category_id: expenseCat.id, date: '2025-06-15' });

      const res = await agent().get('/api/charts/spending-pie?from=2025-06-01&to=2025-06-30');
      assert.equal(res.status, 200);
      // Rent should be first (highest)
      assert.equal(res.body.labels[0], 'Rent');
      assert.equal(res.body.datasets[0].data[0], 4000);
      // Food total = 3500
      assert.equal(res.body.labels[1], 'Food');
      assert.equal(res.body.datasets[0].data[1], 3500);
    });

    it('returns empty arrays when no expenses', async () => {
      const res = await agent().get('/api/charts/spending-pie?from=2025-06-01&to=2025-06-30');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.deepEqual(res.body.datasets[0].data, []);
      assert.equal(res.body.total, 0);
    });
  });

  // ─── Income vs Expense (Bar) ───

  describe('GET /api/charts/income-expense', () => {
    it('returns monthly income and expense grouped correctly', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2025-05-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 8000, category_id: expenseCat.id, date: '2025-05-20' });
      makeTransaction(acct.id, { type: 'income', amount: 55000, category_id: incomeCat.id, date: '2025-06-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 12000, category_id: expenseCat.id, date: '2025-06-20' });

      const res = await agent().get('/api/charts/income-expense?from=2025-05-01&to=2025-06-30&interval=monthly');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[0].name, 'Income');
      assert.equal(res.body.datasets[1].name, 'Expense');
      // May
      assert.equal(res.body.datasets[0].data[0], 50000);
      assert.equal(res.body.datasets[1].data[0], 8000);
      // June
      assert.equal(res.body.datasets[0].data[1], 55000);
      assert.equal(res.body.datasets[1].data[1], 12000);
    });

    it('returns empty data for no transactions', async () => {
      const res = await agent().get('/api/charts/income-expense?from=2020-01-01&to=2020-06-30&interval=monthly');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.deepEqual(res.body.datasets[0].data, []);
      assert.deepEqual(res.body.datasets[1].data, []);
    });
  });

  // ─── Spending Trend (Line) ───

  describe('GET /api/charts/spending-trend', () => {
    it('returns daily spending totals', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2025-06-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 300, category_id: foodCat.id, date: '2025-06-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 150, category_id: expenseCat.id, date: '2025-06-02' });

      const res = await agent().get('/api/charts/spending-trend?from=2025-06-01&to=2025-06-02&interval=daily');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.labels[0], '2025-06-01');
      assert.equal(res.body.labels[1], '2025-06-02');
      assert.equal(res.body.datasets[0].name, 'Spending');
      assert.equal(res.body.datasets[0].data[0], 500); // 200 + 300
      assert.equal(res.body.datasets[0].data[1], 150);
    });

    it('returns empty arrays for no spending', async () => {
      const res = await agent().get('/api/charts/spending-trend?from=2020-01-01&to=2020-01-31&interval=daily');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.deepEqual(res.body.datasets[0].data, []);
    });

    it('excludes income from spending trend', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2025-06-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 800, category_id: foodCat.id, date: '2025-06-01' });

      const res = await agent().get('/api/charts/spending-trend?from=2025-06-01&to=2025-06-01&interval=daily');
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[0].data[0], 800); // only expense
    });

    it('defaults to daily interval', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2025-06-01' });
      const res = await agent().get('/api/charts/spending-trend?from=2025-06-01&to=2025-06-01');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels[0], '2025-06-01');
    });
  });

  // ─── Date range filtering ───

  describe('date range filtering', () => {
    it('respects date boundaries for spending-pie', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2025-05-31' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2025-06-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2025-07-01' });

      const res = await agent().get('/api/charts/spending-pie?from=2025-06-01&to=2025-06-30');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 2000); // only June transaction
    });
  });

  // ─── Auth required ───

  describe('auth required for chart endpoints', () => {
    it('returns 401 for spending-pie without auth', async () => {
      const { app } = setup();
      const request = require('supertest');
      const res = await request(app).get('/api/charts/spending-pie?from=2025-06-01&to=2025-06-30');
      assert.equal(res.status, 401);
    });

    it('returns 401 for spending-trend without auth', async () => {
      const { app } = setup();
      const request = require('supertest');
      const res = await request(app).get('/api/charts/spending-trend?from=2025-06-01&to=2025-06-30');
      assert.equal(res.status, 401);
    });
  });

  // ─── Validation ───

  describe('validation', () => {
    it('rejects invalid date params for spending-trend', async () => {
      const res = await agent().get('/api/charts/spending-trend?from=bad&to=bad');
      assert.equal(res.status, 400);
    });
  });
});
