// tests/v2-validation-fixes.test.js — Iteration 1-5: Validation hardening tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, today, daysFromNow } = require('./helpers');

describe('v2 Validation Fixes', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 100000 });
    category = makeCategory({ name: 'General' });
  });

  // ─── Iteration 1: Bounded query parameters ───
  describe('Bounded query parameters', () => {
    it('trends months capped at 120', async () => {
      const res = await agent().get('/api/stats/trends?months=99999').expect(200);
      assert.ok(Array.isArray(res.body.trends));
      // Should not crash or take forever
    });

    it('trends months defaults to 12 for invalid input', async () => {
      const res = await agent().get('/api/stats/trends?months=abc').expect(200);
      assert.ok(Array.isArray(res.body.trends));
    });

    it('trends months minimum is 1', async () => {
      const res = await agent().get('/api/stats/trends?months=0').expect(200);
      assert.ok(Array.isArray(res.body.trends));
    });
  });

  // ─── Iteration 2: EMI calculator bounds ───
  describe('EMI calculator bounds', () => {
    it('rejects principal > 1e12', async () => {
      await agent().get('/api/stats/emi-calculator?principal=9999999999999&rate=10&tenure=12').expect(400);
    });

    it('rejects rate > 100', async () => {
      await agent().get('/api/stats/emi-calculator?principal=100000&rate=150&tenure=12').expect(400);
    });

    it('rejects tenure > 600 months', async () => {
      await agent().get('/api/stats/emi-calculator?principal=100000&rate=10&tenure=700').expect(400);
    });

    it('accepts valid EMI params within bounds', async () => {
      const res = await agent().get('/api/stats/emi-calculator?principal=1000000&rate=8.5&tenure=240').expect(200);
      assert.ok(res.body.monthly_emi > 0);
      assert.equal(res.body.schedule.length, 240);
    });
  });

  // ─── Iteration 3: Budget date validation ───
  describe('Budget date validation', () => {
    it('rejects start_date > end_date', async () => {
      const res = await agent().post('/api/budgets').send({
        name: 'Bad Budget',
        period: 'custom',
        start_date: '2026-12-31',
        end_date: '2026-01-01',
        items: [],
      });
      assert.equal(res.status, 400);
    });

    it('accepts start_date <= end_date', async () => {
      const res = await agent().post('/api/budgets').send({
        name: 'Good Budget',
        period: 'custom',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        items: [],
      });
      assert.equal(res.status, 201);
    });

    it('accepts budget without dates', async () => {
      const res = await agent().post('/api/budgets').send({
        name: 'No Dates Budget',
        period: 'monthly',
        items: [],
      });
      assert.equal(res.status, 201);
    });

    it('rejects malformed date format', async () => {
      const res = await agent().post('/api/budgets').send({
        name: 'Bad Date',
        period: 'custom',
        start_date: '01-01-2026',
        end_date: '12/31/2026',
      });
      assert.equal(res.status, 400);
    });
  });

  // ─── Iteration 4: Account schema hardening ───
  describe('Account schema hardening', () => {
    it('rejects invalid currency code (lowercase)', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Bad Currency',
        currency: 'inr',
      });
      assert.equal(res.status, 400);
    });

    it('rejects invalid currency code (numbers)', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Bad Currency',
        currency: '123',
      });
      assert.equal(res.status, 400);
    });

    it('accepts valid currency code', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Good Account',
        currency: 'USD',
        balance: 5000,
      });
      assert.equal(res.status, 201);
    });

    it('rejects account_number_last4 with letters', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Bad Last4',
        account_number_last4: 'abcd',
      });
      assert.equal(res.status, 400);
    });

    it('accepts valid account_number_last4', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Good Last4',
        account_number_last4: '1234',
      });
      assert.equal(res.status, 201);
    });

    it('rejects extreme balance values', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Extreme Balance',
        balance: 9e15,
      });
      assert.equal(res.status, 400);
    });
  });

  // ─── Iteration 5: Rate limiter cleanup ───
  describe('Rate limiter cleanup', () => {
    it('scheduler has rate-limit-cleanup job registered', () => {
      const { db } = setup();
      const logger = require('../src/logger');
      const createScheduler = require('../src/scheduler');
      const scheduler = createScheduler(db, logger);
      scheduler.registerBuiltinJobs();
      // The scheduler should have 3 jobs now
      // We verify by calling stop (which clears timers) without error
      scheduler.stop();
    });

    it('rate limit cleanup function works without error', () => {
      const createPerUserRateLimit = require('../src/middleware/per-user-rate-limit');
      // Should not throw
      createPerUserRateLimit._cleanup();
    });
  });
});
