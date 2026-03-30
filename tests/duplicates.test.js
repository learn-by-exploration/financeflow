const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, today } = require('./helpers');

describe('Duplicate Transaction Detection', () => {
  let db, account, category;

  beforeEach(() => {
    ({ db } = setup());
    cleanDb();
    account = makeAccount();
    category = makeCategory();
  });

  after(() => teardown());

  // ─── Helper ───

  async function createTx(overrides = {}) {
    const data = {
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 500,
      description: 'Coffee Shop',
      date: today(),
      ...overrides,
    };
    const res = await agent().post('/api/transactions').send(data);
    assert.equal(res.status, 201);
    return res;
  }

  // ─── Detection ───

  it('should detect exact duplicates (same amount, date, description, account)', async () => {
    await createTx();
    await createTx();

    const res = await agent().get('/api/transactions/duplicates');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.duplicates));
    assert.equal(res.body.duplicates.length, 1);
    assert.equal(res.body.duplicates[0].amount, 500);
    assert.equal(res.body.duplicates[0].description, 'Coffee Shop');
  });

  it('should return no duplicates when none exist', async () => {
    await createTx({ description: 'Coffee Shop', amount: 500 });
    await createTx({ description: 'Grocery Store', amount: 1200 });

    const res = await agent().get('/api/transactions/duplicates');
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicates.length, 0);
  });

  it('should dismiss a duplicate pair', async () => {
    const r1 = await createTx();
    const r2 = await createTx();

    const res = await agent()
      .post('/api/transactions/duplicates/dismiss')
      .send({
        transaction_id_1: r1.body.transaction.id,
        transaction_id_2: r2.body.transaction.id,
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.dismissed, true);
  });

  it('should not show dismissed pairs in future detection', async () => {
    const r1 = await createTx();
    const r2 = await createTx();

    // Dismiss
    await agent()
      .post('/api/transactions/duplicates/dismiss')
      .send({
        transaction_id_1: r1.body.transaction.id,
        transaction_id_2: r2.body.transaction.id,
      });

    // Check duplicates again
    const res = await agent().get('/api/transactions/duplicates');
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicates.length, 0);
  });

  it('should set potential_duplicate flag on transaction POST', async () => {
    await createTx();
    const res = await createTx();
    assert.equal(res.body.potential_duplicate, true);
    assert.ok(res.body.similar_transaction_id);
  });

  it('should not flag potential_duplicate when no similar transaction exists', async () => {
    const res = await createTx();
    assert.equal(res.body.potential_duplicate, false);
  });

  it('should not detect duplicates with different amounts', async () => {
    await createTx({ amount: 500 });
    await createTx({ amount: 700 });

    const res = await agent().get('/api/transactions/duplicates');
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicates.length, 0);
  });

  it('should not detect duplicates with different dates', async () => {
    await createTx({ date: '2026-01-01' });
    await createTx({ date: '2026-01-02' });

    const res = await agent().get('/api/transactions/duplicates');
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicates.length, 0);
  });

  it('should not detect duplicates across different accounts', async () => {
    const account2 = makeAccount({ name: 'Savings Account', type: 'savings' });
    await createTx({ account_id: account.id });
    await createTx({ account_id: account2.id });

    const res = await agent().get('/api/transactions/duplicates');
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicates.length, 0);
  });
});
