const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeGoal, makeAccount, makeCategory, makeTransaction, makeSecondUser } = require('./helpers');

describe('Goal-Transaction Linking & Savings Automation', () => {
  let db, account, category;

  before(() => {
    ({ db } = setup());
  });
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ name: 'Main Checking', balance: 100000 });
    category = makeCategory({ name: 'Salary', type: 'income' });
  });

  // ─── Link transaction to goal ───

  describe('POST /api/goals/:id/transactions', () => {
    it('links a transaction to a goal (201)', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Salary' });
      const res = await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: 5000 })
        .expect(201);
      assert.ok(res.body.link);
      assert.equal(res.body.link.amount, 5000);
      assert.equal(res.body.goal.current_amount, 5000);
    });

    it('links with default amount from transaction when amount not provided', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 3000, description: 'Bonus' });
      const res = await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id })
        .expect(201);
      assert.equal(res.body.link.amount, 3000);
      assert.equal(res.body.goal.current_amount, 3000);
    });

    it('rejects missing transaction_id (400)', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ amount: 1000 })
        .expect(400);
    });

    it('rejects negative amount (400)', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Salary' });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: -100 })
        .expect(400);
    });

    it('rejects linking same transaction twice (409)', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Salary' });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: 5000 })
        .expect(201);
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: 5000 })
        .expect(409);
    });

    it('returns 404 for non-existent goal', async () => {
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Salary' });
      await agent().post('/api/goals/99999/transactions')
        .send({ transaction_id: tx.id, amount: 1000 })
        .expect(404);
    });

    it('cannot link transaction from another user\'s goal', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Salary' });
      const { agent: agent2 } = makeSecondUser();
      await agent2.post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: 1000 })
        .expect(404);
    });
  });

  // ─── List linked transactions ───

  describe('GET /api/goals/:id/transactions', () => {
    it('lists linked transactions correctly', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx1 = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Salary Jan' });
      const tx2 = makeTransaction(account.id, { type: 'income', amount: 3000, description: 'Salary Feb' });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx1.id, amount: 5000 });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx2.id, amount: 3000 });

      const res = await agent().get(`/api/goals/${goal.id}/transactions`).expect(200);
      assert.equal(res.body.transactions.length, 2);
      assert.equal(res.body.total, 2);
    });

    it('returns empty list for goal with no linked transactions', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const res = await agent().get(`/api/goals/${goal.id}/transactions`).expect(200);
      assert.deepEqual(res.body.transactions, []);
      assert.equal(res.body.total, 0);
    });

    it('returns 404 for non-existent goal', async () => {
      await agent().get('/api/goals/99999/transactions').expect(404);
    });
  });

  // ─── Unlink transaction ───

  describe('DELETE /api/goals/:id/transactions/:txId', () => {
    it('unlinks a transaction from a goal', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Salary' });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: 5000 });

      const res = await agent().delete(`/api/goals/${goal.id}/transactions/${tx.id}`).expect(200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.goal.current_amount, 0);

      // Verify it's really gone
      const list = await agent().get(`/api/goals/${goal.id}/transactions`).expect(200);
      assert.equal(list.body.transactions.length, 0);
    });

    it('returns 404 for non-existent link', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      await agent().delete(`/api/goals/${goal.id}/transactions/99999`).expect(404);
    });
  });

  // ─── Goal current_amount updates ───

  describe('Goal current_amount tracking', () => {
    it('current_amount reflects sum of linked transaction amounts', async () => {
      const goal = makeGoal({ target_amount: 50000 });
      const tx1 = makeTransaction(account.id, { type: 'income', amount: 10000, description: 'Pay 1' });
      const tx2 = makeTransaction(account.id, { type: 'income', amount: 15000, description: 'Pay 2' });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx1.id, amount: 10000 });
      await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx2.id, amount: 15000 });

      // Check via GET goal
      const res = await agent().get('/api/goals').expect(200);
      const g = res.body.goals.find(g => g.id === goal.id);
      assert.equal(g.current_amount, 25000);
    });

    it('marks goal completed when linked amounts reach target', async () => {
      const goal = makeGoal({ target_amount: 5000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Final' });
      const res = await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: 5000 })
        .expect(201);
      assert.equal(res.body.goal.is_completed, 1);
      assert.equal(res.body.goal.current_amount, 5000);
    });

    it('progress percentage is calculable from current and target', async () => {
      const goal = makeGoal({ target_amount: 20000 });
      const tx = makeTransaction(account.id, { type: 'income', amount: 5000, description: 'Part' });
      const res = await agent().post(`/api/goals/${goal.id}/transactions`)
        .send({ transaction_id: tx.id, amount: 5000 })
        .expect(201);
      const progress = (res.body.goal.current_amount / res.body.goal.target_amount) * 100;
      assert.equal(progress, 25);
    });
  });

  // ─── Auto-allocate percentage ───

  describe('PUT /api/goals/:id/auto-allocate', () => {
    it('sets auto-allocate percentage correctly', async () => {
      const goal = makeGoal({ target_amount: 100000 });
      const res = await agent().put(`/api/goals/${goal.id}/auto-allocate`)
        .send({ percent: 10 })
        .expect(200);
      assert.equal(res.body.goal.auto_allocate_percent, 10);
    });

    it('rejects percent > 100 (400)', async () => {
      const goal = makeGoal({ target_amount: 100000 });
      await agent().put(`/api/goals/${goal.id}/auto-allocate`)
        .send({ percent: 150 })
        .expect(400);
    });

    it('rejects negative percent (400)', async () => {
      const goal = makeGoal({ target_amount: 100000 });
      await agent().put(`/api/goals/${goal.id}/auto-allocate`)
        .send({ percent: -5 })
        .expect(400);
    });

    it('rejects missing percent (400)', async () => {
      const goal = makeGoal({ target_amount: 100000 });
      await agent().put(`/api/goals/${goal.id}/auto-allocate`)
        .send({})
        .expect(400);
    });

    it('returns 404 for non-existent goal', async () => {
      await agent().put('/api/goals/99999/auto-allocate')
        .send({ percent: 10 })
        .expect(404);
    });
  });

  // ─── Savings automation via income transactions ───

  describe('Income auto-allocation', () => {
    it('income transaction triggers auto-allocation to goal', async () => {
      const goal = makeGoal({ target_amount: 100000 });
      await agent().put(`/api/goals/${goal.id}/auto-allocate`).send({ percent: 20 });

      const res = await agent().post('/api/transactions')
        .send({ account_id: account.id, type: 'income', amount: 50000, description: 'Monthly salary', date: new Date().toISOString().slice(0, 10) })
        .expect(201);

      assert.ok(res.body.auto_allocations);
      assert.equal(res.body.auto_allocations.length, 1);
      assert.equal(res.body.auto_allocations[0].goal_id, goal.id);
      assert.equal(res.body.auto_allocations[0].amount, 10000);

      // Verify goal current_amount updated
      const goalRes = await agent().get('/api/goals').expect(200);
      const g = goalRes.body.goals.find(g => g.id === goal.id);
      assert.equal(g.current_amount, 10000);
    });

    it('multiple goals with auto-allocate get correct splits', async () => {
      const goal1 = makeGoal({ name: 'Emergency', target_amount: 100000 });
      const goal2 = makeGoal({ name: 'Vacation', target_amount: 50000 });
      await agent().put(`/api/goals/${goal1.id}/auto-allocate`).send({ percent: 10 });
      await agent().put(`/api/goals/${goal2.id}/auto-allocate`).send({ percent: 5 });

      const res = await agent().post('/api/transactions')
        .send({ account_id: account.id, type: 'income', amount: 100000, description: 'Big bonus', date: new Date().toISOString().slice(0, 10) })
        .expect(201);

      assert.ok(res.body.auto_allocations);
      assert.equal(res.body.auto_allocations.length, 2);

      const alloc1 = res.body.auto_allocations.find(a => a.goal_id === goal1.id);
      const alloc2 = res.body.auto_allocations.find(a => a.goal_id === goal2.id);
      assert.equal(alloc1.amount, 10000);
      assert.equal(alloc2.amount, 5000);
    });

    it('expense transaction does not trigger auto-allocation', async () => {
      const goal = makeGoal({ target_amount: 100000 });
      await agent().put(`/api/goals/${goal.id}/auto-allocate`).send({ percent: 20 });
      const expCat = makeCategory({ name: 'Food', type: 'expense' });

      const res = await agent().post('/api/transactions')
        .send({ account_id: account.id, category_id: expCat.id, type: 'expense', amount: 5000, description: 'Groceries', date: new Date().toISOString().slice(0, 10) })
        .expect(201);

      assert.equal(res.body.auto_allocations, undefined);
    });

    it('completed goals are not auto-allocated to', async () => {
      const goal = makeGoal({ target_amount: 100, is_completed: 1, current_amount: 100 });
      await agent().put(`/api/goals/${goal.id}/auto-allocate`).send({ percent: 50 });

      const res = await agent().post('/api/transactions')
        .send({ account_id: account.id, type: 'income', amount: 1000, description: 'Salary', date: new Date().toISOString().slice(0, 10) })
        .expect(201);

      // No auto_allocations since goal is completed
      assert.equal(res.body.auto_allocations, undefined);
    });
  });
});
