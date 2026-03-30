const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeTransaction, makeCategory, makeSubscription, makeSecondUser } = require('./helpers');

describe('Search & Insights UI — v0.3.32', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Search API tests ───

  describe('GET /api/search', () => {
    it('returns matching transactions by description', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Grocery shopping at BigBasket' });
      makeTransaction(acct.id, { description: 'Movie tickets' });

      const res = await agent().get('/api/search?q=grocery').expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.ok(res.body.transactions[0].description.includes('Grocery'));
    });

    it('returns matching accounts by name', async () => {
      makeAccount({ name: 'HDFC Savings Account' });
      makeAccount({ name: 'ICICI Current' });

      const res = await agent().get('/api/search?q=HDFC').expect(200);
      assert.equal(res.body.accounts.length, 1);
      assert.equal(res.body.accounts[0].name, 'HDFC Savings Account');
    });

    it('returns matching categories', async () => {
      makeCategory({ name: 'Entertainment', type: 'expense' });
      makeCategory({ name: 'Food & Drink', type: 'expense' });

      const res = await agent().get('/api/search?q=entertain').expect(200);
      assert.equal(res.body.categories.length, 1);
      assert.equal(res.body.categories[0].name, 'Entertainment');
    });

    it('returns empty arrays when no results match', async () => {
      makeAccount({ name: 'Checking' });

      const res = await agent().get('/api/search?q=zzzznonexistent').expect(200);
      assert.equal(res.body.transactions.length, 0);
      assert.equal(res.body.accounts.length, 0);
      assert.equal(res.body.categories.length, 0);
      assert.equal(res.body.subscriptions.length, 0);
      assert.equal(res.body.tags.length, 0);
    });

    it('requires minimum 1 character query', async () => {
      await agent().get('/api/search?q=').expect(400);
    });

    it('rejects missing query parameter', async () => {
      await agent().get('/api/search').expect(400);
    });

    it('returns multiple result types for broad query', async () => {
      const acct = makeAccount({ name: 'Test Bank' });
      makeTransaction(acct.id, { description: 'Test payment' });
      makeCategory({ name: 'Test Category', type: 'expense' });

      const res = await agent().get('/api/search?q=test').expect(200);
      assert.ok(res.body.transactions.length >= 1);
      assert.ok(res.body.accounts.length >= 1);
      assert.ok(res.body.categories.length >= 1);
    });

    it('requires authentication', async () => {
      await rawAgent().get('/api/search?q=test').expect(401);
    });
  });

  // ─── Insights API tests ───

  describe('GET /api/insights/trends', () => {
    it('returns structured trend data', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2026-01-15', category_id: cat.id });
      makeTransaction(acct.id, { type: 'expense', amount: 800, date: '2026-02-15', category_id: cat.id });

      const res = await agent().get('/api/insights/trends?months=6').expect(200);
      assert.ok(Array.isArray(res.body.months));
      assert.ok(['increasing', 'decreasing', 'stable'].includes(res.body.direction));
    });

    it('returns defaults with no data', async () => {
      const res = await agent().get('/api/insights/trends?months=6').expect(200);
      assert.deepEqual(res.body.months, []);
      assert.equal(res.body.direction, 'stable');
    });

    it('requires authentication', async () => {
      await rawAgent().get('/api/insights/trends?months=6').expect(401);
    });
  });

  describe('GET /api/insights/velocity', () => {
    it('returns spending velocity data', async () => {
      const res = await agent().get('/api/insights/velocity').expect(200);
      assert.ok('daily_rate' in res.body);
      assert.ok('current_total' in res.body);
      assert.ok('status' in res.body);
    });

    it('requires authentication', async () => {
      await rawAgent().get('/api/insights/velocity').expect(401);
    });
  });

  describe('GET /api/insights/anomalies', () => {
    it('returns anomalies array', async () => {
      const res = await agent().get('/api/insights/anomalies?months=3').expect(200);
      assert.ok(Array.isArray(res.body.anomalies));
    });

    it('requires authentication', async () => {
      await rawAgent().get('/api/insights/anomalies?months=3').expect(401);
    });
  });

  describe('GET /api/insights/categories', () => {
    it('returns category changes data', async () => {
      const res = await agent().get('/api/insights/categories').expect(200);
      assert.ok('changes' in res.body);
    });
  });
});
