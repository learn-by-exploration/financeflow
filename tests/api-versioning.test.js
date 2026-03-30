const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

describe('API Versioning, Metrics & Health — v0.3.49', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── GET /api/version ───
  describe('GET /api/version', () => {
    it('returns version and api_version', async () => {
      const res = await rawAgent().get('/api/version').expect(200);
      assert.equal(res.body.api_version, 'v1');
      assert.equal(typeof res.body.version, 'string');
      assert.ok(res.body.version.length > 0);
    });

    it('version matches semver format', async () => {
      const res = await rawAgent().get('/api/version').expect(200);
      assert.match(res.body.version, /^\d+\.\d+\.\d+$/);
    });

    it('is accessible without authentication', async () => {
      const res = await rawAgent().get('/api/version').expect(200);
      assert.equal(res.body.api_version, 'v1');
    });

    it('is accessible via /api/v1/version', async () => {
      const res = await rawAgent().get('/api/v1/version').expect(200);
      assert.equal(res.body.api_version, 'v1');
      assert.equal(typeof res.body.version, 'string');
    });
  });

  // ─── API v1 prefix aliasing ───
  describe('API v1 prefix', () => {
    it('GET /api/v1/health returns same as /api/health', async () => {
      const res1 = await rawAgent().get('/api/health').expect(200);
      const res2 = await rawAgent().get('/api/v1/health').expect(200);
      assert.equal(res1.body.status, res2.body.status);
      assert.equal(res1.body.db, res2.body.db);
    });

    it('GET /api/v1/accounts works with auth', async () => {
      makeAccount({ name: 'V1 Test Account' });
      const res = await agent().get('/api/v1/accounts').expect(200);
      assert.ok(Array.isArray(res.body.accounts));
      assert.ok(res.body.accounts.length >= 1);
    });

    it('GET /api/v1/transactions works same as /api/transactions', async () => {
      const acct = makeAccount({ name: 'V1 Txn Account' });
      const cat = makeCategory({ name: 'V1 Cat' });
      makeTransaction(acct.id, { category_id: cat.id, description: 'V1 test txn' });

      const res1 = await agent().get('/api/transactions').expect(200);
      const res2 = await agent().get('/api/v1/transactions').expect(200);
      assert.equal(res1.body.transactions.length, res2.body.transactions.length);
    });

    it('GET /api/v1/categories works with auth', async () => {
      makeCategory({ name: 'V1 Category' });
      const res = await agent().get('/api/v1/categories').expect(200);
      assert.ok(Array.isArray(res.body.categories));
    });

    it('GET /api/v1/health/ready works', async () => {
      const res = await rawAgent().get('/api/v1/health/ready').expect(200);
      assert.equal(res.body.status, 'ready');
    });

    it('GET /api/v1/health/live works', async () => {
      const res = await rawAgent().get('/api/v1/health/live').expect(200);
      assert.equal(res.body.status, 'alive');
    });
  });

  // ─── GET /api/health ───
  describe('GET /api/health', () => {
    it('returns ok status and timestamp', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.status, 'ok');
      assert.equal(typeof res.body.timestamp, 'string');
      assert.ok(new Date(res.body.timestamp).getTime() > 0);
    });

    it('does not require authentication', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.status, 'ok');
    });
  });

  // ─── GET /api/metrics (admin only) ───
  describe('GET /api/metrics', () => {
    it('returns uptime and memory info', async () => {
      const res = await agent().get('/api/metrics').expect(200);
      assert.equal(typeof res.body.uptime, 'number');
      assert.ok(res.body.uptime >= 0);
      assert.ok(res.body.memory);
      assert.equal(typeof res.body.memory.rss, 'number');
      assert.equal(typeof res.body.memory.heapUsed, 'number');
      assert.equal(typeof res.body.memory.heapTotal, 'number');
    });

    it('returns request count info', async () => {
      const res = await agent().get('/api/metrics').expect(200);
      assert.ok(res.body.requests);
      assert.equal(typeof res.body.requests.total, 'number');
      assert.ok(res.body.requests.total >= 0);
    });

    it('returns database info', async () => {
      const res = await agent().get('/api/metrics').expect(200);
      assert.ok(res.body.database);
      assert.equal(res.body.database.status, 'connected');
      assert.equal(typeof res.body.database.fileSize, 'number');
    });

    it('returns user and transaction counts', async () => {
      const res = await agent().get('/api/metrics').expect(200);
      assert.equal(typeof res.body.totalUsers, 'number');
      assert.ok(res.body.totalUsers >= 1);
      assert.equal(typeof res.body.totalTransactions, 'number');
    });

    it('requires authentication — rejects anonymous', async () => {
      await rawAgent().get('/api/metrics').expect(401);
    });

    it('is accessible via /api/v1/metrics', async () => {
      const res = await agent().get('/api/v1/metrics').expect(200);
      assert.equal(typeof res.body.uptime, 'number');
      assert.ok(res.body.memory);
    });
  });
});
