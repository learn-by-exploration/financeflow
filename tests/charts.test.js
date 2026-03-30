const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeBudget, today, daysFromNow } = require('./helpers');

describe('Charts API', () => {
  let acct, incomeCat, expenseCat, transferCat;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Main', balance: 100000 });
    incomeCat = makeCategory({ name: 'Salary', type: 'income' });
    expenseCat = makeCategory({ name: 'Food', type: 'expense' });
    transferCat = makeCategory({ name: 'Transfer', type: 'transfer' });
  });

  // ─── Cash Flow ───

  describe('GET /api/charts/cashflow', () => {
    it('returns monthly cash flow data', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2025-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: expenseCat.id, date: '2025-01-20' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: expenseCat.id, date: '2025-01-25' });

      const res = await agent().get('/api/charts/cashflow?from=2025-01-01&to=2025-01-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(Array.isArray(res.body.datasets));
      assert.equal(res.body.datasets.length, 3);
      assert.equal(res.body.datasets[0].name, 'Income');
      assert.equal(res.body.datasets[1].name, 'Expense');
      assert.equal(res.body.datasets[2].name, 'Net');
      assert.equal(res.body.datasets[0].data[0], 50000);
      assert.equal(res.body.datasets[1].data[0], 5000);
      assert.equal(res.body.datasets[2].data[0], 45000);
    });

    it('returns daily cash flow data', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 1000, category_id: incomeCat.id, date: '2025-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: expenseCat.id, date: '2025-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 300, category_id: expenseCat.id, date: '2025-03-02' });

      const res = await agent().get('/api/charts/cashflow?from=2025-03-01&to=2025-03-02&interval=daily');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.labels[0], '2025-03-01');
      assert.equal(res.body.labels[1], '2025-03-02');
      assert.equal(res.body.datasets[0].data[0], 1000); // income day 1
      assert.equal(res.body.datasets[1].data[0], 200);  // expense day 1
      assert.equal(res.body.datasets[1].data[1], 300);  // expense day 2
    });

    it('excludes transfers from cash flow', async () => {
      const acct2 = makeAccount({ name: 'Savings', balance: 0 });
      makeTransaction(acct.id, { type: 'transfer', amount: 10000, category_id: transferCat.id, date: '2025-01-10', transfer_to_account_id: acct2.id });
      makeTransaction(acct.id, { type: 'income', amount: 5000, category_id: incomeCat.id, date: '2025-01-10' });

      const res = await agent().get('/api/charts/cashflow?from=2025-01-01&to=2025-01-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[0].data[0], 5000);  // only income, no transfer
      assert.equal(res.body.datasets[1].data[0], 0);     // no expense
    });

    it('returns empty arrays for empty date range', async () => {
      const res = await agent().get('/api/charts/cashflow?from=2020-01-01&to=2020-01-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.deepEqual(res.body.datasets[0].data, []);
    });

    it('validates date parameters', async () => {
      const res = await agent().get('/api/charts/cashflow?from=bad&to=bad');
      assert.equal(res.status, 400);
    });

    it('defaults to monthly interval when invalid', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 1000, category_id: incomeCat.id, date: '2025-01-15' });
      const res = await agent().get('/api/charts/cashflow?from=2025-01-01&to=2025-01-31&interval=invalid');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels[0].match(/^\d{4}-\d{2}$/)); // monthly format
    });
  });

  // ─── Balance History ───

  describe('GET /api/charts/balance-history', () => {
    it('returns balance history for an account', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 5000, category_id: incomeCat.id, date: '2025-02-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: expenseCat.id, date: '2025-02-05' });

      const res = await agent().get(`/api/charts/balance-history?account_id=${acct.id}&from=2025-02-01&to=2025-02-28`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.equal(res.body.datasets[0].name, 'Balance');
      assert.equal(res.body.labels.length, 2);
    });

    it('returns 404 for non-existent account', async () => {
      const res = await agent().get('/api/charts/balance-history?account_id=99999&from=2025-01-01&to=2025-01-31');
      assert.equal(res.status, 404);
    });

    it('requires account_id', async () => {
      const res = await agent().get('/api/charts/balance-history?from=2025-01-01&to=2025-01-31');
      assert.equal(res.status, 400);
    });

    it('returns data point for empty range', async () => {
      const res = await agent().get(`/api/charts/balance-history?account_id=${acct.id}&from=2020-01-01&to=2020-01-31`);
      assert.equal(res.status, 200);
      assert.ok(res.body.labels.length >= 1);
      assert.ok(res.body.datasets[0].data.length >= 1);
    });

    it('includes transfers in balance history', async () => {
      const acct2 = makeAccount({ name: 'Savings', balance: 0 });
      // Transfer 10000 from acct to acct2
      makeTransaction(acct.id, { type: 'transfer', amount: 10000, date: '2025-03-01', transfer_to_account_id: acct2.id });

      const res = await agent().get(`/api/charts/balance-history?account_id=${acct.id}&from=2025-03-01&to=2025-03-31`);
      assert.equal(res.status, 200);
      // Balance should reflect the transfer
      assert.ok(res.body.datasets[0].data.length >= 1);
    });
  });

  // ─── Spending Pie ───

  describe('GET /api/charts/spending-pie', () => {
    it('returns category spending breakdown', async () => {
      const food = makeCategory({ name: 'Food', type: 'expense' });
      const transport = makeCategory({ name: 'Transport', type: 'expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: food.id, date: '2025-01-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: food.id, date: '2025-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: transport.id, date: '2025-01-12' });

      const res = await agent().get('/api/charts/spending-pie?from=2025-01-01&to=2025-01-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[0].name, 'Spending');
      assert.equal(res.body.total, 6000);
      assert.ok(Array.isArray(res.body.meta));
      // Percentages should sum to approximately 100
      const totalPct = res.body.meta.reduce((s, m) => s + m.percentage, 0);
      assert.ok(Math.abs(totalPct - 100) < 0.1);
    });

    it('returns empty data for period with no expenses', async () => {
      const res = await agent().get('/api/charts/spending-pie?from=2020-01-01&to=2020-01-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.deepEqual(res.body.datasets[0].data, []);
      assert.equal(res.body.total, 0);
    });

    it('excludes transfers from spending pie', async () => {
      const acct2 = makeAccount({ name: 'Savings', balance: 0 });
      makeTransaction(acct.id, { type: 'transfer', amount: 10000, category_id: transferCat.id, date: '2025-01-10', transfer_to_account_id: acct2.id });
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: expenseCat.id, date: '2025-01-10' });

      const res = await agent().get('/api/charts/spending-pie?from=2025-01-01&to=2025-01-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 500); // only expense, no transfer
    });
  });

  // ─── Income vs Expense ───

  describe('GET /api/charts/income-expense', () => {
    it('returns income vs expense per period', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2025-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 20000, category_id: expenseCat.id, date: '2025-01-20' });
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2025-02-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 25000, category_id: expenseCat.id, date: '2025-02-20' });

      const res = await agent().get('/api/charts/income-expense?from=2025-01-01&to=2025-02-28&interval=monthly');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[0].name, 'Income');
      assert.equal(res.body.datasets[1].name, 'Expense');
      assert.equal(res.body.datasets[0].data[0], 50000);
      assert.equal(res.body.datasets[0].data[1], 50000);
      assert.equal(res.body.datasets[1].data[0], 20000);
      assert.equal(res.body.datasets[1].data[1], 25000);
    });

    it('excludes transfers from income/expense chart', async () => {
      const acct2 = makeAccount({ name: 'Savings', balance: 0 });
      makeTransaction(acct.id, { type: 'transfer', amount: 10000, category_id: transferCat.id, date: '2025-01-10', transfer_to_account_id: acct2.id });
      makeTransaction(acct.id, { type: 'income', amount: 5000, category_id: incomeCat.id, date: '2025-01-10' });

      const res = await agent().get('/api/charts/income-expense?from=2025-01-01&to=2025-01-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[0].data[0], 5000);  // income only
      assert.equal(res.body.datasets[1].data[0], 0);     // no expense
    });

    it('returns empty arrays for empty period', async () => {
      const res = await agent().get('/api/charts/income-expense?from=2020-01-01&to=2020-01-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.deepEqual(res.body.datasets[0].data, []);
    });
  });

  // ─── Net Worth Trend ───

  describe('GET /api/charts/net-worth', () => {
    it('returns net worth trend data', async () => {
      const res = await agent().get('/api/charts/net-worth?from=2025-01-01&to=2025-12-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.equal(res.body.datasets.length, 3);
      assert.equal(res.body.datasets[0].name, 'Assets');
      assert.equal(res.body.datasets[1].name, 'Liabilities');
      assert.equal(res.body.datasets[2].name, 'Net Worth');
    });

    it('computes from accounts when no snapshots exist', async () => {
      // acct has 100000 balance; it's a checking account (asset)
      const res = await agent().get('/api/charts/net-worth?from=2025-01-01&to=2025-12-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.ok(res.body.datasets[0].data[0] >= 100000); // assets include the account
    });

    it('validates date parameters', async () => {
      const res = await agent().get('/api/charts/net-worth?from=bad&to=bad');
      assert.equal(res.status, 400);
    });
  });

  // ─── Budget Utilization ───

  describe('GET /api/charts/budget-utilization', () => {
    it('returns allocated vs spent for budget items', async () => {
      const cat1 = makeCategory({ name: 'Groceries', type: 'expense' });
      const cat2 = makeCategory({ name: 'Entertainment', type: 'expense' });
      const budget = makeBudget({
        name: 'Jan Budget',
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        items: [
          { category_id: cat1.id, amount: 10000 },
          { category_id: cat2.id, amount: 5000 },
        ],
      });

      // Create expenses
      makeTransaction(acct.id, { type: 'expense', amount: 7000, category_id: cat1.id, date: '2025-01-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: cat1.id, date: '2025-01-20' });
      makeTransaction(acct.id, { type: 'expense', amount: 4500, category_id: cat2.id, date: '2025-01-15' });

      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.budget_id, budget.id);
      assert.equal(res.body.budget_name, 'Jan Budget');
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[0].name, 'Allocated');
      assert.equal(res.body.datasets[1].name, 'Spent');
      assert.equal(res.body.datasets[0].data[0], 10000);
      assert.equal(res.body.datasets[1].data[0], 9000);  // 7000 + 2000
      assert.equal(res.body.datasets[0].data[1], 5000);
      assert.equal(res.body.datasets[1].data[1], 4500);
      // Meta has percentage
      assert.equal(res.body.meta[0].percentage, 90); // 9000/10000 * 100
      assert.equal(res.body.meta[1].percentage, 90); // 4500/5000 * 100
    });

    it('returns 404 for non-existent budget', async () => {
      const res = await agent().get('/api/charts/budget-utilization?budget_id=99999');
      assert.equal(res.status, 404);
    });

    it('requires budget_id', async () => {
      const res = await agent().get('/api/charts/budget-utilization');
      assert.equal(res.status, 400);
    });

    it('returns zero spent when no transactions', async () => {
      const cat = makeCategory({ name: 'Misc', type: 'expense' });
      const budget = makeBudget({
        name: 'Empty Budget',
        start_date: '2025-06-01',
        end_date: '2025-06-30',
        items: [{ category_id: cat.id, amount: 5000 }],
      });

      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[1].data[0], 0);
      assert.equal(res.body.meta[0].percentage, 0);
    });
  });

  // ─── Auth ───

  describe('Auth', () => {
    it('requires authentication for all chart endpoints', async () => {
      const request = require('supertest');
      const { app } = setup();
      const noAuth = request(app);

      const endpoints = [
        '/api/charts/cashflow?from=2025-01-01&to=2025-01-31',
        '/api/charts/balance-history?account_id=1&from=2025-01-01&to=2025-01-31',
        '/api/charts/spending-pie?from=2025-01-01&to=2025-01-31',
        '/api/charts/income-expense?from=2025-01-01&to=2025-01-31',
        '/api/charts/net-worth?from=2025-01-01&to=2025-01-31',
        '/api/charts/budget-utilization?budget_id=1',
      ];

      for (const url of endpoints) {
        const res = await noAuth.get(url);
        assert.equal(res.status, 401, `Expected 401 for ${url}`);
      }
    });
  });
});
