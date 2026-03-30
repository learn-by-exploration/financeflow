const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeSecondUser } = require('./helpers');

describe('Phase 8 — Reporting & Data', () => {
  let db;

  before(() => {
    ({ db } = setup());
  });

  beforeEach(() => {
    cleanDb();
  });

  after(() => {
    // no teardown — shared DB
  });

  // ═══════════════════════════════════════════
  // 8.1 Net Worth History Chart
  // ═══════════════════════════════════════════

  describe('Net Worth History', () => {
    it('GET /api/reports/net-worth-history returns history array', async () => {
      const account = makeAccount({ balance: 100000 });
      makeTransaction(account.id, { type: 'income', amount: 5000, date: '2025-01-15' });
      makeTransaction(account.id, { type: 'expense', amount: 2000, date: '2025-02-10' });

      const res = await agent().get('/api/reports/net-worth-history');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.history));
    });

    it('history items have month and net_worth fields', async () => {
      const account = makeAccount({ balance: 100000 });
      makeTransaction(account.id, { type: 'income', amount: 5000, date: '2025-01-15' });

      const res = await agent().get('/api/reports/net-worth-history');
      assert.equal(res.status, 200);
      assert.ok(res.body.history.length > 0);
      const item = res.body.history[0];
      assert.ok('month' in item, 'item should have month field');
      assert.ok('net_worth' in item, 'item should have net_worth field');
      assert.match(item.month, /^\d{4}-\d{2}$/);
    });

    it('new user with no transactions returns empty array', async () => {
      const res = await agent().get('/api/reports/net-worth-history');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.history, []);
    });

    it('user with income shows positive net worth growth', async () => {
      const account = makeAccount({ balance: 0 });
      makeTransaction(account.id, { type: 'income', amount: 10000, date: '2025-01-15' });
      makeTransaction(account.id, { type: 'income', amount: 15000, date: '2025-02-15' });

      const res = await agent().get('/api/reports/net-worth-history');
      assert.equal(res.status, 200);
      assert.ok(res.body.history.length >= 2);
      // First month net worth should be positive
      const jan = res.body.history.find(h => h.month === '2025-01');
      const feb = res.body.history.find(h => h.month === '2025-02');
      assert.ok(jan);
      assert.ok(feb);
      assert.ok(jan.net_worth > 0, 'January net worth should be positive');
      assert.ok(feb.net_worth > jan.net_worth, 'February should show growth');
    });

    it('date range filter works (from/to params)', async () => {
      const account = makeAccount({ balance: 0 });
      makeTransaction(account.id, { type: 'income', amount: 5000, date: '2024-06-15' });
      makeTransaction(account.id, { type: 'income', amount: 8000, date: '2025-01-15' });
      makeTransaction(account.id, { type: 'income', amount: 3000, date: '2025-06-15' });

      const res = await agent().get('/api/reports/net-worth-history?from=2025-01&to=2025-06');
      assert.equal(res.status, 200);
      // Should only include months from Jan 2025 to Jun 2025
      for (const item of res.body.history) {
        assert.ok(item.month >= '2025-01' && item.month <= '2025-06',
          `Month ${item.month} should be within range`);
      }
    });
  });

  // ═══════════════════════════════════════════
  // 8.2 Per-Account Transaction List with Running Balance
  // ═══════════════════════════════════════════

  describe('Per-Account Transactions', () => {
    it('GET /api/accounts/:id/transactions returns only that account\'s transactions', async () => {
      const account1 = makeAccount({ name: 'Checking', balance: 0 });
      const account2 = makeAccount({ name: 'Savings', balance: 0 });
      makeTransaction(account1.id, { type: 'income', amount: 1000, description: 'Salary' });
      makeTransaction(account2.id, { type: 'income', amount: 2000, description: 'Bonus' });

      const res = await agent().get(`/api/accounts/${account1.id}/transactions`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.transactions));
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'Salary');
    });

    it('response includes running_balance for each transaction', async () => {
      const account = makeAccount({ balance: 0 });
      makeTransaction(account.id, { type: 'income', amount: 5000, date: '2025-01-01', description: 'A' });
      makeTransaction(account.id, { type: 'expense', amount: 2000, date: '2025-01-02', description: 'B' });

      const res = await agent().get(`/api/accounts/${account.id}/transactions`);
      assert.equal(res.status, 200);
      for (const tx of res.body.transactions) {
        assert.ok('running_balance' in tx, 'transaction should have running_balance');
      }
    });

    it('pagination works (page, limit)', async () => {
      const account = makeAccount({ balance: 0 });
      for (let i = 1; i <= 5; i++) {
        makeTransaction(account.id, { type: 'income', amount: 1000 * i, date: `2025-01-0${i}`, description: `Tx${i}` });
      }

      const res = await agent().get(`/api/accounts/${account.id}/transactions?page=1&limit=2`);
      assert.equal(res.status, 200);
      assert.equal(res.body.transactions.length, 2);
      assert.ok(res.body.total >= 5);

      // Second page
      const res2 = await agent().get(`/api/accounts/${account.id}/transactions?page=2&limit=2`);
      assert.equal(res2.status, 200);
      assert.equal(res2.body.transactions.length, 2);
    });

    it('non-owner gets 403 or 404', async () => {
      const account = makeAccount({ name: 'My Account' });
      const { agent: user2 } = makeSecondUser();

      const res = await user2.get(`/api/accounts/${account.id}/transactions`);
      assert.ok(res.status === 403 || res.status === 404, `Expected 403 or 404, got ${res.status}`);
    });

    it('running balance calculation is correct (income adds, expense subtracts)', async () => {
      const account = makeAccount({ balance: 0 });
      makeTransaction(account.id, { type: 'income', amount: 10000, date: '2025-01-01', description: 'Salary' });
      makeTransaction(account.id, { type: 'expense', amount: 3000, date: '2025-01-02', description: 'Rent' });
      makeTransaction(account.id, { type: 'income', amount: 2000, date: '2025-01-03', description: 'Freelance' });

      const res = await agent().get(`/api/accounts/${account.id}/transactions`);
      assert.equal(res.status, 200);

      // Transactions ordered DESC by date, but running_balance computed chronologically
      // Find them by description
      const txns = res.body.transactions;
      // Sort by date ASC to check running balance logic
      const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

      // After income 10000: running_balance = 10000
      assert.equal(sorted[0].running_balance, 10000);
      // After expense 3000: running_balance = 7000
      assert.equal(sorted[1].running_balance, 7000);
      // After income 2000: running_balance = 9000
      assert.equal(sorted[2].running_balance, 9000);
    });
  });

  // ═══════════════════════════════════════════
  // 8.3 Custom Date Range for Reports
  // ═══════════════════════════════════════════

  describe('Custom Date Range', () => {
    it('GET /api/reports/trends with from/to returns filtered data', async () => {
      const account = makeAccount({ balance: 0 });
      const category = makeCategory({ name: 'Food', type: 'expense' });
      makeTransaction(account.id, { type: 'expense', amount: 500, date: '2025-01-15', category_id: category.id });
      makeTransaction(account.id, { type: 'expense', amount: 700, date: '2025-03-10', category_id: category.id });
      makeTransaction(account.id, { type: 'income', amount: 10000, date: '2025-02-01' });

      const res = await agent().get('/api/reports/trends?from=2025-01-01&to=2025-03-31');
      assert.equal(res.status, 200);
      assert.ok(res.body.months || res.body.trends);
      const data = res.body.months || res.body.trends;
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
    });

    it('without from/to, returns default 12 months', async () => {
      const account = makeAccount({ balance: 0 });
      makeTransaction(account.id, { type: 'expense', amount: 500 });

      const res = await agent().get('/api/reports/trends');
      assert.equal(res.status, 200);
      const data = res.body.months || res.body.trends;
      assert.ok(Array.isArray(data));
      // Default should be up to 12 months
      assert.ok(data.length <= 12);
    });

    it('invalid date range (from > to) returns 400', async () => {
      const res = await agent().get('/api/reports/trends?from=2025-06-01&to=2025-01-01');
      assert.equal(res.status, 400);
    });

    it('category breakdown respects date range', async () => {
      const account = makeAccount({ balance: 0 });
      const cat1 = makeCategory({ name: 'Food', type: 'expense' });
      const cat2 = makeCategory({ name: 'Transport', type: 'expense' });
      makeTransaction(account.id, { type: 'expense', amount: 500, date: '2025-01-15', category_id: cat1.id });
      makeTransaction(account.id, { type: 'expense', amount: 300, date: '2025-06-15', category_id: cat2.id });

      // Only query Jan-Feb range — should only see Food
      const res = await agent().get('/api/reports/categories?from=2025-01-01&to=2025-02-28');
      assert.equal(res.status, 200);
      assert.ok(res.body.categories.length >= 1);
      const names = res.body.categories.map(c => c.name);
      assert.ok(names.includes('Food'));
      assert.ok(!names.includes('Transport'), 'Transport should not appear in Jan-Feb range');
    });
  });
});
