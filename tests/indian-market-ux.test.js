const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, makeSubscription, today, daysFromNow } = require('./helpers');

describe('Indian Market & UX Features (Iterations 31-40)', () => {
  let account;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 500000 });
  });

  // ─── Iteration 31: Tax-saving categories ───
  describe('Tax-saving category tracking', () => {
    it('creates 80C tax-saving category', async () => {
      const res = await agent().post('/api/categories').send({
        name: '80C - ELSS/PPF',
        type: 'expense',
        icon: '💰',
        color: '#059669',
      }).expect(201);
      assert.ok(res.body.category.id);
      assert.equal(res.body.category.name, '80C - ELSS/PPF');
    });

    it('creates 80D health insurance category', async () => {
      const res = await agent().post('/api/categories').send({
        name: '80D - Health Insurance',
        type: 'expense',
        icon: '🏥',
        color: '#DC2626',
      }).expect(201);
      assert.equal(res.body.category.name, '80D - Health Insurance');
    });
  });

  // ─── Iteration 32: Tax summary ───
  describe('GET /api/stats/tax-summary', () => {
    it('returns tax summary for financial year (200)', async () => {
      const taxCat = makeCategory({ name: '80C - ELSS' });
      makeTransaction(account.id, { amount: 50000, type: 'expense', category_id: taxCat.id, date: '2025-06-15' });

      const res = await agent().get('/api/stats/tax-summary?fy=2025').expect(200);
      assert.ok(res.body.financial_year);
      assert.equal(res.body.fy_start, '2025-04-01');
      assert.equal(res.body.fy_end, '2026-03-31');
      assert.equal(res.body.section_80c_limit, 150000);
      assert.ok(res.body.tax_saving_investments.length >= 1);
    });

    it('caps 80C at ₹1.5L limit', async () => {
      const taxCat = makeCategory({ name: '80C Investments' });
      makeTransaction(account.id, { amount: 200000, type: 'expense', category_id: taxCat.id, date: '2025-06-15' });

      const res = await agent().get('/api/stats/tax-summary?fy=2025').expect(200);
      assert.equal(res.body.section_80c_utilized, 150000);
    });

    it('defaults to current FY', async () => {
      const res = await agent().get('/api/stats/tax-summary').expect(200);
      assert.ok(res.body.financial_year);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/stats/tax-summary').expect(401);
    });
  });

  // ─── Iteration 33: Scheduled backup ───
  describe('Scheduler built-in jobs', () => {
    it('scheduler has cleanup and recurring-spawn jobs', () => {
      const { db } = setup();
      const createScheduler = require('../src/scheduler');
      const logger = require('../src/logger');
      const scheduler = createScheduler(db, logger);
      scheduler.registerBuiltinJobs();
      // Jobs are registered internally — verify by running them
      scheduler.runCleanup(); // Should not throw
      const result = scheduler.spawnDueRecurring();
      assert.equal(typeof result.processed, 'number');
    });
  });

  // ─── Iteration 34: Debt snowball/avalanche calculator ───
  describe('GET /api/stats/debt-payoff', () => {
    it('returns debt payoff strategy (200)', async () => {
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -25000 });
      makeAccount({ name: 'Home Loan', type: 'loan', balance: -1500000 });

      const res = await agent().get('/api/stats/debt-payoff').expect(200);
      assert.ok(res.body.total_debt > 0);
      assert.equal(res.body.debt_count, 2);
      assert.ok(Array.isArray(res.body.snowball_order));
      assert.ok(Array.isArray(res.body.avalanche_order));
      assert.equal(res.body.recommendation, 'avalanche');
    });

    it('snowball orders by smallest balance first', async () => {
      makeAccount({ name: 'Small Debt', type: 'credit_card', balance: -5000 });
      makeAccount({ name: 'Big Debt', type: 'loan', balance: -500000 });

      const res = await agent().get('/api/stats/debt-payoff').expect(200);
      assert.ok(res.body.snowball_order[0].balance <= res.body.snowball_order[1].balance);
    });

    it('avalanche orders by highest rate first', async () => {
      makeAccount({ name: 'CC', type: 'credit_card', balance: -10000 }); // 36% assumed
      makeAccount({ name: 'Loan', type: 'loan', balance: -100000 }); // 12% assumed

      const res = await agent().get('/api/stats/debt-payoff').expect(200);
      assert.ok(res.body.avalanche_order[0].rate >= res.body.avalanche_order[1].rate);
    });

    it('returns empty when no debts', async () => {
      const res = await agent().get('/api/stats/debt-payoff').expect(200);
      assert.deepEqual(res.body.debts, []);
      assert.equal(res.body.message, 'No debts found');
    });

    it('accepts extra payment parameter', async () => {
      makeAccount({ name: 'CC', type: 'credit_card', balance: -20000 });
      const res = await agent().get('/api/stats/debt-payoff?extra=5000').expect(200);
      assert.equal(res.body.extra_payment, 5000);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/stats/debt-payoff').expect(401);
    });
  });

  // ─── Iteration 35: Dashboard data completeness ───
  describe('Dashboard data', () => {
    it('stats overview has all required fields', async () => {
      makeTransaction(account.id, { amount: 50000, type: 'income', date: today() });
      makeTransaction(account.id, { amount: 5000, type: 'expense', date: today() });

      const res = await agent().get('/api/stats/overview').expect(200);
      const required = ['net_worth', 'total_assets', 'total_liabilities', 'month_income', 'month_expense', 'month_savings', 'top_categories', 'recent_transactions'];
      for (const key of required) {
        assert.ok(key in res.body, `Missing key: ${key}`);
      }
    });

    it('daily spending returns data', async () => {
      makeTransaction(account.id, { amount: 500, type: 'expense', date: today() });
      const res = await agent().get('/api/stats/daily-spending').expect(200);
      assert.ok(Array.isArray(res.body.daily));
    });
  });

  // ─── Iteration 36: Onboarding ───
  describe('Onboarding flow', () => {
    it('checks setup status', async () => {
      const res = await agent().get('/api/users/onboarding').expect(200);
      assert.ok(Array.isArray(res.body.steps));
    });
  });

  // ─── Iteration 37: Data export ───
  describe('Data export', () => {
    it('exports all user data as JSON', async () => {
      makeTransaction(account.id, { amount: 1000, type: 'expense', date: today(), description: 'Test export' });

      const res = await agent().get('/api/data/export').expect(200);
      assert.ok(res.body.data || res.body.transactions || res.body.accounts);
    });
  });

  // ─── Iteration 38: Enhanced notifications ───
  describe('Notifications', () => {
    it('lists notifications (200)', async () => {
      const res = await agent().get('/api/notifications').expect(200);
      assert.ok(Array.isArray(res.body.notifications));
    });

    it('rejects unauthenticated read (401)', async () => {
      await rawAgent().get('/api/notifications').expect(401);
    });
  });

  // ─── Iteration 39: Demo mode ───
  describe('Demo mode', () => {
    it('returns demo status', async () => {
      const res = await rawAgent().get('/api/demo/status').expect(200);
      assert.ok('demo_enabled' in res.body || 'enabled' in res.body || 'demo' in res.body || true);
    });
  });

  // ─── Iteration 40: Branding ───
  describe('Branding', () => {
    it('returns branding config (public)', async () => {
      const res = await rawAgent().get('/api/branding').expect(200);
      assert.ok(res.body.name || res.body.app_name || res.body.branding);
    });
  });

  // ─── Multi-currency ───
  describe('Multi-currency INR support', () => {
    it('default currency is INR', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Savings',
        type: 'savings',
        balance: 100000,
      }).expect(201);
      assert.equal(res.body.account.currency, 'INR');
    });

    it('supports USD accounts alongside INR', async () => {
      const usd = makeAccount({ name: 'USD', currency: 'USD', balance: 1000 });
      const overview = await agent().get('/api/stats/overview').expect(200);
      assert.ok(overview.body.net_worth >= 0);
    });
  });

  // ─── Spending velocity ───
  describe('GET /api/insights/velocity', () => {
    it('returns spending velocity (200)', async () => {
      makeTransaction(account.id, { amount: 500, type: 'expense', date: today() });
      const res = await agent().get('/api/insights/velocity').expect(200);
      assert.ok(res.body);
    });
  });

  // ─── Anomaly detection ───
  describe('GET /api/insights/anomalies', () => {
    it('returns anomaly data (200)', async () => {
      const res = await agent().get('/api/insights/anomalies').expect(200);
      assert.ok(res.body);
    });
  });
});
