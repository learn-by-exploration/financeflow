const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeSecondUser } = require('./helpers');

describe('Net Worth — v0.2.6', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/net-worth', () => {
    it('returns current net worth calculated from accounts', async () => {
      makeAccount({ name: 'Savings', type: 'savings', balance: 100000 });
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -20000 });

      const res = await agent().get('/api/net-worth').expect(200);
      assert.equal(res.body.net_worth, 80000);
      assert.equal(res.body.total_assets, 100000);
      assert.equal(res.body.total_liabilities, 20000);
    });

    it('returns zero for no accounts', async () => {
      const res = await agent().get('/api/net-worth').expect(200);
      assert.equal(res.body.net_worth, 0);
      assert.equal(res.body.total_assets, 0);
    });

    it('excludes accounts with include_in_net_worth=0', async () => {
      makeAccount({ name: 'Included', type: 'savings', balance: 50000 });
      makeAccount({ name: 'Excluded', type: 'savings', balance: 30000, include_in_net_worth: 0 });

      const res = await agent().get('/api/net-worth').expect(200);
      assert.equal(res.body.total_assets, 50000);
    });

    it('includes account breakdown', async () => {
      makeAccount({ name: 'HDFC', type: 'savings', balance: 80000 });
      makeAccount({ name: 'ICICI', type: 'checking', balance: 20000 });

      const res = await agent().get('/api/net-worth').expect(200);
      assert.ok(Array.isArray(res.body.accounts));
      assert.equal(res.body.accounts.length, 2);
    });
  });

  describe('GET /api/net-worth/history', () => {
    it('returns empty when no snapshots', async () => {
      const res = await agent().get('/api/net-worth/history').expect(200);
      assert.deepEqual(res.body.snapshots, []);
    });

    it('returns snapshots in chronological order', async () => {
      makeAccount({ name: 'Savings', type: 'savings', balance: 100000 });

      // Create some snapshots
      await agent().post('/api/net-worth/snapshot').expect(201);

      const res = await agent().get('/api/net-worth/history').expect(200);
      assert.ok(Array.isArray(res.body.snapshots));
      assert.ok(res.body.snapshots.length >= 1);
      const s = res.body.snapshots[0];
      assert.ok('date' in s);
      assert.ok('net_worth' in s);
      assert.ok('total_assets' in s);
    });
  });

  describe('POST /api/net-worth/snapshot', () => {
    it('creates a snapshot of current net worth', async () => {
      makeAccount({ name: 'Savings', type: 'savings', balance: 100000 });
      makeAccount({ name: 'Loan', type: 'loan', balance: -30000 });

      const res = await agent().post('/api/net-worth/snapshot').expect(201);
      assert.equal(res.body.snapshot.total_assets, 100000);
      assert.equal(res.body.snapshot.total_liabilities, 30000);
      assert.equal(res.body.snapshot.net_worth, 70000);
    });

    it('idempotent — same day snapshot replaces previous', async () => {
      makeAccount({ name: 'Savings', type: 'savings', balance: 50000 });
      await agent().post('/api/net-worth/snapshot').expect(201);
      await agent().post('/api/net-worth/snapshot').expect(201);

      const res = await agent().get('/api/net-worth/history').expect(200);
      // Only one snapshot per day
      const today = new Date().toISOString().slice(0, 10);
      const todaySnapshots = res.body.snapshots.filter(s => s.date === today);
      assert.equal(todaySnapshots.length, 1);
    });
  });

  describe('Cross-user isolation', () => {
    it('cannot see other user net worth', async () => {
      makeAccount({ name: 'Rich Account', type: 'savings', balance: 1000000 });
      await agent().post('/api/net-worth/snapshot').expect(201);

      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/net-worth').expect(200);
      assert.equal(res.body.net_worth, 0);

      const history = await agentB.get('/api/net-worth/history').expect(200);
      assert.equal(history.body.snapshots.length, 0);
    });
  });
});
