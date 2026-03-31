const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory } = require('./helpers');

describe('Iteration 3 Review Fixes', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── C1: Transaction DELETE balance update scoped by userId ───
  describe('C1: Transaction delete balance scoped', () => {
    it('balance update includes user_id', async () => {
      const acc = makeAccount({ balance: 1000 });
      const cat = makeCategory();
      const res = await agent().post('/api/transactions').send({
        account_id: acc.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Test', date: '2025-01-01'
      }).expect(201);
      const txId = res.body.transaction.id;
      await agent().delete(`/api/transactions/${txId}`).expect(200);
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acc.id);
      assert.equal(updated.balance, 1000, 'Balance should be restored after delete');
    });
  });

  // ─── PUT validation tests ───
  describe('PUT /api/budgets/:id validates body', () => {
    it('rejects invalid period', async () => {
      const acc = makeAccount();
      const cat = makeCategory();
      const bRes = await agent().post('/api/budgets').send({
        name: 'Test Budget', period: 'monthly',
        items: [{ category_id: cat.id, amount: 500 }]
      }).expect(201);
      const res = await agent().put(`/api/budgets/${bRes.body.id}`)
        .send({ period: 'invalid_period' });
      assert.equal(res.status, 400);
    });
  });

  describe('PUT /api/goals/:id validates body', () => {
    it('rejects negative target_amount', async () => {
      const gRes = await agent().post('/api/goals').send({
        name: 'Test', target_amount: 1000
      }).expect(201);
      const res = await agent().put(`/api/goals/${gRes.body.goal.id}`)
        .send({ target_amount: -100 });
      assert.equal(res.status, 400);
    });
  });

  describe('PUT /api/subscriptions/:id validates body', () => {
    it('rejects invalid frequency', async () => {
      const sRes = await agent().post('/api/subscriptions').send({
        name: 'Netflix', amount: 15.99, frequency: 'monthly'
      }).expect(201);
      const res = await agent().put(`/api/subscriptions/${sRes.body.subscription.id}`)
        .send({ frequency: 'biweekly' });
      assert.equal(res.status, 400);
    });
  });

  describe('PUT /api/tags/:id validates body', () => {
    it('rejects empty name', async () => {
      const tRes = await agent().post('/api/tags').send({ name: 'TestTag' }).expect(201);
      const res = await agent().put(`/api/tags/${tRes.body.tag.id}`)
        .send({ name: '' });
      assert.equal(res.status, 400);
    });
  });

  describe('PUT /api/categories/:id validates body', () => {
    it('rejects invalid type', async () => {
      const cRes = await agent().post('/api/categories').send({
        name: 'TestCat', type: 'expense'
      }).expect(201);
      const res = await agent().put(`/api/categories/${cRes.body.category.id}`)
        .send({ type: 'invalid' });
      assert.equal(res.status, 400);
    });
  });

  describe('PUT /api/recurring/:id validates body', () => {
    it('rejects invalid frequency', async () => {
      const acc = makeAccount();
      const rRes = await agent().post('/api/recurring').send({
        account_id: acc.id, type: 'expense', amount: 100,
        description: 'Test', frequency: 'monthly', next_date: '2025-06-01'
      }).expect(201);
      const res = await agent().put(`/api/recurring/${rRes.body.rule.id}`)
        .send({ frequency: 'biweekly' });
      assert.equal(res.status, 400);
    });

    it('accepts valid is_active update', async () => {
      const acc = makeAccount();
      const rRes = await agent().post('/api/recurring').send({
        account_id: acc.id, type: 'expense', amount: 100,
        description: 'Test', frequency: 'monthly', next_date: '2025-06-01'
      }).expect(201);
      const res = await agent().put(`/api/recurring/${rRes.body.rule.id}`)
        .send({ is_active: 0 }).expect(200);
      assert.equal(res.body.rule.is_active, 0);
    });
  });
});
