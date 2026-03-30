const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction, makeBudget } = require('./helpers');

describe('Budget Rollover — v0.2.7', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('PUT /api/budgets/:id/items/:itemId', () => {
    it('toggles rollover on a budget item', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budgetRes = await agent().post('/api/budgets').send({
        name: 'Jan', period: 'monthly', start_date: '2025-01-01', end_date: '2025-01-31',
        items: [{ category_id: cat.id, amount: 5000, rollover: 0 }],
      }).expect(201);

      const detail = await agent().get(`/api/budgets/${budgetRes.body.id}`).expect(200);
      const itemId = detail.body.items[0].id;

      // Enable rollover
      const res = await agent().put(`/api/budgets/${budgetRes.body.id}/items/${itemId}`)
        .send({ rollover: 1 }).expect(200);
      assert.equal(res.body.item.rollover, 1);

      // Disable rollover
      const res2 = await agent().put(`/api/budgets/${budgetRes.body.id}/items/${itemId}`)
        .send({ rollover: 0 }).expect(200);
      assert.equal(res2.body.item.rollover, 0);
    });

    it('updates amount on budget item', async () => {
      const cat = makeCategory({ name: 'Transport', type: 'expense' });
      const budgetRes = await agent().post('/api/budgets').send({
        name: 'Jan', period: 'monthly', start_date: '2025-01-01', end_date: '2025-01-31',
        items: [{ category_id: cat.id, amount: 3000 }],
      }).expect(201);

      const detail = await agent().get(`/api/budgets/${budgetRes.body.id}`).expect(200);
      const itemId = detail.body.items[0].id;

      const res = await agent().put(`/api/budgets/${budgetRes.body.id}/items/${itemId}`)
        .send({ amount: 5000 }).expect(200);
      assert.equal(res.body.item.amount, 5000);
    });

    it('rejects non-existent budget (404)', async () => {
      await agent().put('/api/budgets/999/items/1').send({ rollover: 1 }).expect(404);
    });

    it('rejects non-existent item (404)', async () => {
      const cat = makeCategory({ name: 'Test', type: 'expense' });
      const budgetRes = await agent().post('/api/budgets').send({
        name: 'B', period: 'monthly', items: [{ category_id: cat.id, amount: 100 }],
      }).expect(201);

      await agent().put(`/api/budgets/${budgetRes.body.id}/items/9999`)
        .send({ rollover: 1 }).expect(404);
    });
  });

  describe('Budget summary with rollover', () => {
    it('includes rollover_amount=0 when rollover disabled', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });

      const b = await agent().post('/api/budgets').send({
        name: 'Feb', period: 'monthly', start_date: '2025-02-01', end_date: '2025-02-28',
        items: [{ category_id: cat.id, amount: 5000, rollover: 0 }],
      }).expect(201);

      const res = await agent().get(`/api/budgets/${b.body.id}/summary`).expect(200);
      assert.equal(res.body.categories[0].rollover_amount, 0);
    });

    it('carries underspend from previous budget when rollover enabled', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });

      // Jan budget: 5000 allocated, 3000 spent → 2000 underspend
      const jan = await agent().post('/api/budgets').send({
        name: 'Jan', period: 'monthly', start_date: '2025-01-01', end_date: '2025-01-31',
        items: [{ category_id: cat.id, amount: 5000, rollover: 1 }],
      }).expect(201);

      makeTransaction(acct.id, { type: 'expense', amount: 3000, category_id: cat.id, date: '2025-01-15', description: 'Jan food' });

      // Feb budget: 5000 allocated → effective = 5000 + 2000 = 7000
      const feb = await agent().post('/api/budgets').send({
        name: 'Feb', period: 'monthly', start_date: '2025-02-01', end_date: '2025-02-28',
        items: [{ category_id: cat.id, amount: 5000, rollover: 1 }],
      }).expect(201);

      const res = await agent().get(`/api/budgets/${feb.body.id}/summary`).expect(200);
      assert.equal(res.body.categories[0].rollover_amount, 2000);
      assert.equal(res.body.categories[0].effective_allocated, 7000);
    });

    it('reduces allocation when previous period was overspent', async () => {
      const cat = makeCategory({ name: 'Shopping', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });

      // Jan: 3000 allocated, 4000 spent → -1000 overspend
      const jan = await agent().post('/api/budgets').send({
        name: 'Jan', period: 'monthly', start_date: '2025-01-01', end_date: '2025-01-31',
        items: [{ category_id: cat.id, amount: 3000, rollover: 1 }],
      }).expect(201);
      makeTransaction(acct.id, { type: 'expense', amount: 4000, category_id: cat.id, date: '2025-01-15', description: 'Overspend' });

      // Feb: 3000 allocated → effective = 3000 + (-1000) = 2000
      const feb = await agent().post('/api/budgets').send({
        name: 'Feb', period: 'monthly', start_date: '2025-02-01', end_date: '2025-02-28',
        items: [{ category_id: cat.id, amount: 3000, rollover: 1 }],
      }).expect(201);

      const res = await agent().get(`/api/budgets/${feb.body.id}/summary`).expect(200);
      assert.equal(res.body.categories[0].rollover_amount, -1000);
      assert.equal(res.body.categories[0].effective_allocated, 2000);
    });

    it('first budget has no rollover source (rollover_amount=0)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });

      const first = await agent().post('/api/budgets').send({
        name: 'First', period: 'monthly', start_date: '2025-01-01', end_date: '2025-01-31',
        items: [{ category_id: cat.id, amount: 5000, rollover: 1 }],
      }).expect(201);

      const res = await agent().get(`/api/budgets/${first.body.id}/summary`).expect(200);
      assert.equal(res.body.categories[0].rollover_amount, 0);
    });
  });
});
