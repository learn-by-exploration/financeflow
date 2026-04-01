// tests/debt-payoff.test.js — Debt payoff simulator tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount } = require('./helpers');

describe('Debt Payoff Simulator', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);
  beforeEach(cleanDb);

  describe('GET /api/stats/debt-payoff', () => {
    it('returns empty when no debts exist', async () => {
      const res = await agent().get('/api/stats/debt-payoff');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.debts, []);
      assert.ok(res.body.message);
    });

    it('returns debt analysis with snowball and avalanche order', async () => {
      // Create loan and credit card accounts with negative balances
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -50000 });
      makeAccount({ name: 'Car Loan', type: 'loan', balance: -200000 });

      const res = await agent().get('/api/stats/debt-payoff');
      assert.equal(res.status, 200);
      assert.equal(res.body.debt_count, 2);
      assert.ok(res.body.total_debt > 0);
      assert.ok(res.body.snowball_order.length === 2);
      assert.ok(res.body.avalanche_order.length === 2);
      assert.equal(res.body.recommendation, 'avalanche');
    });

    it('snowball orders by smallest balance first', async () => {
      makeAccount({ name: 'Small Debt', type: 'credit_card', balance: -10000 });
      makeAccount({ name: 'Large Debt', type: 'loan', balance: -500000 });

      const res = await agent().get('/api/stats/debt-payoff');
      assert.equal(res.body.snowball_order[0].name, 'Small Debt');
      assert.equal(res.body.snowball_order[1].name, 'Large Debt');
    });

    it('avalanche orders by highest rate first', async () => {
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -10000 }); // 36% rate
      makeAccount({ name: 'Home Loan', type: 'loan', balance: -500000 }); // 12% rate

      const res = await agent().get('/api/stats/debt-payoff');
      // Credit card should be first in avalanche (higher rate)
      assert.equal(res.body.avalanche_order[0].name, 'Credit Card');
    });

    it('ignores positive balance accounts', async () => {
      makeAccount({ name: 'Savings', type: 'savings', balance: 100000 });
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -5000 });

      const res = await agent().get('/api/stats/debt-payoff');
      assert.equal(res.body.debt_count, 1);
    });

    it('accepts extra payment parameter', async () => {
      makeAccount({ name: 'Debt', type: 'loan', balance: -100000 });
      const res = await agent().get('/api/stats/debt-payoff?extra=5000');
      assert.equal(res.status, 200);
      assert.equal(res.body.extra_payment, 5000);
    });
  });
});
