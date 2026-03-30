const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, rawAgent } = require('./helpers');

describe('Reports API', () => {
  let acct, catFood, catRent, catSalary;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Checking', balance: 0 });
    catFood = makeCategory({ name: 'Food', type: 'expense' });
    catRent = makeCategory({ name: 'Rent', type: 'expense' });
    catSalary = makeCategory({ name: 'Salary', type: 'income' });
  });

  describe('GET /api/reports/monthly', () => {
    it('returns correct income/expense/net/savings_rate', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2025-03-05', category_id: catSalary.id });
      makeTransaction(acct.id, { type: 'expense', amount: 8000, date: '2025-03-10', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 15000, date: '2025-03-15', category_id: catRent.id });

      const res = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res.status, 200);
      assert.equal(res.body.income, 50000);
      assert.equal(res.body.expense, 23000);
      assert.equal(res.body.net, 27000);
      assert.equal(res.body.savings_rate, 54);
      assert.equal(res.body.month, '2025-03');
    });

    it('returns zeros when no data exists', async () => {
      const res = await agent().get('/api/reports/monthly?month=2020-01');
      assert.equal(res.status, 200);
      assert.equal(res.body.income, 0);
      assert.equal(res.body.expense, 0);
      assert.equal(res.body.net, 0);
      assert.equal(res.body.savings_rate, 0);
    });

    it('excludes transfers from calculations', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2025-03-01', category_id: catSalary.id });
      makeTransaction(acct.id, { type: 'transfer', amount: 10000, date: '2025-03-02' });

      const res = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res.status, 200);
      assert.equal(res.body.income, 50000);
      assert.equal(res.body.expense, 0);
      assert.equal(res.body.net, 50000);
    });

    it('returns top categories sorted by amount', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 5000, date: '2025-03-01', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, date: '2025-03-05', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 15000, date: '2025-03-10', category_id: catRent.id });

      const res = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res.status, 200);
      assert.ok(res.body.top_categories.length >= 2);
      // Rent (15000) should be first, Food (8000) second
      assert.equal(res.body.top_categories[0].name, 'Rent');
      assert.equal(res.body.top_categories[0].total, 15000);
      assert.equal(res.body.top_categories[1].name, 'Food');
      assert.equal(res.body.top_categories[1].total, 8000);
    });

    it('returns daily breakdown with correct day-by-day values', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2025-03-01', category_id: catSalary.id });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, date: '2025-03-01', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2025-03-03', category_id: catFood.id });

      const res = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.daily));

      const day1 = res.body.daily.find(d => d.date === '2025-03-01');
      assert.ok(day1);
      assert.equal(day1.income, 50000);
      assert.equal(day1.expense, 2000);

      const day3 = res.body.daily.find(d => d.date === '2025-03-03');
      assert.ok(day3);
      assert.equal(day3.income, 0);
      assert.equal(day3.expense, 500);
    });

    it('returns 400 for invalid month format', async () => {
      const res = await agent().get('/api/reports/monthly?month=March2025');
      assert.equal(res.status, 400);
    });

    it('returns 400 for missing month', async () => {
      const res = await agent().get('/api/reports/monthly');
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/reports/yearly', () => {
    it('returns monthly breakdown for the year', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2025-01-15', category_id: catSalary.id });
      makeTransaction(acct.id, { type: 'expense', amount: 20000, date: '2025-01-20', category_id: catRent.id });
      makeTransaction(acct.id, { type: 'income', amount: 55000, date: '2025-03-10', category_id: catSalary.id });
      makeTransaction(acct.id, { type: 'expense', amount: 18000, date: '2025-03-15', category_id: catRent.id });

      const res = await agent().get('/api/reports/yearly?year=2025');
      assert.equal(res.status, 200);
      assert.equal(res.body.year, '2025');
      assert.ok(Array.isArray(res.body.months));

      const jan = res.body.months.find(m => m.month === '01');
      assert.ok(jan);
      assert.equal(jan.income, 50000);
      assert.equal(jan.expense, 20000);
      assert.equal(jan.net, 30000);

      const mar = res.body.months.find(m => m.month === '03');
      assert.ok(mar);
      assert.equal(mar.income, 55000);
      assert.equal(mar.expense, 18000);
    });

    it('returns 400 for invalid year format', async () => {
      const res = await agent().get('/api/reports/yearly?year=twenty');
      assert.equal(res.status, 400);
    });

    it('returns empty array when no data', async () => {
      const res = await agent().get('/api/reports/yearly?year=2019');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.months, []);
    });
  });

  describe('GET /api/reports/categories', () => {
    it('returns category breakdown with percentages summing to ~100', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 8000, date: '2025-03-01', category_id: catFood.id });
      makeTransaction(acct.id, { type: 'expense', amount: 12000, date: '2025-03-05', category_id: catRent.id });

      const res = await agent().get('/api/reports/categories?from=2025-03-01&to=2025-03-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.categories));
      assert.equal(res.body.categories.length, 2);

      const totalPct = res.body.categories.reduce((s, c) => s + c.percentage, 0);
      assert.ok(Math.abs(totalPct - 100) < 0.1, `Percentages sum to ${totalPct}, expected ~100`);

      // Rent = 60%, Food = 40%
      const rent = res.body.categories.find(c => c.name === 'Rent');
      assert.equal(rent.amount, 12000);
      assert.equal(rent.percentage, 60);

      const food = res.body.categories.find(c => c.name === 'Food');
      assert.equal(food.amount, 8000);
      assert.equal(food.percentage, 40);
    });

    it('returns 400 for missing from/to', async () => {
      const res = await agent().get('/api/reports/categories?from=2025-03-01');
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/reports/compare', () => {
    it('shows differences between two months', async () => {
      // January
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2025-01-10', category_id: catSalary.id });
      makeTransaction(acct.id, { type: 'expense', amount: 30000, date: '2025-01-15', category_id: catRent.id });
      // February
      makeTransaction(acct.id, { type: 'income', amount: 55000, date: '2025-02-10', category_id: catSalary.id });
      makeTransaction(acct.id, { type: 'expense', amount: 25000, date: '2025-02-15', category_id: catRent.id });

      const res = await agent().get('/api/reports/compare?month1=2025-01&month2=2025-02');
      assert.equal(res.status, 200);

      assert.equal(res.body.month1.month, '2025-01');
      assert.equal(res.body.month1.income, 50000);
      assert.equal(res.body.month1.expense, 30000);

      assert.equal(res.body.month2.month, '2025-02');
      assert.equal(res.body.month2.income, 55000);
      assert.equal(res.body.month2.expense, 25000);

      assert.equal(res.body.diff.income, 5000);
      assert.equal(res.body.diff.expense, -5000);
      assert.equal(res.body.diff.net, 10000);
    });

    it('returns 400 for invalid month format', async () => {
      const res = await agent().get('/api/reports/compare?month1=2025-01&month2=bad');
      assert.equal(res.status, 400);
    });

    it('returns 400 for missing month2', async () => {
      const res = await agent().get('/api/reports/compare?month1=2025-01');
      assert.equal(res.status, 400);
    });
  });

  describe('auth', () => {
    it('returns 401 without session token', async () => {
      const res = await rawAgent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res.status, 401);
    });
  });
});
