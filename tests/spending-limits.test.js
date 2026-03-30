const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeSecondUser, today } = require('./helpers');

describe('Spending Limits & Smart Alerts', () => {
  let db, account, category;

  beforeEach(() => {
    ({ db } = setup());
    cleanDb();
    account = makeAccount();
    category = makeCategory({ name: 'Food', type: 'expense' });
  });

  after(() => teardown());

  // ─── CRUD ───

  it('should create a spending limit with category', async () => {
    const res = await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 5000,
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.spending_limit.id);
    assert.equal(res.body.spending_limit.category_id, category.id);
    assert.equal(res.body.spending_limit.period, 'monthly');
    assert.equal(res.body.spending_limit.amount, 5000);
  });

  it('should create an overall spending limit (no category)', async () => {
    const res = await agent().post('/api/spending-limits').send({
      period: 'weekly',
      amount: 10000,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.spending_limit.category_id, null);
    assert.equal(res.body.spending_limit.period, 'weekly');
    assert.equal(res.body.spending_limit.amount, 10000);
  });

  it('should list spending limits with current spending', async () => {
    // Create a limit
    await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 5000,
    });

    // Create an expense transaction
    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 1000,
      description: 'Groceries',
      date: today(),
    });

    const res = await agent().get('/api/spending-limits');
    assert.equal(res.status, 200);
    assert.equal(res.body.spending_limits.length, 1);
    assert.equal(res.body.spending_limits[0].current_spending, 1000);
    assert.equal(res.body.spending_limits[0].percentage, 20);
    assert.equal(res.body.spending_limits[0].category_name, 'Food');
  });

  it('should update a spending limit', async () => {
    const create = await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 5000,
    });
    const id = create.body.spending_limit.id;

    const res = await agent().put(`/api/spending-limits/${id}`).send({
      amount: 8000,
      period: 'weekly',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.spending_limit.amount, 8000);
    assert.equal(res.body.spending_limit.period, 'weekly');
  });

  it('should delete a spending limit', async () => {
    const create = await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 5000,
    });
    const id = create.body.spending_limit.id;

    const res = await agent().delete(`/api/spending-limits/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    // Verify deleted
    const list = await agent().get('/api/spending-limits');
    assert.equal(list.body.spending_limits.length, 0);
  });

  it('should return 404 when updating non-existent limit', async () => {
    const res = await agent().put('/api/spending-limits/9999').send({ amount: 100 });
    assert.equal(res.status, 404);
  });

  it('should return 404 when deleting non-existent limit', async () => {
    const res = await agent().delete('/api/spending-limits/9999');
    assert.equal(res.status, 404);
  });

  // ─── Validation ───

  it('should reject invalid period', async () => {
    const res = await agent().post('/api/spending-limits').send({
      period: 'yearly',
      amount: 5000,
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.toLowerCase().includes('period') || res.body.error.code === 'VALIDATION_ERROR');
  });

  it('should reject negative amount', async () => {
    const res = await agent().post('/api/spending-limits').send({
      period: 'monthly',
      amount: -100,
    });
    assert.equal(res.status, 400);
  });

  it('should reject zero amount', async () => {
    const res = await agent().post('/api/spending-limits').send({
      period: 'monthly',
      amount: 0,
    });
    assert.equal(res.status, 400);
  });

  // ─── Auth ───

  it('should require auth for spending limits endpoints', async () => {
    const { setup: s } = require('./helpers');
    const request = require('supertest');
    const { app } = s();

    const res = await request(app).get('/api/spending-limits');
    assert.equal(res.status, 401);
  });

  it('should not access other user spending limits', async () => {
    // Create limit as user 1
    const create = await agent().post('/api/spending-limits').send({
      period: 'monthly',
      amount: 5000,
    });
    const id = create.body.spending_limit.id;

    // User 2 tries to update
    const user2 = makeSecondUser();
    const res = await user2.agent.put(`/api/spending-limits/${id}`).send({ amount: 100 });
    assert.equal(res.status, 404);

    // User 2 tries to delete
    const res2 = await user2.agent.delete(`/api/spending-limits/${id}`);
    assert.equal(res2.status, 404);

    // User 2 should see empty list
    const list = await user2.agent.get('/api/spending-limits');
    assert.equal(list.body.spending_limits.length, 0);
  });

  // ─── Smart Alerts ───

  it('should create warning notification at 80% of limit', async () => {
    // Create a monthly limit of 1000
    await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 1000,
    });

    // Spend 850 (85% of limit) - should trigger warning
    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 850,
      description: 'Big groceries',
      date: today(),
    });

    // Check notifications
    const notifs = await agent().get('/api/notifications');
    const warning = notifs.body.notifications.find(n => n.type === 'spending_warning');
    assert.ok(warning, 'Should have a spending_warning notification');
    assert.ok(warning.message.includes('85%'));
  });

  it('should create exceeded notification when over limit', async () => {
    // Create a monthly limit of 500
    await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 500,
    });

    // Spend 600 (120% of limit) - should trigger exceeded
    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 600,
      description: 'Over budget meal',
      date: today(),
    });

    const notifs = await agent().get('/api/notifications');
    const exceeded = notifs.body.notifications.find(n => n.type === 'spending_exceeded');
    assert.ok(exceeded, 'Should have a spending_exceeded notification');
    assert.ok(exceeded.message.includes('exceeded'));
  });

  it('should create unusual spending alert for 3x average', async () => {
    // Create some baseline transactions (need at least 3 for average)
    // Use dates within the last 90 days so they count for the average
    const d = today();
    for (let i = 0; i < 5; i++) {
      await agent().post('/api/transactions').send({
        account_id: account.id,
        category_id: category.id,
        type: 'expense',
        amount: 100,
        description: 'Normal expense ' + i,
        date: d,
      });
    }

    // Clear notifications from previous transactions
    db.exec('DELETE FROM notifications');

    // Now create a transaction >3x the average (avg is ~100, so after insert avg includes this one)
    // With 5x100 + 1x1000 = avg 250, and 1000 > 250*3=750 → triggers
    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 1000,
      description: 'Unusual expense',
      date: d,
    });

    const notifs = await agent().get('/api/notifications');
    const unusual = notifs.body.notifications.find(n => n.type === 'unusual_spending');
    assert.ok(unusual, 'Should have an unusual_spending notification');
    assert.ok(unusual.message.includes('significantly higher'));
  });

  it('should not alert when spending is below 80% of limit', async () => {
    await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 10000,
    });

    // Spend only 500 (5% of limit)
    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 500,
      description: 'Small expense',
      date: today(),
    });

    const notifs = await agent().get('/api/notifications');
    const spending = notifs.body.notifications.filter(n =>
      n.type === 'spending_warning' || n.type === 'spending_exceeded'
    );
    assert.equal(spending.length, 0, 'Should not have spending limit notifications');
  });

  it('should check overall limit (no category) on any expense', async () => {
    // Overall daily limit of 200
    await agent().post('/api/spending-limits').send({
      period: 'daily',
      amount: 200,
    });

    // Spend 250 in any category — should exceed
    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 250,
      description: 'Exceeds daily overall',
      date: today(),
    });

    const notifs = await agent().get('/api/notifications');
    const exceeded = notifs.body.notifications.find(n => n.type === 'spending_exceeded');
    assert.ok(exceeded, 'Should trigger exceeded notification for overall limit');
    assert.ok(exceeded.message.includes('overall'));
  });

  it('should not create alerts for income transactions', async () => {
    await agent().post('/api/spending-limits').send({
      category_id: category.id,
      period: 'monthly',
      amount: 100,
    });

    const incomeCategory = makeCategory({ name: 'Salary', type: 'income' });

    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: incomeCategory.id,
      type: 'income',
      amount: 50000,
      description: 'Salary',
      date: today(),
    });

    const notifs = await agent().get('/api/notifications');
    const spending = notifs.body.notifications.filter(n =>
      n.type === 'spending_warning' || n.type === 'spending_exceeded'
    );
    assert.equal(spending.length, 0);
  });

  it('should reject non-existent category_id', async () => {
    const res = await agent().post('/api/spending-limits').send({
      category_id: 99999,
      period: 'monthly',
      amount: 5000,
    });
    assert.equal(res.status, 400);
  });
});
