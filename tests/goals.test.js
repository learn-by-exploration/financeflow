const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeGoal } = require('./helpers');

describe('Goals', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/goals', () => {
    it('returns empty list initially (200)', async () => {
      const res = await agent().get('/api/goals').expect(200);
      assert.deepEqual(res.body.goals, []);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/goals').expect(401);
    });

    it('returns goals ordered by position', async () => {
      makeGoal({ name: 'Second', position: 1 });
      makeGoal({ name: 'First', position: 0 });
      const res = await agent().get('/api/goals').expect(200);
      assert.equal(res.body.goals[0].name, 'First');
      assert.equal(res.body.goals[1].name, 'Second');
    });
  });

  describe('POST /api/goals', () => {
    it('creates goal with target_amount (201)', async () => {
      const res = await agent().post('/api/goals')
        .send({ name: 'Emergency Fund', target_amount: 100000 })
        .expect(201);
      assert.equal(res.body.goal.name, 'Emergency Fund');
      assert.equal(res.body.goal.target_amount, 100000);
      assert.equal(res.body.goal.current_amount, 0);
      assert.equal(res.body.goal.is_completed, 0);
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/goals')
        .send({ target_amount: 50000 })
        .expect(400);
    });

    it('rejects missing target_amount (400)', async () => {
      await agent().post('/api/goals')
        .send({ name: 'No Target' })
        .expect(400);
    });

    it('rejects zero target_amount (400)', async () => {
      await agent().post('/api/goals')
        .send({ name: 'Zero', target_amount: 0 })
        .expect(400);
    });

    it('rejects negative target_amount (400)', async () => {
      await agent().post('/api/goals')
        .send({ name: 'Negative', target_amount: -1000 })
        .expect(400);
    });
  });

  describe('PUT /api/goals/:id', () => {
    it('updates current_amount', async () => {
      const goal = makeGoal({ target_amount: 100000 });
      const res = await agent().put(`/api/goals/${goal.id}`)
        .send({ current_amount: 25000 })
        .expect(200);
      assert.equal(res.body.goal.current_amount, 25000);
    });

    it('auto-marks is_completed when current >= target', async () => {
      const goal = makeGoal({ target_amount: 10000 });
      const res = await agent().put(`/api/goals/${goal.id}`)
        .send({ current_amount: 10000 })
        .expect(200);
      assert.equal(res.body.goal.is_completed, 1);
    });

    it('returns 404 for non-existent', async () => {
      await agent().put('/api/goals/99999')
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  describe('DELETE /api/goals/:id', () => {
    it('deletes goal (200)', async () => {
      const goal = makeGoal();
      await agent().delete(`/api/goals/${goal.id}`).expect(200);
      const { db } = setup();
      const row = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goal.id);
      assert.equal(row, undefined);
    });

    it('returns 404 for non-existent', async () => {
      await agent().delete('/api/goals/99999').expect(404);
    });
  });
});
