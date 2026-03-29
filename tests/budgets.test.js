const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeBudget, makeCategory, makeAccount, makeTransaction, today, daysFromNow } = require('./helpers');

describe('Budgets', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── GET /api/budgets ─────────────────────────────

  describe('GET /api/budgets', () => {
    it('returns empty list initially (200)', async () => {
      const res = await agent().get('/api/budgets').expect(200);
      assert.deepEqual(res.body.budgets, []);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/budgets').expect(401);
    });

    it('returns budgets ordered by created_at DESC', async () => {
      makeBudget({ name: 'First' });
      makeBudget({ name: 'Second' });
      const res = await agent().get('/api/budgets').expect(200);
      assert.equal(res.body.budgets.length, 2);
      // Most recent first
      assert.equal(res.body.budgets[0].name, 'Second');
      assert.equal(res.body.budgets[1].name, 'First');
    });
  });

  // ─── GET /api/budgets/:id ─────────────────────────

  describe('GET /api/budgets/:id', () => {
    it('returns budget with items (200)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budget = makeBudget({ name: 'Monthly', items: [{ category_id: cat.id, amount: 5000 }] });
      const res = await agent().get(`/api/budgets/${budget.id}`).expect(200);
      assert.equal(res.body.budget.name, 'Monthly');
      assert.equal(res.body.items.length, 1);
      assert.equal(res.body.items[0].amount, 5000);
      assert.equal(res.body.items[0].category_name, 'Food');
    });

    it('returns 404 for non-existent (404)', async () => {
      await agent().get('/api/budgets/99999').expect(404);
    });
  });

  // ─── POST /api/budgets ────────────────────────────

  describe('POST /api/budgets', () => {
    it('creates budget with items (201)', async () => {
      const cat = makeCategory({ name: 'Transport', type: 'expense' });
      const res = await agent().post('/api/budgets')
        .send({
          name: 'March Budget',
          period: 'monthly',
          start_date: '2024-03-01',
          end_date: '2024-03-31',
          items: [{ category_id: cat.id, amount: 3000 }]
        })
        .expect(201);
      assert.ok(res.body.id);

      // Verify items stored
      const { db } = setup();
      const items = db.prepare('SELECT * FROM budget_items WHERE budget_id = ?').all(res.body.id);
      assert.equal(items.length, 1);
      assert.equal(items[0].amount, 3000);
    });

    it('creates budget without items (201)', async () => {
      const res = await agent().post('/api/budgets')
        .send({ name: 'Empty Budget', period: 'monthly' })
        .expect(201);
      assert.ok(res.body.id);
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/budgets')
        .send({ period: 'monthly' })
        .expect(400);
    });

    it('rejects invalid period (400)', async () => {
      await agent().post('/api/budgets')
        .send({ name: 'Bad', period: 'biweekly' })
        .expect(400);
    });
  });

  // ─── PUT /api/budgets/:id ─────────────────────────

  describe('PUT /api/budgets/:id', () => {
    it('updates budget name and period (200)', async () => {
      const budget = makeBudget({ name: 'Old Name', period: 'monthly' });
      const res = await agent().put(`/api/budgets/${budget.id}`)
        .send({ name: 'New Name' })
        .expect(200);
      assert.equal(res.body.budget.name, 'New Name');
    });

    it('returns 404 for non-existent', async () => {
      await agent().put('/api/budgets/99999')
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  // ─── DELETE /api/budgets/:id ──────────────────────

  describe('DELETE /api/budgets/:id', () => {
    it('deletes budget and cascades to items (200)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budget = makeBudget({ name: 'Gone', items: [{ category_id: cat.id, amount: 1000 }] });
      await agent().delete(`/api/budgets/${budget.id}`).expect(200);
      const { db } = setup();
      const b = db.prepare('SELECT * FROM budgets WHERE id = ?').get(budget.id);
      assert.equal(b, undefined);
      const items = db.prepare('SELECT * FROM budget_items WHERE budget_id = ?').all(budget.id);
      assert.equal(items.length, 0);
    });
  });

  // ─── GET /api/budgets/:id/summary ─────────────────

  describe('GET /api/budgets/:id/summary', () => {
    it('returns per-category allocated, spent, remaining', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const acct = makeAccount({ balance: 10000 });
      const budget = makeBudget({
        name: 'Monthly',
        start_date: '2024-03-01',
        end_date: '2024-03-31',
        items: [{ category_id: cat.id, amount: 5000 }]
      });
      // Spend 2000 under that category
      makeTransaction(acct.id, { category_id: cat.id, type: 'expense', amount: 2000, date: '2024-03-15' });

      const res = await agent().get(`/api/budgets/${budget.id}/summary`).expect(200);
      assert.ok(res.body.categories);
      const item = res.body.categories.find(c => c.category_id === cat.id);
      assert.ok(item);
      assert.equal(item.allocated, 5000);
      assert.equal(item.spent, 2000);
      assert.equal(item.remaining, 3000);
    });

    it('shows spent=0 for categories with no spending', async () => {
      const cat = makeCategory({ name: 'Transport', type: 'expense' });
      const budget = makeBudget({
        name: 'Monthly',
        start_date: '2024-03-01',
        end_date: '2024-03-31',
        items: [{ category_id: cat.id, amount: 3000 }]
      });
      const res = await agent().get(`/api/budgets/${budget.id}/summary`).expect(200);
      const item = res.body.categories.find(c => c.category_id === cat.id);
      assert.equal(item.spent, 0);
      assert.equal(item.remaining, 3000);
    });

    it('returns totals', async () => {
      const cat1 = makeCategory({ name: 'Food', type: 'expense' });
      const cat2 = makeCategory({ name: 'Transport', type: 'expense' });
      const acct = makeAccount({ balance: 10000 });
      const budget = makeBudget({
        name: 'Monthly',
        start_date: '2024-03-01',
        end_date: '2024-03-31',
        items: [
          { category_id: cat1.id, amount: 5000 },
          { category_id: cat2.id, amount: 2000 }
        ]
      });
      makeTransaction(acct.id, { category_id: cat1.id, type: 'expense', amount: 1000, date: '2024-03-10' });

      const res = await agent().get(`/api/budgets/${budget.id}/summary`).expect(200);
      assert.equal(res.body.total_allocated, 7000);
      assert.equal(res.body.total_spent, 1000);
      assert.equal(res.body.total_remaining, 6000);
    });

    it('returns 404 for non-existent budget', async () => {
      await agent().get('/api/budgets/99999/summary').expect(404);
    });
  });
});
