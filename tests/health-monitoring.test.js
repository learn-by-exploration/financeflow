const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount } = require('./helpers');

describe('Health Check Enhancements & Monitoring — v0.3.24', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── GET /api/health ───
  describe('GET /api/health', () => {
    it('returns status, uptime, version, database status', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.status, 'ok');
      assert.equal(typeof res.body.version, 'string');
      assert.ok(res.body.version.length > 0);
      assert.equal(typeof res.body.uptime, 'number');
      assert.ok(res.body.uptime >= 0);
      assert.equal(res.body.db, 'ok');
    });

    it('does not expose internal metrics publicly', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.memory, undefined);
      assert.equal(res.body.activeSessions, undefined);
      assert.equal(res.body.diskSpace, undefined);
    });

    it('does not require authentication', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.status, 'ok');
    });
  });

  // ─── GET /api/health/ready ───
  describe('GET /api/health/ready', () => {
    it('returns 200 when database is accessible', async () => {
      const res = await rawAgent().get('/api/health/ready').expect(200);
      assert.equal(res.body.status, 'ready');
    });

    it('does not require authentication', async () => {
      const res = await rawAgent().get('/api/health/ready').expect(200);
      assert.equal(res.body.status, 'ready');
    });
  });

  // ─── GET /api/health/live ───
  describe('GET /api/health/live', () => {
    it('returns 200 always', async () => {
      const res = await rawAgent().get('/api/health/live').expect(200);
      assert.equal(res.body.status, 'alive');
    });

    it('does not require authentication', async () => {
      const res = await rawAgent().get('/api/health/live').expect(200);
      assert.equal(res.body.status, 'alive');
    });
  });

  // ─── GET /api/health/metrics ───
  describe('GET /api/health/metrics', () => {
    it('returns request count and average response time', async () => {
      const res = await rawAgent().get('/api/health/metrics').expect(200);
      assert.equal(typeof res.body.requestCount, 'number');
      assert.ok(res.body.requestCount >= 0);
      assert.equal(typeof res.body.averageResponseTimeMs, 'number');
    });

    it('returns user, transaction, and account counts', async () => {
      // Create some data so counts > 0
      makeAccount({ name: 'Metrics Acc' });
      const res = await rawAgent().get('/api/health/metrics').expect(200);
      assert.equal(typeof res.body.totalUsers, 'number');
      assert.ok(res.body.totalUsers >= 1);
      assert.equal(typeof res.body.totalTransactions, 'number');
      assert.equal(typeof res.body.totalAccounts, 'number');
      assert.ok(res.body.totalAccounts >= 1);
    });

    it('returns database file size', async () => {
      const res = await rawAgent().get('/api/health/metrics').expect(200);
      assert.equal(typeof res.body.dbFileSize, 'number');
    });

    it('does not require authentication', async () => {
      const res = await rawAgent().get('/api/health/metrics').expect(200);
      assert.equal(typeof res.body.requestCount, 'number');
    });
  });
});
