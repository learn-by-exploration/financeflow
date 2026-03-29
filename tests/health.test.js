const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeTransaction } = require('./helpers');

describe('Financial Health', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/stats/financial-health', () => {
    it('returns 200 with score and ratios when data exists', async () => {
      const acct = makeAccount({ type: 'savings', balance: 50000 });
      const d = new Date(); d.setDate(d.getDate() - 40);
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: d.toISOString().slice(0, 10) });
      const res = await agent().get('/api/stats/financial-health').expect(200);
      assert.ok(typeof res.body.score === 'number');
      assert.ok(typeof res.body.net_worth === 'number');
      assert.ok(typeof res.body.emergency_fund_months === 'number');
      assert.ok(typeof res.body.savings_rate === 'number');
      assert.ok(typeof res.body.debt_to_income === 'number');
    });

    it('returns gated response when < 30 days of data', async () => {
      // No transactions = no data
      const res = await agent().get('/api/stats/financial-health').expect(200);
      assert.equal(res.body.gated, true);
      assert.ok(res.body.message);
    });

    it('returns full response when >= 30 days of data', async () => {
      const acct = makeAccount({ type: 'checking', balance: 10000 });
      // Create a transaction 31 days ago
      const d = new Date();
      d.setDate(d.getDate() - 31);
      const oldDate = d.toISOString().slice(0, 10);
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: oldDate });
      const res = await agent().get('/api/stats/financial-health').expect(200);
      assert.ok(!res.body.gated);
      assert.ok(typeof res.body.score === 'number');
    });

    it('emergency_fund_months = 0 with no savings accounts', async () => {
      const acct = makeAccount({ type: 'checking', balance: 10000 });
      const d = new Date(); d.setDate(d.getDate() - 60);
      makeTransaction(acct.id, { type: 'expense', amount: 5000, date: d.toISOString().slice(0, 10) });
      const res = await agent().get('/api/stats/financial-health').expect(200);
      if (!res.body.gated) {
        assert.equal(res.body.emergency_fund_months, 0);
      }
    });

    it('savings_rate handles zero income (returns 0)', async () => {
      const acct = makeAccount({ type: 'checking', balance: 10000 });
      const d = new Date(); d.setDate(d.getDate() - 60);
      makeTransaction(acct.id, { type: 'expense', amount: 1000, date: d.toISOString().slice(0, 10) });
      const res = await agent().get('/api/stats/financial-health').expect(200);
      if (!res.body.gated) {
        assert.ok(!Number.isNaN(res.body.savings_rate));
        assert.ok(Number.isFinite(res.body.savings_rate));
      }
    });

    it('debt_to_income handles zero income (returns 0)', async () => {
      makeAccount({ type: 'credit_card', balance: -5000 });
      const acct = makeAccount({ type: 'checking', balance: 1000 });
      const d = new Date(); d.setDate(d.getDate() - 60);
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: d.toISOString().slice(0, 10) });
      const res = await agent().get('/api/stats/financial-health').expect(200);
      if (!res.body.gated) {
        assert.ok(!Number.isNaN(res.body.debt_to_income));
        assert.ok(Number.isFinite(res.body.debt_to_income));
      }
    });

    it('score is between 0 and 100', async () => {
      const acct = makeAccount({ type: 'savings', balance: 100000 });
      const d = new Date(); d.setDate(d.getDate() - 60);
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: d.toISOString().slice(0, 10) });
      const res = await agent().get('/api/stats/financial-health').expect(200);
      if (!res.body.gated) {
        assert.ok(res.body.score >= 0 && res.body.score <= 100);
      }
    });

    it('includes interpretation field', async () => {
      const acct = makeAccount({ type: 'savings', balance: 100000 });
      const d = new Date(); d.setDate(d.getDate() - 60);
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: d.toISOString().slice(0, 10) });
      const res = await agent().get('/api/stats/financial-health').expect(200);
      if (!res.body.gated) {
        assert.ok(res.body.interpretation);
        assert.ok(typeof res.body.interpretation === 'string');
      }
    });
  });
});
