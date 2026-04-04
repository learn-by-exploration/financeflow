// tests/analytics-phase-b.test.js — Phase B: Behavioral Insights
// Tests for: spending heatmap, methodology breakdown, savings velocity,
// day-of-week, payee chart, money-left, drill-down, accessibility
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeBudget, makeGoal, today, daysFromNow } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

describe('Phase B — Behavioral Insights', () => {
  let acct, incomeCat, expenseCat, foodCat, wantsCat;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Checking', balance: 100000 });
    incomeCat = makeCategory({ name: 'Salary', type: 'income' });
    expenseCat = makeCategory({ name: 'Rent', type: 'expense' });
    foodCat = makeCategory({ name: 'Food', type: 'expense' });
    wantsCat = makeCategory({ name: 'Entertainment', type: 'expense' });
  });

  // ═══════════════════════════════════════
  // B1: Spending Heatmap API
  // ═══════════════════════════════════════

  describe('B1 — GET /api/charts/spending-heatmap', () => {
    it('returns 200 with daily spending data', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: '2026-03-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-16' });

      const res = await agent().get('/api/charts/spending-heatmap?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.days), 'must have days array');
      assert.ok(res.body.days.length > 0, 'must have at least one day with spending');
    });

    it('each day has date and total fields', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 750, category_id: foodCat.id, date: '2026-02-10' });
      const res = await agent().get('/api/charts/spending-heatmap?from=2026-02-01&to=2026-02-28');
      assert.equal(res.status, 200);
      const day = res.body.days.find(d => d.date === '2026-02-10');
      assert.ok(day, 'must find the specific date');
      assert.equal(day.total, 750);
    });

    it('returns max_total for color scaling', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: expenseCat.id, date: '2026-03-01' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: foodCat.id, date: '2026-03-02' });
      const res = await agent().get('/api/charts/spending-heatmap?from=2026-03-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.equal(res.body.max_total, 5000);
    });

    it('validates date params', async () => {
      const res = await agent().get('/api/charts/spending-heatmap');
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════
  // B2: Methodology Breakdown API
  // ═══════════════════════════════════════

  describe('B2 — GET /api/charts/methodology-breakdown', () => {
    it('returns monthly needs/wants/savings split', async () => {
      // Needs (Rent)
      makeTransaction(acct.id, { type: 'expense', amount: 15000, category_id: expenseCat.id, date: '2026-01-15' });
      // Wants (Entertainment)
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: wantsCat.id, date: '2026-01-15' });
      // Income
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-01-10' });

      const res = await agent().get('/api/charts/methodology-breakdown?from=2026-01-01&to=2026-01-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(Array.isArray(res.body.datasets));
      // Should have Income, Needs/Expense, Savings datasets at minimum
      assert.ok(res.body.datasets.length >= 2, 'must have at least income and expense datasets');
    });

    it('validates date params', async () => {
      const res = await agent().get('/api/charts/methodology-breakdown');
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════
  // B3: Savings Velocity API
  // ═══════════════════════════════════════

  describe('B3 — GET /api/charts/savings-velocity', () => {
    it('returns monthly savings with cumulative total', async () => {
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: incomeCat.id, date: '2026-01-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 30000, category_id: expenseCat.id, date: '2026-01-15' });

      const res = await agent().get('/api/charts/savings-velocity?from=2026-01-01&to=2026-03-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(Array.isArray(res.body.datasets));
      const names = res.body.datasets.map(d => d.name);
      assert.ok(names.includes('Savings'), 'must have Savings dataset');
      assert.ok(names.includes('Cumulative'), 'must have Cumulative dataset');
    });

    it('validates date params', async () => {
      const res = await agent().get('/api/charts/savings-velocity');
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════
  // B4: Day of Week Pattern API
  // ═══════════════════════════════════════

  describe('B4 — GET /api/charts/day-of-week', () => {
    it('returns average spending per weekday', async () => {
      // 2026-01-05 is Monday, 2026-01-10 is Saturday
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: '2026-01-05' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: foodCat.id, date: '2026-01-10' });

      const res = await agent().get('/api/charts/day-of-week?from=2026-01-01&to=2026-01-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.equal(res.body.labels.length, 7, 'must have 7 weekdays');
      assert.ok(Array.isArray(res.body.datasets));
      assert.equal(res.body.datasets[0].data.length, 7);
    });

    it('validates date params', async () => {
      const res = await agent().get('/api/charts/day-of-week');
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════
  // B5: Payee Concentration (existing API)
  // ═══════════════════════════════════════

  describe('B5 — Payee insights endpoint still works', () => {
    it('GET /api/insights/payees returns top payees', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 1000, category_id: foodCat.id, date: '2026-03-10', description: 'Swiggy' });
      makeTransaction(acct.id, { type: 'expense', amount: 500, category_id: foodCat.id, date: '2026-03-11', description: 'Swiggy' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, category_id: expenseCat.id, date: '2026-03-12', description: 'Amazon' });

      const res = await agent().get('/api/insights/payees?from=2026-03-01&to=2026-03-31&limit=10');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.payees));
      assert.ok(res.body.payees.length >= 2);
    });
  });

  // ═══════════════════════════════════════
  // B6: Money Left Widget
  // ═══════════════════════════════════════

  describe('B6 — Money Left Widget', () => {
    it('dashboard.js has money-left widget', () => {
      const src = read('js/views/dashboard.js');
      assert.ok(src.includes('money-left') || src.includes('moneyLeft') || src.includes('budget-remaining'),
        'must have money-left widget');
    });
  });

  // ═══════════════════════════════════════
  // B7: Click-to-drill-down
  // ═══════════════════════════════════════

  describe('B7 — Drill-down on charts', () => {
    it('charts.js has onClick handlers for drill-down', () => {
      const src = read('js/charts.js');
      const onClickCount = (src.match(/onClick:/g) || []).length;
      assert.ok(onClickCount >= 2, `must have at least 2 onClick handlers for drill-down, found ${onClickCount}`);
    });
  });

  // ═══════════════════════════════════════
  // B8: Chart Accessibility
  // ═══════════════════════════════════════

  describe('B8 — Chart Accessibility', () => {
    it('dashboard.js has aria-label on all canvases', () => {
      const src = read('js/views/dashboard.js');
      assert.ok(src.includes("'aria-label'"), 'canvas must have aria-label');
    });

    it('insights.js renders charts or chart-like visualizations', () => {
      const src = read('js/views/insights.js');
      assert.ok(src.includes('chart') || src.includes('canvas') || src.includes('heatmap'),
        'insights must have visual charts');
    });
  });

  // ═══════════════════════════════════════
  // Frontend file assertions
  // ═══════════════════════════════════════

  describe('Frontend — Phase B chart elements', () => {
    it('insights.js references heatmap component', () => {
      const src = read('js/views/insights.js');
      assert.ok(src.includes('heatmap') || src.includes('spending-heatmap'),
        'insights must reference heatmap');
    });

    it('insights.js references day-of-week chart', () => {
      const src = read('js/views/insights.js');
      assert.ok(src.includes('day-of-week') || src.includes('dayOfWeek') || src.includes('weekday'),
        'insights must reference weekday pattern');
    });

    it('insights.js references payee chart', () => {
      const src = read('js/views/insights.js');
      assert.ok(src.includes('payee') || src.includes('payees'),
        'insights must reference payee data');
    });

    it('insights.js references savings velocity', () => {
      const src = read('js/views/insights.js');
      assert.ok(src.includes('savings') || src.includes('velocity'),
        'insights must reference savings data');
    });
  });
});
