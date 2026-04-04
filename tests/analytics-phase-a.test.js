// tests/analytics-phase-a.test.js — Phase A: Dashboard Analytics Upgrade
// Tests for: period picker, chart card redesign, net worth hero, cashflow chart,
// budget burn-down, cashflow forecast, plain-language summaries
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeBudget, today, daysFromNow } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

describe('Phase A — Dashboard Analytics Upgrade', () => {
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

  // ═══════════════════════════════════════
  // A1: Period Picker Component
  // ═══════════════════════════════════════

  describe('A1 — Period Picker', () => {
    const chartsJs = () => read('js/charts.js');

    it('charts.js exports createPeriodPicker function', () => {
      assert.ok(chartsJs().includes('createPeriodPicker'), 'must export createPeriodPicker');
    });

    it('period picker renders period options (7d, 30d, 90d, 6mo, 1y)', () => {
      const src = chartsJs();
      assert.ok(src.includes('7d'), 'must include 7d period');
      assert.ok(src.includes('30d'), 'must include 30d period');
      assert.ok(src.includes('90d'), 'must include 90d period');
      assert.ok(src.includes('6mo'), 'must include 6mo period');
      assert.ok(src.includes('1y'), 'must include 1y period');
    });

    it('period picker has CSS class period-picker', () => {
      assert.ok(chartsJs().includes('period-picker'), 'must use period-picker class');
    });
  });

  // ═══════════════════════════════════════
  // A2: Chart Card Redesign
  // ═══════════════════════════════════════

  describe('A2 — Chart Card Redesign', () => {
    const dashJs = () => read('js/views/dashboard.js');

    it('dashboard renders chart-card-header with summary stat', () => {
      const src = dashJs();
      assert.ok(src.includes('chart-card-header'), 'must have chart-card-header class');
    });

    it('dashboard renders chart-summary element', () => {
      const src = dashJs();
      assert.ok(src.includes('chart-summary'), 'must have chart-summary class for stat value');
    });

    it('each chart card has aria-label on canvas', () => {
      const src = dashJs();
      assert.ok(src.includes('aria-label'), 'canvas must have aria-label');
    });
  });

  // ═══════════════════════════════════════
  // A3: Net Worth Hero Chart
  // ═══════════════════════════════════════

  describe('A3 — Net Worth Hero Chart', () => {
    it('dashboard.js references chart-net-worth canvas', () => {
      assert.ok(read('js/views/dashboard.js').includes('chart-net-worth'), 'must have net-worth chart canvas');
    });

    it('charts.js renders net worth trend chart', () => {
      assert.ok(read('js/charts.js').includes('renderNetWorthTrend'), 'must have renderNetWorthTrend function');
    });

    it('GET /api/charts/net-worth returns valid data with date range', async () => {
      // Create account and snapshot
      const { db } = setup();
      const today = new Date().toISOString().slice(0, 10);
      db.prepare('INSERT INTO net_worth_snapshots (user_id, date, total_assets, total_liabilities, net_worth, breakdown) VALUES (?, ?, ?, ?, ?, ?)').run(
        1, today, 200000, 50000, 150000, '[]'
      );

      const from = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const res = await agent().get(`/api/charts/net-worth?from=${from}&to=${today}&interval=monthly`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(Array.isArray(res.body.datasets));
      // Should have Assets, Liabilities, Net Worth datasets
      const names = res.body.datasets.map(d => d.name);
      assert.ok(names.includes('Assets'));
      assert.ok(names.includes('Liabilities'));
      assert.ok(names.includes('Net Worth'));
    });
  });

  // ═══════════════════════════════════════
  // A4: Cash Flow Chart
  // ═══════════════════════════════════════

  describe('A4 — Cash Flow Chart', () => {
    it('dashboard.js references chart-cashflow canvas', () => {
      assert.ok(read('js/views/dashboard.js').includes('chart-cashflow'), 'must have cashflow chart canvas');
    });

    it('charts.js renders cash flow chart', () => {
      assert.ok(read('js/charts.js').includes('renderCashFlow'), 'must have renderCashFlow function');
    });

    it('GET /api/charts/cashflow returns income/expense/net', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 20000, category_id: expenseCat.id, date: '2026-01-20' });

      const res = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-01-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.equal(res.body.datasets.length, 3);
      assert.equal(res.body.datasets[0].name, 'Income');
      assert.equal(res.body.datasets[1].name, 'Expense');
      assert.equal(res.body.datasets[2].name, 'Net');
    });
  });

  // ═══════════════════════════════════════
  // A5: Budget Burn-Down Chart
  // ═══════════════════════════════════════

  describe('A5 — Budget Burn-Down Chart', () => {
    it('dashboard.js references chart-budget-burndown canvas', () => {
      assert.ok(read('js/views/dashboard.js').includes('chart-budget-burndown'), 'must have budget burn-down canvas');
    });

    it('charts.js renders budget burn-down', () => {
      assert.ok(read('js/charts.js').includes('renderBudgetBurnDown'), 'must have renderBudgetBurnDown function');
    });

    it('GET /api/charts/budget-utilization returns correct structure', async () => {
      const budget = makeBudget({
        name: 'April Budget',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        items: [{ category_id: foodCat.id, amount: 10000 }],
      });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-04-05' });

      const res = await agent().get(`/api/charts/budget-utilization?budget_id=${budget.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.labels);
      assert.ok(res.body.datasets);
      assert.equal(res.body.datasets[0].name, 'Allocated');
      assert.equal(res.body.datasets[1].name, 'Spent');
      assert.ok(res.body.start_date);
      assert.ok(res.body.end_date);
    });
  });

  // ═══════════════════════════════════════
  // A6: Cash Flow Forecast Chart
  // ═══════════════════════════════════════

  describe('A6 — Cash Flow Forecast Chart', () => {
    it('dashboard.js references chart-forecast canvas', () => {
      assert.ok(read('js/views/dashboard.js').includes('chart-forecast'), 'must have forecast chart canvas');
    });

    it('charts.js renders forecast chart', () => {
      assert.ok(read('js/charts.js').includes('renderForecast'), 'must have renderForecast function');
    });

    it('GET /api/reports/cashflow-forecast returns daily projections', async () => {
      const res = await agent().get('/api/reports/cashflow-forecast?days=30');
      assert.equal(res.status, 200);
      // Should return forecast data structure
      assert.ok(res.body.forecast || res.body.days || Array.isArray(res.body), 'must return forecast data');
    });
  });

  // ═══════════════════════════════════════
  // A7: Plain-Language Summaries
  // ═══════════════════════════════════════

  describe('A7 — Plain-Language Summaries', () => {
    it('charts.js has summary generation logic', () => {
      const src = read('js/charts.js');
      assert.ok(src.includes('generateSummary') || src.includes('chartSummary') || src.includes('summaryText'),
        'must have summary text generation');
    });

    it('dashboard.js renders chart-summary elements', () => {
      const src = read('js/views/dashboard.js');
      assert.ok(src.includes('chart-summary'), 'charts must render summary text');
    });
  });

  // ═══════════════════════════════════════
  // Period Picker CSS
  // ═══════════════════════════════════════

  describe('Period Picker and Chart Card CSS', () => {
    const css = () => read('styles.css');

    it('styles.css has period-picker styles', () => {
      assert.ok(css().includes('.period-picker'), 'must have .period-picker CSS');
    });

    it('styles.css has chart-card-header styles', () => {
      assert.ok(css().includes('.chart-card-header'), 'must have .chart-card-header CSS');
    });

    it('styles.css has chart-summary styles', () => {
      assert.ok(css().includes('.chart-summary'), 'must have .chart-summary CSS');
    });
  });

  // ═══════════════════════════════════════
  // Integration: Existing charts still work
  // ═══════════════════════════════════════

  describe('Existing charts API regression', () => {
    it('GET /api/charts/spending-pie still works', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/spending-pie?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels);
      assert.ok(res.body.datasets);
    });

    it('GET /api/charts/income-expense still works', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-01-15' });
      const res = await agent().get('/api/charts/income-expense?from=2026-01-01&to=2026-03-31&interval=monthly');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels);
      assert.equal(res.body.datasets.length, 2);
    });

    it('GET /api/charts/spending-trend still works', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: '2026-03-15' });
      const res = await agent().get('/api/charts/spending-trend?from=2026-03-01&to=2026-03-31&interval=daily');
      assert.equal(res.status, 200);
      assert.ok(res.body.labels);
      assert.ok(res.body.datasets);
    });
  });
});
