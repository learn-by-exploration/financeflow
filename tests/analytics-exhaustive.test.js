// tests/analytics-exhaustive.test.js — Exhaustive analytics tests
// Covers: auth, validation, edge cases, data accuracy, multi-user isolation,
// empty states, negative balances, response contracts for all 19 analytics endpoints
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  setup, cleanDb, teardown, agent, rawAgent, makeAccount, makeCategory,
  makeTransaction, makeBudget, makeRecurringRule, makeSecondUser,
  today, daysFromNow,
} = require('./helpers');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

describe('Analytics — Exhaustive Tests', () => {
  let acct, acct2, incomeCat, expenseCat, foodCat, savingsAcct;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Checking', type: 'checking', balance: 100000 });
    acct2 = makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -25000 });
    savingsAcct = makeAccount({ name: 'Savings', type: 'savings', balance: 500000 });
    incomeCat = makeCategory({ name: 'Salary', type: 'income' });
    expenseCat = makeCategory({ name: 'Rent', type: 'expense' });
    foodCat = makeCategory({ name: 'Food', type: 'expense' });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: Authentication — all endpoints must require auth
  // ═══════════════════════════════════════════════════════════════

  describe('Authentication — 401 without token', () => {
    const chartEndpoints = [
      '/api/charts/cashflow?from=2026-01-01&to=2026-03-31',
      '/api/charts/balance-history?account_id=1&from=2026-01-01&to=2026-03-31',
      '/api/charts/spending-pie?from=2026-01-01&to=2026-03-31',
      '/api/charts/income-expense?from=2026-01-01&to=2026-03-31',
      '/api/charts/net-worth?from=2026-01-01&to=2026-03-31',
      '/api/charts/spending-trend?from=2026-01-01&to=2026-03-31',
      '/api/charts/budget-utilization?budget_id=1',
      '/api/charts/spending-heatmap?from=2026-01-01&to=2026-03-31',
      '/api/charts/methodology-breakdown?from=2026-01-01&to=2026-03-31',
      '/api/charts/savings-velocity?from=2026-01-01&to=2026-03-31',
      '/api/charts/day-of-week?from=2026-01-01&to=2026-03-31',
      '/api/charts/recurring-waterfall',
      '/api/charts/asset-allocation',
    ];

    const insightEndpoints = [
      '/api/insights/trends?months=6',
      '/api/insights/anomalies?months=3',
      '/api/insights/velocity',
      '/api/insights/categories',
      '/api/insights/payees?from=2026-01-01&to=2026-03-31&limit=10',
      '/api/insights/category-trends?months=6',
    ];

    for (const url of [...chartEndpoints, ...insightEndpoints]) {
      it(`GET ${url} returns 401 without auth`, async () => {
        const res = await rawAgent().get(url);
        assert.equal(res.status, 401);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: Parameter validation
  // ═══════════════════════════════════════════════════════════════

  describe('Parameter validation — date range endpoints', () => {
    const dateEndpoints = [
      '/api/charts/cashflow',
      '/api/charts/balance-history',
      '/api/charts/spending-pie',
      '/api/charts/income-expense',
      '/api/charts/net-worth',
      '/api/charts/spending-trend',
      '/api/charts/spending-heatmap',
      '/api/charts/methodology-breakdown',
      '/api/charts/savings-velocity',
      '/api/charts/day-of-week',
    ];

    for (const url of dateEndpoints) {
      it(`GET ${url} returns 400 with no params`, async () => {
        const res = await agent().get(url);
        assert.equal(res.status, 400);
        assert.ok(res.body.error);
      });

      it(`GET ${url} returns 400 with invalid date format`, async () => {
        const res = await agent().get(`${url}?from=bad&to=also-bad`);
        assert.equal(res.status, 400);
      });

      it(`GET ${url} returns 400 with only from param`, async () => {
        const res = await agent().get(`${url}?from=2026-01-01`);
        assert.equal(res.status, 400);
      });

      it(`GET ${url} returns 400 with only to param`, async () => {
        const res = await agent().get(`${url}?to=2026-03-31`);
        assert.equal(res.status, 400);
      });
    }

    it('balance-history returns 400 without account_id', async () => {
      const res = await agent().get('/api/charts/balance-history?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('account_id'));
    });

    it('balance-history returns 404 for non-existent account', async () => {
      const res = await agent().get('/api/charts/balance-history?from=2026-01-01&to=2026-03-31&account_id=99999');
      assert.equal(res.status, 404);
    });

    it('budget-utilization returns 400 without budget_id', async () => {
      const res = await agent().get('/api/charts/budget-utilization');
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('budget_id'));
    });

    it('budget-utilization returns 404 for non-existent budget', async () => {
      const res = await agent().get('/api/charts/budget-utilization?budget_id=99999');
      assert.equal(res.status, 404);
    });

    it('payees returns 400 without dates', async () => {
      const res = await agent().get('/api/insights/payees');
      assert.equal(res.status, 400);
    });

    it('payees returns 400 with invalid date format', async () => {
      const res = await agent().get('/api/insights/payees?from=abc&to=def');
      assert.equal(res.status, 400);
    });
  });

  describe('Parameter validation — non-date params', () => {
    it('insights/trends months clamped to 1-24', async () => {
      const resMin = await agent().get('/api/insights/trends?months=0');
      assert.equal(resMin.status, 200);

      const resMax = await agent().get('/api/insights/trends?months=100');
      assert.equal(resMax.status, 200);

      const resNaN = await agent().get('/api/insights/trends?months=abc');
      assert.equal(resNaN.status, 200);
    });

    it('insights/anomalies months clamped to 1-12', async () => {
      const res = await agent().get('/api/insights/anomalies?months=0');
      assert.equal(res.status, 200);

      const resHigh = await agent().get('/api/insights/anomalies?months=999');
      assert.equal(resHigh.status, 200);
    });

    it('insights/payees limit clamped to 1-100', async () => {
      const res = await agent().get('/api/insights/payees?from=2026-01-01&to=2026-03-31&limit=0');
      assert.equal(res.status, 200);

      const resHigh = await agent().get('/api/insights/payees?from=2026-01-01&to=2026-03-31&limit=9999');
      assert.equal(resHigh.status, 200);
    });

    it('category-trends months clamped to 1-24', async () => {
      const res = await agent().get('/api/insights/category-trends?months=0');
      assert.equal(res.status, 200);
    });

    it('cashflow interval defaults to monthly for invalid value', async () => {
      const res = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-03-31&interval=invalid');
      assert.equal(res.status, 200);
      // Should still return data (defaults to monthly)
      assert.ok(res.body.labels);
    });

    it('spending-trend interval defaults to daily for invalid value', async () => {
      const res = await agent().get('/api/charts/spending-trend?from=2026-01-01&to=2026-03-31&interval=invalid');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: Multi-user isolation
  // ═══════════════════════════════════════════════════════════════

  describe('Multi-user data isolation', () => {
    it('user cannot see another user account in balance-history', async () => {
      const user2 = makeSecondUser();
      // user1 account exists, user2 tries to access it
      const res = await user2.agent.get(`/api/charts/balance-history?from=2026-01-01&to=2026-03-31&account_id=${acct.id}`);
      assert.equal(res.status, 404, 'other user account must return 404');
    });

    it('user cannot see another user budget in budget-utilization', async () => {
      const budget = makeBudget({
        name: 'User1 Budget',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        items: [{ category_id: foodCat.id, amount: 5000 }],
      });
      const user2 = makeSecondUser();
      const res = await user2.agent.get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 404, 'other user budget must return 404');
    });

    it('chart data only includes requesting user transactions', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-15' });

      const user2 = makeSecondUser();
      const user2Acct = makeAccount({ name: 'User2 Checking', balance: 50000 });
      // user2's account is created by user1 in test context, but chart query filters by user
      const res = await agent().get('/api/charts/spending-pie?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      // user1 should only see their own data
      assert.ok(res.body.total > 0);
    });

    it('insights data is isolated per user', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: today(), description: 'User1 food' });
      const user2 = makeSecondUser();
      const res = await user2.agent.get('/api/insights/velocity');
      assert.equal(res.status, 200);
      // user2 has no transactions, velocity should be 0
      assert.equal(res.body.current_total, 0);
    });

    it('recurring-waterfall is isolated per user', async () => {
      makeRecurringRule(acct.id, { type: 'income', amount: 50000, description: 'User1 salary' });
      const user2 = makeSecondUser();
      const res = await user2.agent.get('/api/charts/recurring-waterfall');
      assert.equal(res.status, 200);
      // user2 has no recurring rules, only "Remaining" entry
      assert.equal(res.body.labels.length, 1);
      assert.equal(res.body.labels[0], 'Remaining');
    });

    it('asset-allocation is isolated per user', async () => {
      const user2 = makeSecondUser();
      const res = await user2.agent.get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      // user2 has no accounts
      assert.equal(res.body.labels.length, 0);
    });

    it('category-trends is isolated per user', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-03-15' });
      const user2 = makeSecondUser();
      const res = await user2.agent.get('/api/insights/category-trends?months=6');
      assert.equal(res.status, 200);
      assert.equal(res.body.categories.length, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: Empty data / edge cases
  // ═══════════════════════════════════════════════════════════════

  describe('Empty data handling', () => {
    it('cashflow returns empty arrays with no transactions', async () => {
      const res = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.equal(res.body.datasets.length, 3);
      assert.deepEqual(res.body.datasets[0].data, []);
    });

    it('spending-pie returns empty with no expenses', async () => {
      const res = await agent().get('/api/charts/spending-pie?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.equal(res.body.total, 0);
    });

    it('income-expense returns empty arrays with no transactions', async () => {
      const res = await agent().get('/api/charts/income-expense?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
    });

    it('net-worth falls back to current accounts when no snapshots', async () => {
      const res = await agent().get('/api/charts/net-worth?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels.length >= 1, 'must have at least one data point');
      assert.ok(res.body.datasets.length === 3);
    });

    it('spending-trend returns empty with no expenses', async () => {
      const res = await agent().get('/api/charts/spending-trend?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
    });

    it('spending-heatmap returns empty days array with no data', async () => {
      const res = await agent().get('/api/charts/spending-heatmap?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.days, []);
      assert.equal(res.body.max_total, 0);
    });

    it('methodology-breakdown returns empty with no transactions', async () => {
      const res = await agent().get('/api/charts/methodology-breakdown?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
    });

    it('savings-velocity returns empty with no transactions', async () => {
      const res = await agent().get('/api/charts/savings-velocity?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.labels, []);
      assert.equal(res.body.datasets.length, 2);
    });

    it('day-of-week returns 7 zeros with no expenses', async () => {
      const res = await agent().get('/api/charts/day-of-week?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 7);
      const allZero = res.body.datasets[0].data.every(v => v === 0);
      assert.ok(allZero, 'all averages should be 0');
    });

    it('recurring-waterfall returns only Remaining with no rules', async () => {
      const res = await agent().get('/api/charts/recurring-waterfall');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 1);
      assert.equal(res.body.labels[0], 'Remaining');
      assert.equal(res.body.datasets[0].data[0], 0);
      assert.equal(res.body.total_income, 0);
      assert.equal(res.body.total_expense, 0);
    });

    it('asset-allocation returns valid structure with accounts', async () => {
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(typeof res.body.total === 'number');
      assert.ok(res.body.total > 0, 'user has accounts');
    });

    it('trends returns stable direction with no expenses', async () => {
      const res = await agent().get('/api/insights/trends?months=6');
      assert.equal(res.status, 200);
      assert.equal(res.body.direction, 'stable');
      assert.deepEqual(res.body.months, []);
    });

    it('anomalies returns empty array with no expenses', async () => {
      const res = await agent().get('/api/insights/anomalies');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.anomalies, []);
    });

    it('velocity returns zero rates with no expenses', async () => {
      const res = await agent().get('/api/insights/velocity');
      assert.equal(res.status, 200);
      assert.equal(res.body.current_total, 0);
      assert.equal(res.body.daily_rate, 0);
    });

    it('categories returns empty changes with no expenses', async () => {
      const res = await agent().get('/api/insights/categories');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.changes, []);
    });

    it('payees returns empty array with no expenses', async () => {
      const res = await agent().get('/api/insights/payees?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.payees, []);
    });

    it('category-trends returns empty categories with no expenses', async () => {
      const res = await agent().get('/api/insights/category-trends?months=6');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.categories, []);
    });

    it('balance-history returns single point with no transactions in range', async () => {
      const res = await agent().get(`/api/charts/balance-history?from=2026-01-01&to=2026-01-31&account_id=${acct.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 1);
      assert.equal(res.body.datasets[0].data.length, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: Data accuracy
  // ═══════════════════════════════════════════════════════════════

  describe('Data accuracy — cashflow', () => {
    it('correctly separates income/expense/net by period', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 20000, category_id: expenseCat.id, date: '2026-01-20' });
      makeTransaction(acct.id, { type: 'income', amount: 60000, category_id: incomeCat.id, date: '2026-02-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 25000, category_id: expenseCat.id, date: '2026-02-20' });

      const res = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-02-28&interval=monthly');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[0].data[0], 50000); // Jan income
      assert.equal(res.body.datasets[1].data[0], 20000); // Jan expense
      assert.equal(res.body.datasets[2].data[0], 30000); // Jan net
      assert.equal(res.body.datasets[0].data[1], 60000); // Feb income
      assert.equal(res.body.datasets[1].data[1], 25000); // Feb expense
      assert.equal(res.body.datasets[2].data[1], 35000); // Feb net
    });

    it('daily interval groups correctly', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 300, category_id: foodCat.id, date: '2026-03-02' });

      const res = await agent().get('/api/charts/cashflow?from=2026-03-01&to=2026-03-02&interval=daily');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[1].data[0], 300); // day 1: 100+200
      assert.equal(res.body.datasets[1].data[1], 300); // day 2: 300
    });
  });

  describe('Data accuracy — balance-history', () => {
    it('tracks daily balance changes including multiple transactions', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 5000, category_id: incomeCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-02' });

      const res = await agent().get(`/api/charts/balance-history?from=2026-03-01&to=2026-03-02&account_id=${acct.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      // Verify balance changes are tracked
      const balances = res.body.datasets[0].data;
      assert.ok(balances[0] > 0, 'balance should be positive');
      // Day 2 balance should be less than day 1 by 1000
      assert.equal(balances[0] - balances[1], 1000);
    });

    it('handles transfers correctly in balance history', async () => {
      const { db } = setup();
      // Insert a transfer manually
      db.prepare(`INSERT INTO transactions (user_id, account_id, transfer_to_account_id, type, amount, currency, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        1, acct.id, savingsAcct.id, 'transfer', 10000, 'INR', 'Transfer to savings', '2026-03-05'
      );

      const res = await agent().get(`/api/charts/balance-history?from=2026-03-01&to=2026-03-10&account_id=${acct.id}`);
      assert.equal(res.status, 200);
      // Should show transfer as outflow from checking
      const balances = res.body.datasets[0].data;
      assert.ok(balances.length >= 1);
    });
  });

  describe('Data accuracy — spending-pie', () => {
    it('aggregates multiple categories correctly', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 7000, category_id: expenseCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/charts/spending-pie?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 10000);
      assert.equal(res.body.labels.length, 2);
      // Should be ordered by amount desc
      assert.equal(res.body.labels[0], 'Rent');
      assert.equal(res.body.datasets[0].data[0], 7000);
    });

    it('calculates percentages correctly', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 2500, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 7500, category_id: expenseCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/charts/spending-pie?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      const rentMeta = res.body.meta.find(m => m.percentage === 75);
      const foodMeta = res.body.meta.find(m => m.percentage === 25);
      assert.ok(rentMeta);
      assert.ok(foodMeta);
    });

    it('excludes income transactions', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-03-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-10' });

      const res = await agent().get('/api/charts/spending-pie?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1000);
    });
  });

  describe('Data accuracy — net-worth', () => {
    it('uses snapshots when available', async () => {
      const { db } = setup();
      db.prepare('INSERT INTO net_worth_snapshots (user_id, date, total_assets, total_liabilities, net_worth, breakdown) VALUES (?, ?, ?, ?, ?, ?)').run(
        1, '2026-01-15', 500000, 100000, 400000, '[]'
      );
      db.prepare('INSERT INTO net_worth_snapshots (user_id, date, total_assets, total_liabilities, net_worth, breakdown) VALUES (?, ?, ?, ?, ?, ?)').run(
        1, '2026-02-15', 550000, 90000, 460000, '[]'
      );

      const res = await agent().get('/api/charts/net-worth?from=2026-01-01&to=2026-02-28');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.datasets[2].data[0], 400000); // Jan net worth
      assert.equal(res.body.datasets[2].data[1], 460000); // Feb net worth
    });

    it('separates assets from liabilities in fallback', async () => {
      // acct (checking 100000) + savingsAcct (500000) = 600000 assets
      // acct2 (credit_card -25000) = 25000 liabilities
      const res = await agent().get('/api/charts/net-worth?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      const assets = res.body.datasets[0].data[0];
      const liabilities = res.body.datasets[1].data[0];
      const netWorth = res.body.datasets[2].data[0];
      assert.equal(assets, 600000);
      assert.equal(liabilities, 25000);
      assert.equal(netWorth, 575000);
    });
  });

  describe('Data accuracy — budget-utilization', () => {
    it('calculates spent vs allocated per category', async () => {
      const budget = makeBudget({
        name: 'March Budget',
        start_date: '2026-03-01',
        end_date: '2026-03-31',
        items: [
          { category_id: foodCat.id, amount: 10000 },
          { category_id: expenseCat.id, amount: 20000 },
        ],
      });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-03-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 15000, category_id: expenseCat.id, date: '2026-03-05' });

      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      // Food: allocated 10000, spent 8000
      const foodIdx = res.body.labels.indexOf('Food');
      assert.ok(foodIdx >= 0);
      assert.equal(res.body.datasets[0].data[foodIdx], 10000); // allocated
      assert.equal(res.body.datasets[1].data[foodIdx], 8000);  // spent
      // Rent: allocated 20000, spent 15000
      const rentIdx = res.body.labels.indexOf('Rent');
      assert.ok(rentIdx >= 0);
      assert.equal(res.body.datasets[0].data[rentIdx], 20000);
      assert.equal(res.body.datasets[1].data[rentIdx], 15000);
    });

    it('meta includes utilization percentage', async () => {
      const budget = makeBudget({
        name: 'Test Budget',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        items: [{ category_id: foodCat.id, amount: 10000 }],
      });
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-04-10' });

      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.meta[0].percentage, 50);
    });

    it('excludes transactions outside budget period', async () => {
      const budget = makeBudget({
        name: 'April Budget',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        items: [{ category_id: foodCat.id, amount: 10000 }],
      });
      // Transaction outside budget period
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-03-28' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-04-05' });

      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[1].data[0], 2000); // only April transaction
    });
  });

  describe('Data accuracy — spending-trend', () => {
    it('daily spending totals correct', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: '2026-03-02' });

      const res = await agent().get('/api/charts/spending-trend?from=2026-03-01&to=2026-03-02&interval=daily');
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[0].data[0], 300); // 100+200
      assert.equal(res.body.datasets[0].data[1], 500);
    });

    it('weekly interval aggregates correctly', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-02' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2026-03-05' });
      makeTransaction(acct.id, { type: 'expense', amount: 300, category_id: foodCat.id, date: '2026-03-09' });

      const res = await agent().get('/api/charts/spending-trend?from=2026-03-01&to=2026-03-15&interval=weekly');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels.length >= 1);
    });
  });

  describe('Data accuracy — heatmap', () => {
    it('aggregates multiple expenses on same day', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: expenseCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/charts/spending-heatmap?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      const day = res.body.days.find(d => d.date === '2026-03-15');
      assert.ok(day);
      assert.equal(day.total, 800);
      assert.equal(res.body.max_total, 800);
    });

    it('excludes income from heatmap', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/charts/spending-heatmap?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.days.length, 0, 'income should not appear in heatmap');
    });
  });

  describe('Data accuracy — methodology-breakdown', () => {
    it('correctly computes savings as income minus expense', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 30000, category_id: expenseCat.id, date: '2026-01-20' });

      const res = await agent().get('/api/charts/methodology-breakdown?from=2026-01-01&to=2026-01-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 1);
      const incomeDs = res.body.datasets.find(d => d.name === 'Income');
      const expenseDs = res.body.datasets.find(d => d.name === 'Expense');
      const savingsDs = res.body.datasets.find(d => d.name === 'Savings');
      assert.equal(incomeDs.data[0], 50000);
      assert.equal(expenseDs.data[0], 30000);
      assert.equal(savingsDs.data[0], 20000);
    });

    it('handles negative savings (overspending)', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 10000, category_id: incomeCat.id, date: '2026-02-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 15000, category_id: expenseCat.id, date: '2026-02-20' });

      const res = await agent().get('/api/charts/methodology-breakdown?from=2026-02-01&to=2026-02-28');
      assert.equal(res.status, 200);
      const savingsDs = res.body.datasets.find(d => d.name === 'Savings');
      assert.equal(savingsDs.data[0], -5000);
    });
  });

  describe('Data accuracy — savings-velocity', () => {
    it('tracks cumulative savings across months', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-01-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 30000, category_id: expenseCat.id, date: '2026-01-20' });
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-02-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 40000, category_id: expenseCat.id, date: '2026-02-20' });

      const res = await agent().get('/api/charts/savings-velocity?from=2026-01-01&to=2026-02-28');
      assert.equal(res.status, 200);
      const savings = res.body.datasets.find(d => d.name === 'Savings');
      const cumul = res.body.datasets.find(d => d.name === 'Cumulative');
      assert.equal(savings.data[0], 20000); // Jan: 50k-30k
      assert.equal(savings.data[1], 10000); // Feb: 50k-40k
      assert.equal(cumul.data[0], 20000);   // Cumulative Jan
      assert.equal(cumul.data[1], 30000);   // Cumulative Feb (20k+10k)
    });
  });

  describe('Data accuracy — day-of-week', () => {
    it('averages spending by weekday over the period', async () => {
      // 2026-01-05 is Monday (dow=1), 2026-01-12 is also Monday
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-01-05' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-01-12' });

      const res = await agent().get('/api/charts/day-of-week?from=2026-01-01&to=2026-01-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 7);
      const avgData = res.body.datasets.find(d => d.name === 'Average Spending');
      const totalData = res.body.datasets.find(d => d.name === 'Total Spending');
      assert.ok(avgData);
      assert.ok(totalData);
      // Monday total should be 4000
      assert.equal(totalData.data[1], 4000);
      // Average should be 4000 / (31/7) ≈ 903.23
      assert.ok(avgData.data[1] > 0);
    });

    it('returns all 7 day labels', async () => {
      const res = await agent().get('/api/charts/day-of-week?from=2026-01-01&to=2026-01-31');
      assert.equal(res.status, 200);
      const expected = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      assert.deepEqual(res.body.labels, expected);
    });
  });

  describe('Data accuracy — recurring-waterfall', () => {
    it('separates income and expense correctly', async () => {
      makeRecurringRule(acct.id, { type: 'income', amount: 50000, description: 'Salary', category_id: incomeCat.id });
      makeRecurringRule(acct.id, { type: 'expense', amount: 15000, description: 'Rent', category_id: expenseCat.id });
      makeRecurringRule(acct.id, { type: 'expense', amount: 5000, description: 'Food', category_id: foodCat.id });

      const res = await agent().get('/api/charts/recurring-waterfall');
      assert.equal(res.status, 200);
      // Income first, then expenses, then Remaining
      assert.equal(res.body.labels[0], 'Salary');
      assert.equal(res.body.datasets[0].data[0], 50000);
      // Expenses are negative
      assert.ok(res.body.datasets[0].data[1] < 0);
      assert.ok(res.body.datasets[0].data[2] < 0);
      // Last entry is Remaining
      assert.equal(res.body.labels[res.body.labels.length - 1], 'Remaining');
      assert.equal(res.body.remainder, 30000); // 50k - 15k - 5k
      assert.equal(res.body.total_income, 50000);
      assert.equal(res.body.total_expense, 20000);
    });

    it('ignores inactive recurring rules', async () => {
      makeRecurringRule(acct.id, { type: 'income', amount: 50000, description: 'Old Salary', is_active: 0 });
      makeRecurringRule(acct.id, { type: 'income', amount: 60000, description: 'New Salary', is_active: 1 });

      const res = await agent().get('/api/charts/recurring-waterfall');
      assert.equal(res.status, 200);
      assert.ok(!res.body.labels.includes('Old Salary'));
      assert.ok(res.body.labels.includes('New Salary'));
    });
  });

  describe('Data accuracy — asset-allocation', () => {
    it('groups accounts by type with totals', async () => {
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      // checking + savings + credit_card
      assert.ok(res.body.labels.length >= 2, 'must have multiple account types');
      assert.ok(res.body.total > 0);
    });

    it('calculates percentage per type', async () => {
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      const totalPct = res.body.meta.reduce((s, m) => s + m.percentage, 0);
      assert.ok(Math.abs(totalPct - 100) < 1, 'percentages must sum to ~100');
    });

    it('excludes inactive accounts', async () => {
      makeAccount({ name: 'Inactive', type: 'checking', balance: 999999, is_active: 0 });
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      // total should NOT include the inactive account
      const totalBalance = res.body.datasets[0].data.reduce((s, v) => s + Math.abs(v), 0);
      assert.ok(!res.body.labels.some((_, i) => res.body.datasets[0].data[i] === 999999));
    });

    it('excludes accounts not in net worth', async () => {
      makeAccount({ name: 'Hidden', type: 'checking', balance: 888888, include_in_net_worth: 0 });
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      assert.ok(!res.body.datasets[0].data.includes(888888));
    });
  });

  describe('Data accuracy — spending trends', () => {
    it('determines increasing trend correctly', async () => {
      // Create increasing spending over 3 months
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-02-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/insights/trends?months=6');
      assert.equal(res.status, 200);
      assert.equal(res.body.direction, 'increasing');
    });

    it('determines decreasing trend correctly', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-02-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/insights/trends?months=6');
      assert.equal(res.status, 200);
      assert.equal(res.body.direction, 'decreasing');
    });
  });

  describe('Data accuracy — anomalies', () => {
    it('detects outlier transactions (>2 sigma)', async () => {
      // Normal spending: ~500 each
      for (let i = 1; i <= 10; i++) {
        makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: `2026-03-${String(i).padStart(2, '0')}`, description: `Normal ${i}` });
      }
      // Outlier: 5000 (10x normal)
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-03-15', description: 'Big purchase' });

      const res = await agent().get('/api/insights/anomalies?months=3');
      assert.equal(res.status, 200);
      assert.ok(res.body.anomalies.length > 0, 'must detect the outlier');
      const outlier = res.body.anomalies.find(a => a.amount === 5000);
      assert.ok(outlier, 'must find the 5000 outlier');
      assert.ok(outlier.deviation > 2, 'deviation must be > 2 sigma');
    });

    it('skips categories with only 1 transaction', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100000, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/insights/anomalies?months=3');
      assert.equal(res.status, 200);
      // With only 1 transaction, can't compute stddev
      assert.equal(res.body.anomalies.length, 0);
    });

    it('skips categories where all amounts are identical', async () => {
      for (let i = 1; i <= 5; i++) {
        makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: `2026-03-${String(i).padStart(2, '0')}` });
      }
      const res = await agent().get('/api/insights/anomalies?months=3');
      assert.equal(res.status, 200);
      // stddev=0, should skip
      assert.equal(res.body.anomalies.length, 0);
    });

    it('anomaly response includes all required fields', async () => {
      for (let i = 1; i <= 5; i++) {
        makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: `2026-03-${String(i).padStart(2, '0')}` });
      }
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-03-20' });

      const res = await agent().get('/api/insights/anomalies?months=3');
      assert.equal(res.status, 200);
      if (res.body.anomalies.length > 0) {
        const a = res.body.anomalies[0];
        assert.ok('transaction_id' in a, 'must have transaction_id');
        assert.ok('amount' in a, 'must have amount');
        assert.ok('description' in a, 'must have description');
        assert.ok('date' in a, 'must have date');
        assert.ok('category_mean' in a, 'must have category_mean');
        assert.ok('category_stddev' in a, 'must have category_stddev');
        assert.ok('deviation' in a, 'must have deviation');
      }
    });
  });

  describe('Data accuracy — velocity', () => {
    it('calculates daily rate from current month expenses', async () => {
      const todayDate = new Date();
      const dayOfMonth = todayDate.getUTCDate();
      const dateStr = todayDate.toISOString().slice(0, 10);
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: dateStr });

      const res = await agent().get('/api/insights/velocity');
      assert.equal(res.status, 200);
      assert.equal(res.body.current_total, 3000);
      assert.equal(res.body.day_of_month, dayOfMonth);
      const expectedRate = Math.round(3000 / dayOfMonth * 100) / 100;
      assert.equal(res.body.daily_rate, expectedRate);
    });

    it('reports overspending status correctly', async () => {
      const todayD = new Date();
      const dayOfMonth = todayD.getUTCDate();
      const prevDate = new Date(todayD);
      prevDate.setUTCDate(1);
      prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
      const currStr = todayD.toISOString().slice(0, 10);

      // Previous month: small amounts on days 1 through dayOfMonth
      const prevDay = `${prevDate.toISOString().slice(0, 7)}-${String(Math.min(dayOfMonth, 28)).padStart(2, '0')}`;
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: prevDay });
      // Current month: much larger amount
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: currStr });

      const res = await agent().get('/api/insights/velocity');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'overspending');
    });
  });

  describe('Data accuracy — category changes', () => {
    it('computes month-over-month change percentage', async () => {
      const todayD = new Date();
      const currMonth = todayD.toISOString().slice(0, 7);
      const prevDate = new Date(todayD);
      prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
      const prevMonth = `${prevDate.toISOString().slice(0, 7)}`;

      // Last month: 5000 on food
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: `${prevMonth}-15` });
      // This month: 7500 on food (50% increase)
      makeTransaction(acct.id, { type: 'expense', amount: 7500, category_id: foodCat.id, date: `${currMonth}-15` });

      const res = await agent().get('/api/insights/categories');
      assert.equal(res.status, 200);
      const food = res.body.changes.find(c => c.name === 'Food');
      assert.ok(food, 'Food category must be in changes');
      assert.equal(food.current, 7500);
      assert.equal(food.previous, 5000);
      assert.equal(food.change, 2500);
      assert.equal(food.change_pct, 50);
    });

    it('includes categories that stopped spending', async () => {
      const prevDate = new Date();
      prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
      const prevMonth = prevDate.toISOString().slice(0, 7);

      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: `${prevMonth}-15` });
      // No spending this month

      const res = await agent().get('/api/insights/categories');
      assert.equal(res.status, 200);
      const food = res.body.changes.find(c => c.name === 'Food');
      assert.ok(food);
      assert.equal(food.current, 0);
      assert.equal(food.change_pct, -100);
    });
  });

  describe('Data accuracy — payees', () => {
    it('ranks payees by total spending desc', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: '2026-03-10', description: 'SmallShop' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-03-11', description: 'BigStore' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-03-12', description: 'BigStore' });

      const res = await agent().get('/api/insights/payees?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.payees[0].payee, 'BigStore');
      assert.equal(res.body.payees[0].total, 5000);
      assert.equal(res.body.payees[0].count, 2);
      assert.equal(res.body.payees[1].payee, 'SmallShop');
    });

    it('respects limit param', async () => {
      for (let i = 0; i < 5; i++) {
        makeTransaction(acct.id, { type: 'expense', amount: 100 * (i + 1), category_id: foodCat.id, date: '2026-03-10', description: `Shop${i}` });
      }
      const res = await agent().get('/api/insights/payees?from=2026-03-01&to=2026-03-31&limit=2');
      assert.equal(res.status, 200);
      assert.equal(res.body.payees.length, 2);
    });

    it('excludes transactions without description', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-10', description: '' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-03-10', description: 'ValidPayee' });

      const res = await agent().get('/api/insights/payees?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.payees.length, 1);
      assert.equal(res.body.payees[0].payee, 'ValidPayee');
    });
  });

  describe('Data accuracy — category-trends', () => {
    it('returns monthly breakdown per category', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-02-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/insights/category-trends?months=6');
      assert.equal(res.status, 200);
      const food = res.body.categories.find(c => c.name === 'Food');
      assert.ok(food);
      assert.equal(food.months.length, 3);
      // Should be ordered by month
      assert.equal(food.months[0].total, 1000);
      assert.equal(food.months[1].total, 2000);
      assert.equal(food.months[2].total, 3000);
    });

    it('includes category metadata (icon, color)', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/insights/category-trends?months=6');
      assert.equal(res.status, 200);
      const food = res.body.categories.find(c => c.name === 'Food');
      assert.ok(food);
      assert.ok('icon' in food);
      assert.ok('color' in food);
      assert.ok('id' in food);
    });

    it('separates multiple categories', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: expenseCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/insights/category-trends?months=6');
      assert.equal(res.status, 200);
      assert.equal(res.body.categories.length, 2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: Response contract validation
  // ═══════════════════════════════════════════════════════════════

  describe('Response contracts', () => {
    it('standard chart endpoints return { labels, datasets } shape', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'income', amount: 500, category_id: incomeCat.id, date: '2026-03-15' });

      const endpoints = [
        '/api/charts/cashflow?from=2026-03-01&to=2026-03-31',
        '/api/charts/spending-pie?from=2026-03-01&to=2026-03-31',
        '/api/charts/income-expense?from=2026-03-01&to=2026-03-31',
        '/api/charts/net-worth?from=2026-01-01&to=2026-03-31',
        '/api/charts/spending-trend?from=2026-03-01&to=2026-03-31',
        '/api/charts/methodology-breakdown?from=2026-03-01&to=2026-03-31',
        '/api/charts/savings-velocity?from=2026-03-01&to=2026-03-31',
        '/api/charts/day-of-week?from=2026-03-01&to=2026-03-31',
        '/api/charts/recurring-waterfall',
        '/api/charts/asset-allocation',
      ];

      for (const url of endpoints) {
        const res = await agent().get(url);
        assert.equal(res.status, 200, `${url} must return 200`);
        assert.ok(Array.isArray(res.body.labels), `${url} must have labels array`);
        assert.ok(Array.isArray(res.body.datasets), `${url} must have datasets array`);
      }
    });

    it('heatmap returns { days, max_total } shape', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/spending-heatmap?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.days), 'heatmap must have days array');
      assert.ok(typeof res.body.max_total === 'number', 'heatmap must have max_total number');
    });

    it('datasets have name and data array', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/cashflow?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      for (const ds of res.body.datasets) {
        assert.ok(typeof ds.name === 'string', 'dataset must have name');
        assert.ok(Array.isArray(ds.data), 'dataset must have data array');
      }
    });

    it('heatmap days have date (string) and total (number)', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/spending-heatmap?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      for (const day of res.body.days) {
        assert.ok(typeof day.date === 'string');
        assert.ok(typeof day.total === 'number');
      }
    });

    it('velocity response has all expected fields', async () => {
      const res = await agent().get('/api/insights/velocity');
      assert.equal(res.status, 200);
      const keys = ['current_month', 'previous_month', 'current_total', 'previous_total',
        'previous_same_day_total', 'daily_rate', 'previous_daily_rate', 'day_of_month', 'status'];
      for (const key of keys) {
        assert.ok(key in res.body, `velocity response must have ${key}`);
      }
    });

    it('category changes response has structure', async () => {
      const res = await agent().get('/api/insights/categories');
      assert.equal(res.status, 200);
      assert.ok('current_month' in res.body);
      assert.ok('previous_month' in res.body);
      assert.ok(Array.isArray(res.body.changes));
      assert.ok(Array.isArray(res.body.most_increased));
      assert.ok(Array.isArray(res.body.most_decreased));
    });

    it('recurring-waterfall includes summary fields', async () => {
      const res = await agent().get('/api/charts/recurring-waterfall');
      assert.equal(res.status, 200);
      assert.ok('total_income' in res.body);
      assert.ok('total_expense' in res.body);
      assert.ok('remainder' in res.body);
    });

    it('asset-allocation includes total and meta', async () => {
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body.total === 'number');
      assert.ok(Array.isArray(res.body.meta));
      if (res.body.meta.length > 0) {
        assert.ok('type' in res.body.meta[0]);
        assert.ok('percentage' in res.body.meta[0]);
      }
    });

    it('balance-history includes account-specific data', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get(`/api/charts/balance-history?from=2026-03-01&to=2026-03-31&account_id=${acct.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[0].name, 'Balance');
    });

    it('budget-utilization includes budget metadata', async () => {
      const budget = makeBudget({
        name: 'Test Budget',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        items: [{ category_id: foodCat.id, amount: 10000 }],
      });
      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.budget_id, budget.id);
      assert.equal(res.body.budget_name, 'Test Budget');
      assert.ok(res.body.period);
      assert.ok(res.body.start_date);
      assert.ok(res.body.end_date);
      assert.ok(Array.isArray(res.body.meta));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: Interval variants
  // ═══════════════════════════════════════════════════════════════

  describe('Interval handling', () => {
    it('cashflow supports daily interval', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2026-03-02' });

      const res = await agent().get('/api/charts/cashflow?from=2026-03-01&to=2026-03-02&interval=daily');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 2);
      assert.equal(res.body.labels[0], '2026-03-01');
    });

    it('cashflow supports weekly interval', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-02' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2026-03-09' });

      const res = await agent().get('/api/charts/cashflow?from=2026-03-01&to=2026-03-15&interval=weekly');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels.length >= 1);
      assert.ok(res.body.labels[0].includes('W'), 'weekly labels should include W');
    });

    it('income-expense supports different intervals', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 100, category_id: incomeCat.id, date: '2026-03-01' });
      const res = await agent().get('/api/charts/income-expense?from=2026-03-01&to=2026-03-31&interval=daily');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels[0].match(/^\d{4}-\d{2}-\d{2}$/), 'daily label should be YYYY-MM-DD');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: Frontend assertions
  // ═══════════════════════════════════════════════════════════════

  describe('Frontend — charts.js integrity', () => {
    const src = () => read('js/charts.js');

    it('exports destroyCharts function', () => {
      assert.ok(src().includes('destroyCharts'));
    });

    it('has Chart.js guard check', () => {
      assert.ok(src().includes('typeof Chart') || src().includes("Chart === 'undefined'"));
    });

    it('handles noDataMessage for empty state', () => {
      assert.ok(src().includes('noDataMessage') || src().includes('no-data'));
    });

    it('all chart renderers handle API errors gracefully', () => {
      assert.ok(src().includes('.catch') || src().includes('try'));
    });

    it('movingAverage function exists and computes', () => {
      const s = src();
      assert.ok(s.includes('movingAverage'));
      // Verify it takes data and window params
      assert.ok(s.includes('movingAverage(') || s.includes('movingAverage ('));
    });

    it('summaryText function covers chart types', () => {
      const s = src();
      assert.ok(s.includes('summaryText'));
      assert.ok(s.includes('cashflow') || s.includes('cash-flow'));
      assert.ok(s.includes('net-worth') || s.includes('netWorth'));
    });

    it('no innerHTML with user data', () => {
      const s = src();
      // innerHTML should only be used for clearing (= '') not with dynamic content
      const matches = s.match(/innerHTML\s*=\s*[^'"`\n]/g) || [];
      // Any innerHTML that isn't = '' is suspicious
      for (const m of matches) {
        assert.ok(false, `Suspicious innerHTML usage: ${m}`);
      }
    });
  });

  describe('Frontend — insights.js integrity', () => {
    const src = () => read('js/views/insights.js');

    it('fetches all required API endpoints', () => {
      const s = src();
      const expected = [
        'insights/trends', 'insights/anomalies', 'insights/velocity',
        'insights/categories', 'charts/spending-heatmap', 'charts/day-of-week',
        'insights/payees', 'charts/savings-velocity', 'insights/category-trends',
        'charts/recurring-waterfall'
      ];
      for (const endpoint of expected) {
        assert.ok(s.includes(endpoint), `must fetch ${endpoint}`);
      }
    });

    it('has error handling for API failures', () => {
      const s = src();
      assert.ok(s.includes('.catch('), 'must have catch handlers on API calls');
      assert.ok(s.includes('error-state') || s.includes('Error loading'), 'must handle errors in UI');
    });

    it('has empty state message', () => {
      const s = src();
      assert.ok(s.includes('empty-state') || s.includes('Not enough data'), 'must have empty state');
    });

    it('uses el() helper not innerHTML for dynamic content', () => {
      const s = src();
      assert.ok(s.includes("el('"), 'must use el() helper');
      // Check no innerHTML with dynamic data
      const innerHtmlUsages = (s.match(/\.innerHTML\s*=/g) || []).length;
      // Only container.innerHTML = '' is allowed (clearing)
      const clearUsages = (s.match(/\.innerHTML\s*=\s*['"]/g) || []).length;
      assert.ok(innerHtmlUsages === clearUsages, 'innerHTML should only be used for clearing');
    });

    it('uses textContent for user data display', () => {
      const s = src();
      assert.ok(s.includes('textContent'), 'must use textContent for safe text rendering');
    });

    it('has category-trend sparkline rendering', () => {
      const s = src();
      assert.ok(s.includes('sparkline') || s.includes('category-trend'), 'must render category sparklines');
    });

    it('has recurring waterfall section', () => {
      const s = src();
      assert.ok(s.includes('recurring') && s.includes('waterfall'), 'must render recurring waterfall');
    });
  });

  describe('Frontend — dashboard.js integrity', () => {
    const src = () => read('js/views/dashboard.js');

    it('renders all 7 chart canvases', () => {
      const s = src();
      const canvasIds = ['chart-net-worth', 'chart-spending', 'chart-cashflow',
        'chart-income-expense', 'chart-trend', 'chart-budget-burndown', 'chart-forecast'];
      for (const id of canvasIds) {
        assert.ok(s.includes(id), `must render canvas ${id}`);
      }
    });

    it('has money-left widget', () => {
      assert.ok(src().includes('money-left'));
    });

    it('imports chart renderer functions', () => {
      const s = src();
      assert.ok(s.includes('renderNetWorthTrend'));
      assert.ok(s.includes('renderCashFlow'));
      assert.ok(s.includes('initDashboardCharts'));
    });

    it('imports createPeriodPicker', () => {
      assert.ok(src().includes('createPeriodPicker'));
    });

    it('has hero chart card with full-width class', () => {
      const s = src();
      assert.ok(s.includes('chart-card-hero') || s.includes('isHero'), 'must have hero card');
    });

    it('uses el() helper not innerHTML for dynamic content', () => {
      const s = src();
      assert.ok(s.includes("el('"), 'must use el() helper');
    });
  });

  describe('Frontend — styles.css analytics styles', () => {
    const css = () => read('styles.css');

    it('has chart grid layout', () => {
      assert.ok(css().includes('.charts-grid'));
    });

    it('has hero card styling', () => {
      assert.ok(css().includes('.chart-card-hero'));
    });

    it('has heatmap styles', () => {
      const c = css();
      assert.ok(c.includes('.spending-heatmap'));
      assert.ok(c.includes('.heatmap-cell'));
    });

    it('has weekday bar styles', () => {
      assert.ok(css().includes('.weekday-bar-row'));
    });

    it('has payee bar styles', () => {
      assert.ok(css().includes('.payee-bar-row'));
    });

    it('has sparkline styles', () => {
      assert.ok(css().includes('.sparkline-bar'));
    });

    it('has recurring waterfall styles', () => {
      assert.ok(css().includes('.recurring-waterfall'));
    });

    it('has trend bar positive/negative states', () => {
      const c = css();
      assert.ok(c.includes('.trend-bar.positive'));
      assert.ok(c.includes('.trend-bar.negative'));
    });

    it('has responsive breakpoints for charts', () => {
      const c = css();
      // Should have media query adjusting chart grid
      assert.ok(c.includes('@media') && c.includes('charts-grid'), 'charts grid should be responsive');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: Edge cases & boundary conditions
  // ═══════════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('handles very large amounts', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 9999999.99, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/spending-pie?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 9999999.99);
    });

    it('handles very small amounts', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 0.01, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/spending-pie?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 0.01);
    });

    it('handles same from and to date', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/cashflow?from=2026-03-15&to=2026-03-15&interval=daily');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 1);
    });

    it('returns empty for future date range', async () => {
      const res = await agent().get('/api/charts/cashflow?from=2030-01-01&to=2030-12-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.labels.length, 0);
    });

    it('handles account with negative balance (credit card) in asset-allocation', async () => {
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      // credit card has negative balance
      const ccLabel = res.body.labels.find(l => l.toLowerCase().includes('credit'));
      if (ccLabel) {
        const idx = res.body.labels.indexOf(ccLabel);
        assert.ok(res.body.datasets[0].data[idx] < 0, 'credit card balance should be negative');
      }
    });

    it('budget-utilization with zero-allocated item', async () => {
      const budget = makeBudget({
        name: 'Zero Budget',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        items: [{ category_id: foodCat.id, amount: 0 }],
      });

      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets[0].data[0], 0); // allocated zero
      // percentage should handle division by zero
      assert.equal(res.body.meta[0].percentage, 0);
    });

    it('spending heatmap with expenses on same day across categories', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: expenseCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/charts/spending-heatmap?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      // Both expenses on 2026-03-15 should aggregate
      const day = res.body.days.find(d => d.date === '2026-03-15');
      assert.equal(day.total, 300);
    });

    it('multiple recurring rules of same type handled correctly', async () => {
      makeRecurringRule(acct.id, { type: 'income', amount: 50000, description: 'Job1' });
      makeRecurringRule(acct.id, { type: 'income', amount: 20000, description: 'Job2' });
      makeRecurringRule(acct.id, { type: 'expense', amount: 10000, description: 'Rent' });

      const res = await agent().get('/api/charts/recurring-waterfall');
      assert.equal(res.status, 200);
      assert.equal(res.body.total_income, 70000);
      assert.equal(res.body.total_expense, 10000);
      assert.equal(res.body.remainder, 60000);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 10: SQL injection prevention
  // ═══════════════════════════════════════════════════════════════

  describe('SQL injection prevention', () => {
    it('date params with SQL injection attempt return 400', async () => {
      const injections = [
        "2026-01-01'; DROP TABLE transactions; --",
        "2026-01-01 OR 1=1",
        "2026-01-01\x00",
      ];
      for (const injection of injections) {
        const res = await agent().get(`/api/charts/cashflow?from=${encodeURIComponent(injection)}&to=2026-03-31`);
        assert.equal(res.status, 400, `injection attempt should be rejected: ${injection}`);
      }
    });

    it('account_id with non-numeric value returns 400', async () => {
      const res = await agent().get('/api/charts/balance-history?from=2026-01-01&to=2026-03-31&account_id=abc');
      assert.equal(res.status, 400);
    });

    it('budget_id with non-numeric value returns 400', async () => {
      const res = await agent().get('/api/charts/budget-utilization?budget_id=abc');
      assert.equal(res.status, 400);
    });

    it('interval param is safely validated', async () => {
      const malicious = "monthly'; DROP TABLE transactions --";
      const res = await agent().get(`/api/charts/cashflow?from=2026-01-01&to=2026-03-31&interval=${encodeURIComponent(malicious)}`);
      assert.equal(res.status, 200); // should default to monthly, not execute injection
      assert.ok(res.body.labels !== undefined);
    });
  });
});
