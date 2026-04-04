// tests/analytics-phase-c.test.js — Phase C: Advanced Analytics
// Tests for: category sparklines, rolling averages, anomaly markers,
// recurring waterfall, asset allocation, FIRE progress
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, today, daysFromNow } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

describe('Phase C — Advanced Analytics', () => {
  let acct, acct2, incomeCat, expenseCat, foodCat;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Checking', balance: 100000 });
    acct2 = makeAccount({ name: 'Savings', balance: 500000 });
    incomeCat = makeCategory({ name: 'Salary', type: 'income' });
    expenseCat = makeCategory({ name: 'Rent', type: 'expense' });
    foodCat = makeCategory({ name: 'Food', type: 'expense' });
  });

  // ═══════════════════════════════════════
  // C1: Category Trend History
  // ═══════════════════════════════════════

  describe('C1 — GET /api/insights/category-trends', () => {
    it('returns monthly spending per category over time', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: foodCat.id, date: '2026-01-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 4000, category_id: foodCat.id, date: '2026-02-15' });
      makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: foodCat.id, date: '2026-03-15' });

      const res = await agent().get('/api/insights/category-trends?months=6');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.categories), 'must return categories array');
      const food = res.body.categories.find(c => c.name === 'Food');
      assert.ok(food, 'must include Food category');
      assert.ok(Array.isArray(food.months), 'must have months data');
      assert.ok(food.months.length > 0);
    });
  });

  // ═══════════════════════════════════════
  // C2: Rolling Averages (frontend-only)
  // ═══════════════════════════════════════

  describe('C2 — Rolling Averages', () => {
    it('charts.js computes moving averages', () => {
      const src = read('js/charts.js');
      assert.ok(src.includes('movingAverage') || src.includes('rollingAvg') || src.includes('moving_average'),
        'must compute moving averages');
    });
  });

  // ═══════════════════════════════════════
  // C3: Anomaly Markers (frontend-only)
  // ═══════════════════════════════════════

  describe('C3 — Anomaly Markers', () => {
    it('insights.js or charts.js references anomaly data for chart overlay', () => {
      const chartsJs = read('js/charts.js');
      const insightsJs = read('js/views/insights.js');
      const hasAnomaly = chartsJs.includes('anomal') || insightsJs.includes('anomal');
      assert.ok(hasAnomaly, 'must reference anomaly data for markers');
    });
  });

  // ═══════════════════════════════════════
  // C4: Recurring Waterfall API
  // ═══════════════════════════════════════

  describe('C4 — GET /api/charts/recurring-waterfall', () => {
    it('returns recurring income and expense breakdown', async () => {
      const { db } = setup();
      // Insert recurring rules
      db.prepare(`INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, frequency, description, next_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        1, acct.id, incomeCat.id, 'income', 50000, 'monthly', 'Salary', '2026-04-01', 1
      );
      db.prepare(`INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, frequency, description, next_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        1, acct.id, expenseCat.id, 'expense', 15000, 'monthly', 'Rent', '2026-04-05', 1
      );

      const res = await agent().get('/api/charts/recurring-waterfall');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(Array.isArray(res.body.datasets));
      assert.ok(res.body.labels.length >= 2, 'must have at least income and expense entries');
    });
  });

  // ═══════════════════════════════════════
  // C5: Asset Allocation API
  // ═══════════════════════════════════════

  describe('C5 — GET /api/charts/asset-allocation', () => {
    it('returns accounts grouped by type', async () => {
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.labels));
      assert.ok(Array.isArray(res.body.datasets));
      // Default accounts are 'checking' and 'savings' type
      assert.ok(res.body.labels.length >= 1, 'must have at least one asset type');
    });

    it('includes total field', async () => {
      const res = await agent().get('/api/charts/asset-allocation');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body.total === 'number');
    });
  });

  // ═══════════════════════════════════════
  // C6: FIRE Progress (extend existing)
  // ═══════════════════════════════════════

  describe('C6 — FIRE Progress', () => {
    it('reports.js has FIRE progress visualization', () => {
      const src = read('js/views/reports.js');
      assert.ok(src.includes('fire') || src.includes('FIRE'),
        'reports must reference FIRE calculator');
    });
  });

  // ═══════════════════════════════════════
  // Frontend assertions
  // ═══════════════════════════════════════

  describe('Frontend — Phase C elements', () => {
    it('insights.js references category-trends for sparklines', () => {
      const src = read('js/views/insights.js');
      assert.ok(src.includes('category-trend') || src.includes('categoryTrend') || src.includes('sparkline'),
        'insights must reference category trend sparklines');
    });

    it('charts.js has gradient or enhanced visual styling', () => {
      const src = read('js/charts.js');
      assert.ok(src.includes('gradient') || src.includes('fill: true') || src.includes('backgroundColor'),
        'charts must have enhanced styling');
    });

    it('dashboard.js references waterfall or recurring analysis', () => {
      const dashSrc = read('js/views/dashboard.js');
      const reportsSrc = read('js/views/reports.js');
      const insightsSrc = read('js/views/insights.js');
      assert.ok(dashSrc.includes('recurring') || reportsSrc.includes('recurring') || insightsSrc.includes('recurring'),
        'must reference recurring data somewhere');
    });
  });
});
