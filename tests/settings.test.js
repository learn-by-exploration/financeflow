const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeSecondUser } = require('./helpers');

describe('Settings', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/settings', () => {
    it('returns defaults when no settings stored (200)', async () => {
      const res = await agent().get('/api/settings').expect(200);
      assert.equal(res.body.settings.default_currency, 'INR');
      assert.equal(res.body.settings.date_format, 'YYYY-MM-DD');
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/settings').expect(401);
    });
  });

  describe('PUT /api/settings', () => {
    it('upserts key-value pair (200)', async () => {
      await agent().put('/api/settings')
        .send({ key: 'default_currency', value: 'USD' })
        .expect(200);
      const res = await agent().get('/api/settings').expect(200);
      assert.equal(res.body.settings.default_currency, 'USD');
    });

    it('upserts date_format', async () => {
      await agent().put('/api/settings')
        .send({ key: 'date_format', value: 'DD/MM/YYYY' })
        .expect(200);
      const res = await agent().get('/api/settings').expect(200);
      assert.equal(res.body.settings.date_format, 'DD/MM/YYYY');
    });

    it('rejects unknown keys (400)', async () => {
      await agent().put('/api/settings')
        .send({ key: 'evil_key', value: 'hacked' })
        .expect(400);
    });

    it('rejects empty key (400)', async () => {
      await agent().put('/api/settings')
        .send({ value: 'no key' })
        .expect(400);
    });
  });

  describe('Per-user isolation', () => {
    it('user A settings do not affect user B', async () => {
      // User A sets currency to USD
      await agent().put('/api/settings')
        .send({ key: 'default_currency', value: 'USD' })
        .expect(200);

      // User B should still have defaults
      const user2 = makeSecondUser();
      const res = await user2.agent.get('/api/settings').expect(200);
      assert.equal(res.body.settings.default_currency, 'INR');
    });
  });
});
