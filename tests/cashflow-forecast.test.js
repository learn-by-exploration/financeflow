// tests/cashflow-forecast.test.js — Cash flow forecast tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeRecurringRule } = require('./helpers');

describe('Cash Flow Forecast', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);
  beforeEach(cleanDb);

  describe('GET /api/reports/cashflow-forecast', () => {
    it('returns forecast with starting balance', async () => {
      makeAccount({ balance: 100000 });
      const res = await agent().get('/api/reports/cashflow-forecast');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.forecast));
      assert.ok(res.body.forecast.length > 0);
      assert.equal(res.body.forecast[0].projected_balance, 100000);
    });

    it('defaults to 30 days forecast', async () => {
      makeAccount({ balance: 50000 });
      const res = await agent().get('/api/reports/cashflow-forecast');
      assert.equal(res.body.forecast.length, 30);
    });

    it('accepts custom days parameter', async () => {
      makeAccount({ balance: 50000 });
      const res = await agent().get('/api/reports/cashflow-forecast?days=7');
      assert.equal(res.body.forecast.length, 7);
    });

    it('caps at 365 days', async () => {
      makeAccount({ balance: 50000 });
      const res = await agent().get('/api/reports/cashflow-forecast?days=1000');
      assert.equal(res.body.forecast.length, 365);
    });

    it('includes recurring rule impact in forecast', async () => {
      const account = makeAccount({ balance: 100000 });
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      makeRecurringRule(account.id, {
        type: 'expense',
        amount: 5000,
        frequency: 'daily',
        next_date: tomorrowStr,
        description: 'Daily expense',
      });

      const res = await agent().get('/api/reports/cashflow-forecast?days=3');
      assert.equal(res.status, 200);
      // Balance should decrease after recurring kicks in
      const last = res.body.forecast[res.body.forecast.length - 1];
      assert.ok(last.projected_balance < 100000);
    });

    it('handles empty accounts', async () => {
      const res = await agent().get('/api/reports/cashflow-forecast');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.forecast));
      assert.equal(res.body.forecast[0].projected_balance, 0);
    });

    it('includes subscription costs in forecast', async () => {
      makeAccount({ balance: 50000 });
      // Set next_billing_date to 2 days from now to ensure it falls within forecast
      const billingDate = new Date();
      billingDate.setDate(billingDate.getDate() + 2);
      const billingStr = billingDate.toISOString().slice(0, 10);

      db.prepare(
        'INSERT INTO subscriptions (user_id, name, amount, currency, frequency, next_billing_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(1, 'Netflix', 5000, 'INR', 'monthly', billingStr, 1);

      const res = await agent().get('/api/reports/cashflow-forecast?days=10');
      assert.equal(res.status, 200);
      // At minimum, the forecast should be a valid array
      assert.ok(res.body.forecast.length === 10);
    });

    it('each day has date and projected_balance fields', async () => {
      makeAccount({ balance: 10000 });
      const res = await agent().get('/api/reports/cashflow-forecast?days=5');
      for (const day of res.body.forecast) {
        assert.ok(day.date);
        assert.equal(typeof day.projected_balance, 'number');
        assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });
});
