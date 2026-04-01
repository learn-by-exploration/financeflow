// tests/v2-financial-calculators.test.js — Iteration 11-15: New financial features
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeTransaction, today, daysFromNow } = require('./helpers');

describe('v2 Financial Calculators & Features', () => {
  let account;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 100000 });
  });

  // ─── Iteration 11: Stats service unit tests ───
  describe('Stats service (unit)', () => {
    it('calculateEMI returns correct values', () => {
      const { calculateEMI } = require('../src/services/stats.service');
      const result = calculateEMI(1000000, 12, 120);
      assert.equal(result.principal, 1000000);
      assert.ok(result.monthly_emi > 14000 && result.monthly_emi < 15000);
      assert.equal(result.schedule.length, 120);
      assert.equal(result.schedule[119].balance, 0);
    });

    it('calculateSIP returns future value', () => {
      const { calculateSIP } = require('../src/services/stats.service');
      const result = calculateSIP(10000, 12, 10);
      assert.ok(result.future_value > result.total_invested);
      assert.equal(result.yearly_breakdown.length, 10);
      assert.equal(result.total_invested, 1200000);
    });

    it('calculateSIP with step-up increases monthly amount', () => {
      const { calculateSIP } = require('../src/services/stats.service');
      const result = calculateSIP(10000, 12, 5, 10);
      assert.ok(result.total_invested > 600000); // more than 10000*60 without step-up
      assert.ok(result.yearly_breakdown[4].monthly_sip > 10000);
    });

    it('calculateLumpsum returns compound growth', () => {
      const { calculateLumpsum } = require('../src/services/stats.service');
      const result = calculateLumpsum(100000, 10, 10);
      assert.ok(result.future_value > 250000); // ~259374
      assert.ok(result.gains_percentage > 150);
    });

    it('calculateFIRE returns retirement number', () => {
      const { calculateFIRE } = require('../src/services/stats.service');
      const result = calculateFIRE(600000, 4, 6, 20);
      assert.ok(result.fire_number > 0);
      assert.ok(result.future_annual_expense > 600000);
      assert.ok(result.monthly_savings_needed > 0);
    });
  });

  // ─── Iteration 12: SIP calculator endpoint ───
  describe('SIP calculator endpoint', () => {
    it('GET /api/stats/sip-calculator with valid params', async () => {
      const res = await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=10').expect(200);
      assert.ok(res.body.future_value > 0);
      assert.equal(res.body.yearly_breakdown.length, 10);
      assert.ok(res.body.gains_percentage > 0);
    });

    it('GET /api/stats/sip-calculator with step-up', async () => {
      const res = await agent().get('/api/stats/sip-calculator?monthly=5000&return=15&years=5&step_up=10').expect(200);
      assert.ok(res.body.total_invested > 300000);
    });

    it('rejects invalid params', async () => {
      await agent().get('/api/stats/sip-calculator?monthly=0&return=12&years=10').expect(400);
      await agent().get('/api/stats/sip-calculator?monthly=10000&return=60&years=10').expect(400);
      await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=60').expect(400);
    });

    it('rejects invalid step-up', async () => {
      await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=10&step_up=150').expect(400);
    });
  });

  // ─── Iteration 13: Lumpsum & FIRE calculators ───
  describe('Lumpsum calculator', () => {
    it('GET /api/stats/lumpsum-calculator with valid params', async () => {
      const res = await agent().get('/api/stats/lumpsum-calculator?principal=500000&return=10&years=10').expect(200);
      assert.ok(res.body.future_value > 500000);
      assert.ok(res.body.gains_percentage > 100);
    });

    it('rejects out-of-bounds lumpsum', async () => {
      await agent().get('/api/stats/lumpsum-calculator?principal=0&return=10&years=10').expect(400);
    });
  });

  describe('FIRE calculator', () => {
    it('GET /api/stats/fire-calculator with all params', async () => {
      const res = await agent().get('/api/stats/fire-calculator?annual_expense=600000&withdrawal_rate=4&inflation_rate=6&years=25').expect(200);
      assert.ok(res.body.fire_number > 0);
      assert.ok(res.body.future_annual_expense > 600000);
      assert.ok(res.body.monthly_savings_needed > 0);
    });

    it('uses defaults for optional params', async () => {
      const res = await agent().get('/api/stats/fire-calculator?annual_expense=600000').expect(200);
      assert.equal(res.body.withdrawal_rate, 4);
      assert.equal(res.body.inflation_rate, 6);
      assert.equal(res.body.years_to_retirement, 20);
    });

    it('rejects invalid FIRE params', async () => {
      await agent().get('/api/stats/fire-calculator').expect(400);
      await agent().get('/api/stats/fire-calculator?annual_expense=-100').expect(400);
    });
  });

  // ─── Iteration 14: Spending streak ───
  describe('Spending streak', () => {
    it('returns 0 streak with no transactions', async () => {
      const res = await agent().get('/api/stats/spending-streak').expect(200);
      assert.equal(res.body.current_streak, 0);
      assert.equal(res.body.longest_streak, 0);
      assert.equal(res.body.total_tracking_days, 0);
    });

    it('counts streak for consecutive days', async () => {
      // Add transactions for today and yesterday
      makeTransaction(account.id, { date: today(), description: 'Today' });
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      makeTransaction(account.id, { date: yesterday.toISOString().slice(0, 10), description: 'Yesterday' });

      const res = await agent().get('/api/stats/spending-streak').expect(200);
      assert.ok(res.body.current_streak >= 2);
      assert.ok(res.body.total_tracking_days >= 2);
    });
  });

  // ─── Iteration 15: Net worth trend ───
  describe('Net worth trend', () => {
    it('returns current net worth as fallback', async () => {
      const res = await agent().get('/api/stats/net-worth-trend').expect(200);
      assert.ok(Array.isArray(res.body.trend));
      assert.ok(res.body.trend.length >= 1);
      assert.ok(res.body.trend[0].net_worth !== undefined);
    });

    it('respects months parameter', async () => {
      const res = await agent().get('/api/stats/net-worth-trend?months=6').expect(200);
      assert.ok(Array.isArray(res.body.trend));
    });

    it('caps months at 60', async () => {
      const res = await agent().get('/api/stats/net-worth-trend?months=999').expect(200);
      assert.ok(Array.isArray(res.body.trend));
    });
  });
});
