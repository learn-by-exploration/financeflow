const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent } = require('./helpers');

describe('Dashboard Revamp & Polish — v0.3.0', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('Health check', () => {
    it('GET /api/health returns status, version, uptime', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.status, 'ok');
      assert.equal(typeof res.body.version, 'string');
      assert.equal(typeof res.body.uptime, 'number');
      assert.ok(res.body.uptime >= 0);
    });

    it('health check includes db status', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.db, 'ok');
    });

    it('health check is public (no auth needed)', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.equal(res.body.status, 'ok');
    });
  });

  describe('Request ID', () => {
    it('response includes X-Request-Id header', async () => {
      const res = await agent().get('/api/accounts').expect(200);
      assert.ok(res.headers['x-request-id']);
      assert.ok(res.headers['x-request-id'].length > 0);
    });

    it('each request gets a unique ID', async () => {
      const res1 = await agent().get('/api/accounts').expect(200);
      const res2 = await agent().get('/api/accounts').expect(200);
      assert.notEqual(res1.headers['x-request-id'], res2.headers['x-request-id']);
    });
  });

  describe('Dashboard settings', () => {
    it('saves dashboard card layout', async () => {
      const layout = ['net_worth', 'spending_trend', 'budget_progress'];
      await agent().put('/api/settings').send({
        key: 'dashboard_layout',
        value: JSON.stringify(layout),
      }).expect(200);

      const res = await agent().get('/api/settings').expect(200);
      assert.ok(res.body.settings.dashboard_layout);
      assert.deepEqual(JSON.parse(res.body.settings.dashboard_layout), layout);
    });

    it('returns default layout when none configured', async () => {
      const res = await agent().get('/api/settings/dashboard').expect(200);
      assert.ok(Array.isArray(res.body.layout));
      assert.ok(res.body.layout.length > 0);
    });

    it('returns custom layout when configured', async () => {
      const layout = ['savings_goals', 'subscriptions'];
      await agent().put('/api/settings').send({
        key: 'dashboard_layout',
        value: JSON.stringify(layout),
      }).expect(200);

      const res = await agent().get('/api/settings/dashboard').expect(200);
      assert.deepEqual(res.body.layout, layout);
    });
  });
});
