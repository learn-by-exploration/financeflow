// tests/v2-gamification.test.js — Iteration 26-30: Savings challenges & gamification
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, today, daysFromNow } = require('./helpers');

describe('v2 Gamification & Comparison (Iter 26-30)', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 200000 });
    category = makeCategory({ name: 'Dining', type: 'expense' });
  });

  // ─── Iteration 26: Savings challenges CRUD ───
  describe('Savings challenges', () => {
    it('creates a no_spend challenge', async () => {
      const res = await agent().post('/api/stats/challenges').send({
        name: 'No Dining Week',
        type: 'no_spend',
        category_id: category.id,
        start_date: today(),
        end_date: daysFromNow(7),
      }).expect(201);
      assert.ok(res.body.challenge.id);
      assert.equal(res.body.challenge.type, 'no_spend');
    });

    it('creates a savings_target challenge', async () => {
      const res = await agent().post('/api/stats/challenges').send({
        name: 'Save 50K',
        type: 'savings_target',
        target_amount: 50000,
        start_date: today(),
        end_date: daysFromNow(30),
      }).expect(201);
      assert.equal(res.body.challenge.target_amount, 50000);
    });

    it('rejects invalid challenge type', async () => {
      await agent().post('/api/stats/challenges').send({
        name: 'Bad Type',
        type: 'invalid',
        start_date: today(),
        end_date: daysFromNow(7),
      }).expect(400);
    });

    it('rejects challenge with start > end date', async () => {
      await agent().post('/api/stats/challenges').send({
        name: 'Bad Dates',
        type: 'no_spend',
        start_date: daysFromNow(7),
        end_date: today(),
      }).expect(400);
    });

    it('lists challenges', async () => {
      await agent().post('/api/stats/challenges').send({
        name: 'Test Challenge',
        type: 'no_spend',
        category_id: category.id,
        start_date: today(),
        end_date: daysFromNow(7),
      }).expect(201);

      const res = await agent().get('/api/stats/challenges').expect(200);
      assert.equal(res.body.challenges.length, 1);
      assert.equal(res.body.challenges[0].name, 'Test Challenge');
    });

    it('lists only active challenges when filtered', async () => {
      await agent().post('/api/stats/challenges').send({
        name: 'Active One',
        type: 'no_spend',
        category_id: category.id,
        start_date: today(),
        end_date: daysFromNow(7),
      }).expect(201);

      const res = await agent().get('/api/stats/challenges?active=1').expect(200);
      assert.ok(res.body.challenges.length >= 1);
    });

    it('deletes a challenge', async () => {
      const createRes = await agent().post('/api/stats/challenges').send({
        name: 'To Delete',
        type: 'savings_target',
        target_amount: 10000,
        start_date: today(),
        end_date: daysFromNow(7),
      }).expect(201);

      await agent().delete(`/api/stats/challenges/${createRes.body.challenge.id}`).expect(200);

      const listRes = await agent().get('/api/stats/challenges').expect(200);
      assert.equal(listRes.body.challenges.length, 0);
    });

    it('returns 404 for nonexistent challenge', async () => {
      await agent().delete('/api/stats/challenges/99999').expect(404);
    });
  });

  // ─── Iteration 27: Challenge progress calculation ───
  describe('Challenge progress', () => {
    it('no_spend challenge shows 100% when no spending', async () => {
      await agent().post('/api/stats/challenges').send({
        name: 'No Dining',
        type: 'no_spend',
        category_id: category.id,
        start_date: today(),
        end_date: daysFromNow(7),
      }).expect(201);

      const res = await agent().get('/api/stats/challenges').expect(200);
      assert.equal(res.body.challenges[0].progress, 100);
    });

    it('no_spend challenge shows 0% when spending exists', async () => {
      makeTransaction(account.id, { category_id: category.id, amount: 500, date: today() });

      await agent().post('/api/stats/challenges').send({
        name: 'No Dining',
        type: 'no_spend',
        category_id: category.id,
        start_date: today(),
        end_date: daysFromNow(7),
      }).expect(201);

      const res = await agent().get('/api/stats/challenges').expect(200);
      assert.equal(res.body.challenges[0].progress, 0);
    });
  });

  // ─── Iteration 28-29: Month comparison ───
  describe('Month comparison', () => {
    it('returns comparison structure with default months', async () => {
      const res = await agent().get('/api/stats/month-comparison').expect(200);
      assert.ok('month1' in res.body);
      assert.ok('month2' in res.body);
      assert.ok('changes' in res.body);
      assert.ok('income' in res.body.month1);
      assert.ok('expense' in res.body.month1);
      assert.ok('savings_rate' in res.body.month1);
    });

    it('compares specific months', async () => {
      const res = await agent().get('/api/stats/month-comparison?month1=2026-01&month2=2025-12').expect(200);
      assert.equal(res.body.month1.month, '2026-01');
      assert.equal(res.body.month2.month, '2025-12');
      assert.ok('income_change_pct' in res.body.changes);
      assert.ok('expense_change_pct' in res.body.changes);
    });

    it('shows top categories per month', async () => {
      const res = await agent().get('/api/stats/month-comparison').expect(200);
      assert.ok(Array.isArray(res.body.month1.top_categories));
    });
  });

  // ─── Iteration 30: Auth required for new endpoints ───
  describe('New gamification endpoints require auth', () => {
    it('challenges GET requires auth', async () => {
      await rawAgent().get('/api/stats/challenges').expect(401);
    });

    it('challenges POST requires auth', async () => {
      await rawAgent().post('/api/stats/challenges').expect(401);
    });

    it('month-comparison requires auth', async () => {
      await rawAgent().get('/api/stats/month-comparison').expect(401);
    });
  });
});
