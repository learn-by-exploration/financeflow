const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeTransaction, makeCategory, makeSubscription, makeSecondUser } = require('./helpers');

describe('Search — v0.2.4', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/search', () => {
    it('returns empty results for no match', async () => {
      const res = await agent().get('/api/search?q=nonexistent').expect(200);
      assert.equal(res.body.transactions.length, 0);
      assert.equal(res.body.accounts.length, 0);
    });

    it('searches transactions by description', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Coffee at Starbucks' });
      makeTransaction(acct.id, { description: 'Groceries' });

      const res = await agent().get('/api/search?q=coffee').expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'Coffee at Starbucks');
    });

    it('searches accounts by name', async () => {
      makeAccount({ name: 'HDFC Savings' });
      makeAccount({ name: 'ICICI Checking' });

      const res = await agent().get('/api/search?q=hdfc').expect(200);
      assert.equal(res.body.accounts.length, 1);
      assert.equal(res.body.accounts[0].name, 'HDFC Savings');
    });

    it('searches categories by name', async () => {
      makeCategory({ name: 'Side Hustle Income', type: 'income' });

      const res = await agent().get('/api/search?q=hustle').expect(200);
      assert.equal(res.body.categories.length, 1);
    });

    it('searches subscriptions by name', async () => {
      makeSubscription({ name: 'Netflix Premium' });

      const res = await agent().get('/api/search?q=netflix').expect(200);
      assert.equal(res.body.subscriptions.length, 1);
    });

    it('search is case-insensitive', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'UBER ride' });

      const res = await agent().get('/api/search?q=uber').expect(200);
      assert.equal(res.body.transactions.length, 1);
    });

    it('returns empty for empty query (400)', async () => {
      await agent().get('/api/search').expect(400);
      await agent().get('/api/search?q=').expect(400);
    });

    it('handles special chars safely (no SQL injection)', async () => {
      const res = await agent().get("/api/search?q=%27%20OR%201%3D1%20--").expect(200);
      assert.ok(Array.isArray(res.body.transactions));
    });

    it('cross-user isolation — cannot search other user data', async () => {
      const acct = makeAccount({ name: 'Secret Account' });
      makeTransaction(acct.id, { description: 'Secret Purchase' });

      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/search?q=secret').expect(200);
      assert.equal(res.body.transactions.length, 0);
      assert.equal(res.body.accounts.length, 0);
    });

    it('limits results per category', async () => {
      const acct = makeAccount({ name: 'Checking' });
      for (let i = 0; i < 15; i++) {
        makeTransaction(acct.id, { description: `Uber ride ${i}` });
      }
      const res = await agent().get('/api/search?q=uber').expect(200);
      assert.ok(res.body.transactions.length <= 10, 'should limit to 10 results');
    });
  });
});
