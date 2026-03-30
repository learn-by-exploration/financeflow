const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Stress tests (10K transactions)', { timeout: 30000 }, () => {
  let db, accountIds, categoryIds;

  before(() => {
    const env = setup();
    db = env.db;
    cleanDb();

    // Create 5 accounts
    accountIds = [];
    const accountTypes = ['checking', 'savings', 'credit_card', 'cash', 'wallet'];
    for (let i = 0; i < 5; i++) {
      const r = db.prepare(
        'INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_active, include_in_net_worth, position) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)'
      ).run(1, `Account ${i}`, accountTypes[i], 'INR', 50000, '🏦', '#2563EB', i);
      accountIds.push(r.lastInsertRowid);
    }

    // Create 50 categories
    categoryIds = [];
    for (let i = 0; i < 50; i++) {
      const type = i < 10 ? 'income' : 'expense';
      const r = db.prepare(
        'INSERT INTO categories (user_id, name, icon, color, type, is_system, position) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(1, `Category ${i}`, '📁', '#8b5cf6', type, i);
      categoryIds.push(r.lastInsertRowid);
    }

    // Create a budget with items for threshold test
    const budgetR = db.prepare(
      'INSERT INTO budgets (user_id, name, period, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(1, 'Stress Budget', 'monthly', '2026-01-01', '2026-12-31');
    const budgetId = budgetR.lastInsertRowid;
    for (let i = 10; i < 20; i++) {
      db.prepare('INSERT INTO budget_items (budget_id, category_id, amount, rollover) VALUES (?, ?, ?, 0)').run(
        budgetId, categoryIds[i], 10000
      );
    }

    // Bulk-insert 10,000 transactions in a single SQLite transaction
    const insertTx = db.prepare(
      'INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date, payee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const startTime = Date.now();
    const insertAll = db.transaction(() => {
      for (let i = 0; i < 10000; i++) {
        const acctId = accountIds[i % 5];
        const catId = categoryIds[i % 50];
        const type = (i % 50) < 10 ? 'income' : 'expense';
        const amount = 100 + (i % 1000);
        const day = String((i % 28) + 1).padStart(2, '0');
        const month = String((i % 12) + 1).padStart(2, '0');
        const date = `2026-${month}-${day}`;
        const desc = i % 100 === 0 ? `test searchable item ${i}` : `Transaction ${i}`;
        insertTx.run(1, acctId, catId, type, amount, 'INR', desc, date, `Payee ${i % 20}`);
      }
    });
    insertAll();
    const elapsed = Date.now() - startTime;
    // Verify insert performance
    assert.ok(elapsed < 5000, `Bulk insert took ${elapsed}ms, expected < 5000ms`);

    const count = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE user_id = 1').get().c;
    assert.equal(count, 10000);
  });

  after(() => {
    cleanDb();
  });

  it('GET /api/transactions (paginated) returns in <500ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/transactions?limit=50&offset=0').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Response took ${elapsed}ms, expected < 500ms`);
    assert.ok(res.body.transactions.length > 0);
    assert.equal(res.body.total, 10000);
  });

  it('GET /api/transactions deep pagination (page 100) returns in <500ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/transactions?limit=50&offset=4950').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Response took ${elapsed}ms, expected < 500ms`);
    assert.ok(res.body.transactions.length > 0);
  });

  it('GET /api/reports/monthly returns in <1000ms with 10K records', async () => {
    const start = Date.now();
    const res = await agent().get('/api/reports/monthly?month=2026-03').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Response took ${elapsed}ms, expected < 1000ms`);
    assert.ok(res.body.month === '2026-03');
  });

  it('GET /api/charts/spending-pie returns in <1000ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/charts/spending-pie?from=2026-01-01&to=2026-12-31').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Response took ${elapsed}ms, expected < 1000ms`);
    assert.ok(res.body);
  });

  it('GET /api/charts/income-expense returns in <1000ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/charts/income-expense?from=2026-01-01&to=2026-12-31&interval=monthly').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Response took ${elapsed}ms, expected < 1000ms`);
  });

  it('GET /api/charts/spending-trend returns in <1000ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/charts/spending-trend?from=2026-01-01&to=2026-12-31&interval=weekly').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Response took ${elapsed}ms, expected < 1000ms`);
  });

  it('GET /api/search?q=test returns in <500ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/search?q=test').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Response took ${elapsed}ms, expected < 500ms`);
    assert.ok(res.body.transactions.length > 0);
  });

  it('GET /api/insights/trends returns in <1000ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/insights/trends?months=6').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Response took ${elapsed}ms, expected < 1000ms`);
  });

  it('POST /api/transactions (single insert) returns in <200ms during load', async () => {
    const start = Date.now();
    const res = await agent().post('/api/transactions').send({
      type: 'expense',
      amount: 500,
      description: 'Stress test insert',
      date: '2026-03-15',
      account_id: accountIds[0],
      category_id: categoryIds[10],
    }).expect(201);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 200, `Response took ${elapsed}ms, expected < 200ms`);
    assert.ok(res.body.transaction.id);
  });

  it('GET /api/transactions with date range filter returns in <500ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/transactions?from=2026-03-01&to=2026-03-31&limit=50').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Response took ${elapsed}ms, expected < 500ms`);
    assert.ok(res.body.transactions.length > 0);
  });

  it('GET /api/transactions with category filter returns in <500ms', async () => {
    const start = Date.now();
    const res = await agent().get(`/api/transactions?category_id=${categoryIds[10]}&limit=50`).expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Response took ${elapsed}ms, expected < 500ms`);
    assert.ok(res.body.transactions.length > 0);
  });

  it('GET /api/accounts (with computed balances) returns in <500ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/accounts').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Response took ${elapsed}ms, expected < 500ms`);
    assert.equal(res.body.accounts.length, 5);
  });

  it('GET /api/budgets (with spending calculation) returns in <1000ms', async () => {
    const start = Date.now();
    const res = await agent().get('/api/budgets').expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Response took ${elapsed}ms, expected < 1000ms`);
    assert.ok(res.body.budgets.length > 0);
  });

  it('Concurrent requests (5 parallel GETs) all succeed', async () => {
    const start = Date.now();
    const results = await Promise.all([
      agent().get('/api/transactions?limit=25').expect(200),
      agent().get('/api/accounts').expect(200),
      agent().get('/api/categories').expect(200),
      agent().get('/api/reports/monthly?month=2026-06').expect(200),
      agent().get('/api/charts/spending-pie?from=2026-01-01&to=2026-06-30').expect(200),
    ]);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `Concurrent requests took ${elapsed}ms, expected < 3000ms`);
    for (const res of results) {
      assert.equal(res.status, 200);
    }
  });

  it('Bulk delete cleanup completes successfully', async () => {
    // Insert 5 deletable expense transactions
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const r = db.prepare(
        'INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(1, accountIds[0], categoryIds[10], 'expense', 50, 'INR', `Bulk del ${i}`, '2026-03-20');
      ids.push(Number(r.lastInsertRowid));
      // Adjust account balance so bulk-delete balance reversal works
      db.prepare('UPDATE accounts SET balance = balance - 50 WHERE id = ?').run(accountIds[0]);
    }
    const start = Date.now();
    const res = await agent().post('/api/transactions/bulk-delete').send({ ids }).expect(200);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Bulk delete took ${elapsed}ms, expected < 1000ms`);
    assert.ok(res.body.deleted === 5 || res.body.ok === true);
  });
});
