const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeSubscription } = require('./helpers');

describe('Subscriptions', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/subscriptions', () => {
    it('returns empty list initially (200)', async () => {
      const res = await agent().get('/api/subscriptions').expect(200);
      assert.deepEqual(res.body.subscriptions, []);
      assert.equal(res.body.total_monthly, 0);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/subscriptions').expect(401);
    });

    it('returns subscriptions with total_monthly', async () => {
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      makeSubscription({ name: 'Gym', amount: 1200, frequency: 'quarterly' });
      const res = await agent().get('/api/subscriptions').expect(200);
      assert.equal(res.body.subscriptions.length, 2);
      assert.ok(res.body.total_monthly > 0);
    });

    it('normalizes monthly: weekly ₹100 → ₹433', async () => {
      makeSubscription({ name: 'Weekly Sub', amount: 100, frequency: 'weekly' });
      const res = await agent().get('/api/subscriptions').expect(200);
      // 100 * 4.33 = 433
      assert.ok(res.body.total_monthly >= 433 && res.body.total_monthly <= 434);
    });

    it('normalizes monthly: quarterly ₹300 → ₹100', async () => {
      makeSubscription({ name: 'Quarterly', amount: 300, frequency: 'quarterly' });
      const res = await agent().get('/api/subscriptions').expect(200);
      assert.equal(res.body.total_monthly, 100);
    });

    it('normalizes monthly: yearly ₹1200 → ₹100', async () => {
      makeSubscription({ name: 'Yearly', amount: 1200, frequency: 'yearly' });
      const res = await agent().get('/api/subscriptions').expect(200);
      assert.equal(res.body.total_monthly, 100);
    });

    it('excludes inactive from total_monthly', async () => {
      makeSubscription({ name: 'Active', amount: 100, frequency: 'monthly', is_active: 1 });
      makeSubscription({ name: 'Inactive', amount: 500, frequency: 'monthly', is_active: 0 });
      const res = await agent().get('/api/subscriptions').expect(200);
      assert.equal(res.body.subscriptions.length, 2);
      assert.equal(res.body.total_monthly, 100);
    });
  });

  describe('POST /api/subscriptions', () => {
    it('creates subscription (201)', async () => {
      const res = await agent().post('/api/subscriptions')
        .send({ name: 'Spotify', amount: 119, frequency: 'monthly' })
        .expect(201);
      assert.equal(res.body.subscription.name, 'Spotify');
      assert.equal(res.body.subscription.amount, 119);
      assert.equal(res.body.subscription.frequency, 'monthly');
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/subscriptions')
        .send({ amount: 100, frequency: 'monthly' })
        .expect(400);
    });

    it('rejects missing amount (400)', async () => {
      await agent().post('/api/subscriptions')
        .send({ name: 'Bad', frequency: 'monthly' })
        .expect(400);
    });

    it('rejects missing frequency (400)', async () => {
      await agent().post('/api/subscriptions')
        .send({ name: 'Bad', amount: 100 })
        .expect(400);
    });

    it('rejects invalid frequency (400)', async () => {
      await agent().post('/api/subscriptions')
        .send({ name: 'Bad', amount: 100, frequency: 'biweekly' })
        .expect(400);
    });
  });

  describe('PUT /api/subscriptions/:id', () => {
    it('updates fields', async () => {
      const sub = makeSubscription({ name: 'Old' });
      const res = await agent().put(`/api/subscriptions/${sub.id}`)
        .send({ name: 'New', amount: 299 })
        .expect(200);
      assert.equal(res.body.subscription.name, 'New');
      assert.equal(res.body.subscription.amount, 299);
    });

    it('toggles is_active', async () => {
      const sub = makeSubscription({ is_active: 1 });
      const res = await agent().put(`/api/subscriptions/${sub.id}`)
        .send({ is_active: 0 })
        .expect(200);
      assert.equal(res.body.subscription.is_active, 0);
    });

    it('returns 404 for non-existent', async () => {
      await agent().put('/api/subscriptions/99999')
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  describe('DELETE /api/subscriptions/:id', () => {
    it('deletes subscription (200)', async () => {
      const sub = makeSubscription();
      await agent().delete(`/api/subscriptions/${sub.id}`).expect(200);
      const { db } = setup();
      const row = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(sub.id);
      assert.equal(row, undefined);
    });

    it('returns 404 for non-existent', async () => {
      await agent().delete('/api/subscriptions/99999').expect(404);
    });
  });
});
