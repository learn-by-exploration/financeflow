const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeBudget, makeGoal } = require('./helpers');

describe('UI States — API responses for Loading, Empty & Error', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── Empty lists return empty arrays (not errors) ──

  describe('Empty states return empty arrays', () => {
    it('GET /api/accounts returns empty array when no accounts exist', async () => {
      const res = await agent().get('/api/accounts').expect(200);
      assert.ok(Array.isArray(res.body.accounts));
      assert.equal(res.body.accounts.length, 0);
    });

    it('GET /api/transactions returns empty array when no transactions exist', async () => {
      const res = await agent().get('/api/transactions').expect(200);
      assert.ok(Array.isArray(res.body.transactions));
      assert.equal(res.body.transactions.length, 0);
      assert.equal(res.body.total, 0);
    });

    it('GET /api/budgets returns empty array when no budgets exist', async () => {
      const res = await agent().get('/api/budgets').expect(200);
      assert.ok(Array.isArray(res.body.budgets));
      assert.equal(res.body.budgets.length, 0);
    });

    it('GET /api/goals returns empty array when no goals exist', async () => {
      const res = await agent().get('/api/goals').expect(200);
      assert.ok(Array.isArray(res.body.goals));
      assert.equal(res.body.goals.length, 0);
    });

    it('GET /api/categories returns array (may include system defaults)', async () => {
      const res = await agent().get('/api/categories').expect(200);
      assert.ok(Array.isArray(res.body.categories));
    });
  });

  // ── API error formats ──

  describe('Error responses have proper structure', () => {
    it('POST /api/accounts with missing name returns 400 with error message', async () => {
      const res = await agent().post('/api/accounts')
        .send({ type: 'checking' })
        .expect(400);
      assert.ok(res.body.error);
      assert.ok(res.body.error.message);
    });

    it('PUT /api/accounts/99999 returns 404 with error message', async () => {
      const res = await agent().put('/api/accounts/99999')
        .send({ name: 'Nope', type: 'checking' })
        .expect(404);
      assert.ok(res.body.error);
      assert.ok(res.body.error.message);
    });

    it('POST /api/transactions with invalid data returns 400 with structured error', async () => {
      const res = await agent().post('/api/transactions')
        .send({ description: 'Bad' })
        .expect(400);
      assert.ok(res.body.error);
      assert.ok(res.body.error.message);
    });

    it('Unauthenticated request returns 401', async () => {
      const { app } = setup();
      const request = require('supertest');
      const res = await request(app)
        .get('/api/accounts')
        .expect(401);
      assert.ok(res.body.error);
    });
  });

  // ── Response structure verification ──

  describe('Response structure for views', () => {
    it('GET /api/stats/overview returns all fields needed by dashboard', async () => {
      const acct = makeAccount({ balance: 10000 });
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      makeTransaction(acct.id, { category_id: cat.id, amount: 500, type: 'expense' });

      const res = await agent().get('/api/stats/overview').expect(200);
      assert.ok('net_worth' in res.body);
      assert.ok('month_income' in res.body);
      assert.ok('month_expense' in res.body);
      assert.ok('month_savings' in res.body);
      assert.ok(Array.isArray(res.body.recent_transactions));
      assert.ok(Array.isArray(res.body.top_categories));
    });

    it('GET /api/transactions returns paginated structure with total', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'Test 1' });
      makeTransaction(acct.id, { description: 'Test 2' });

      const res = await agent().get('/api/transactions?limit=1&offset=0').expect(200);
      assert.ok(Array.isArray(res.body.transactions));
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.total, 2);
    });

    it('GET /api/accounts returns accounts with required display fields', async () => {
      makeAccount({ name: 'Savings', type: 'savings', balance: 25000, icon: '💰' });

      const res = await agent().get('/api/accounts').expect(200);
      const acct = res.body.accounts[0];
      assert.ok('id' in acct);
      assert.ok('name' in acct);
      assert.ok('type' in acct);
      assert.ok('balance' in acct);
      assert.ok('icon' in acct);
    });
  });

  // ── Edge cases ──

  describe('Edge cases handled gracefully', () => {
    it('GET /api/transactions with invalid offset returns empty array (not error)', async () => {
      const res = await agent().get('/api/transactions?limit=10&offset=99999').expect(200);
      assert.ok(Array.isArray(res.body.transactions));
      assert.equal(res.body.transactions.length, 0);
    });

    it('GET /api/budgets/:id/summary returns summary structure even for budget with no items', async () => {
      const budget = makeBudget({ name: 'Empty budget' });
      const res = await agent().get(`/api/budgets/${budget.id}/summary`).expect(200);
      assert.ok(Array.isArray(res.body.categories));
      assert.ok('total_allocated' in res.body);
      assert.ok('total_spent' in res.body);
    });

    it('GET /api/goals returns completed and active goals with correct structure', async () => {
      makeGoal({ name: 'Active Goal', target_amount: 100000, current_amount: 5000 });
      makeGoal({ name: 'Done Goal', target_amount: 1000, current_amount: 1000, is_completed: 1 });

      const res = await agent().get('/api/goals').expect(200);
      assert.equal(res.body.goals.length, 2);
      for (const goal of res.body.goals) {
        assert.ok('id' in goal);
        assert.ok('name' in goal);
        assert.ok('target_amount' in goal);
        assert.ok('current_amount' in goal);
      }
    });
  });
});
