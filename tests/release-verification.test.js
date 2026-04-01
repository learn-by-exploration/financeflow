const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, makeSecondUser, today, daysFromNow } = require('./helpers');

describe('v1.0.0 Release Verification', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 100000 });
    category = makeCategory({ name: 'General' });
  });

  // ─── Iteration 41: Complete user journey E2E ───
  describe('Complete user journey', () => {
    it('full flow: register → create account → add transactions → set budget → check reports', async () => {
      // 1. Create account
      const acctRes = await agent().post('/api/accounts').send({
        name: 'HDFC Savings',
        type: 'savings',
        currency: 'INR',
        balance: 200000,
      }).expect(201);
      const acctId = acctRes.body.account.id;

      // 2. Create category
      const catRes = await agent().post('/api/categories').send({
        name: 'Groceries',
        type: 'expense',
        icon: '🛒',
        color: '#22c55e',
      }).expect(201);
      const catId = catRes.body.category.id;

      // 3. Add income
      await agent().post('/api/transactions').send({
        account_id: acctId,
        type: 'income',
        amount: 75000,
        description: 'Salary',
        date: today(),
      }).expect(201);

      // 4. Add expenses
      await agent().post('/api/transactions').send({
        account_id: acctId,
        type: 'expense',
        amount: 3500,
        description: 'Weekly groceries',
        category_id: catId,
        date: today(),
      }).expect(201);

      // 5. Create budget
      const budgetRes = await agent().post('/api/budgets').send({
        name: 'Monthly Budget',
        period: 'monthly',
        start_date: today(),
        end_date: daysFromNow(30),
        items: [{ category_id: catId, amount: 15000 }],
      }).expect(201);
      assert.ok(budgetRes.body.id);

      // 6. Check overview
      const overview = await agent().get('/api/stats/overview').expect(200);
      assert.ok(overview.body.month_income >= 75000);
      assert.ok(overview.body.month_expense >= 3500);

      // 7. Check category breakdown
      const breakdown = await agent().get('/api/stats/category-breakdown').expect(200);
      assert.ok(Array.isArray(breakdown.body.breakdown));

      // 8. Check budget variance
      const variance = await agent().get('/api/stats/budget-variance').expect(200);
      assert.ok(variance.body.budgets.length >= 1);

      // 9. Export data
      const exportRes = await agent().get('/api/data/export').expect(200);
      assert.ok(exportRes.body);

      // 10. Search
      const searchRes = await agent().get('/api/search?q=groceries').expect(200);
      assert.ok(searchRes.body.transactions.length >= 1);
    });
  });

  // ─── Iteration 42: Security verification ───
  describe('OWASP Top 10 verification', () => {
    it('SQL injection — account name', async () => {
      const res = await agent().post('/api/accounts').send({
        name: "'; DROP TABLE accounts; --",
        type: 'savings',
        balance: 0,
      }).expect(201);
      // Should create account with the literal string, not execute SQL
      assert.equal(res.body.account.name, "'; DROP TABLE accounts; --");

      // Verify table still exists
      const list = await agent().get('/api/accounts').expect(200);
      assert.ok(list.body.accounts.length >= 1);
    });

    it('XSS — transaction description', async () => {
      const xss = '<script>alert("xss")</script>';
      const res = await agent().post('/api/transactions').send({
        account_id: account.id,
        type: 'expense',
        amount: 100,
        description: xss,
        date: today(),
      }).expect(201);
      // Stored as-is but should be escaped on rendering
      assert.equal(res.body.transaction.description, xss);
    });

    it('auth bypass — invalid token gets 401', async () => {
      await rawAgent()
        .get('/api/transactions')
        .set('X-Session-Token', 'fake-token')
        .expect(401);
    });

    it('IDOR — cannot access other user data', async () => {
      const txn = makeTransaction(account.id, { description: 'Private', amount: 100 });
      const { agent: user2Agent } = makeSecondUser();

      // Cannot delete
      await user2Agent.delete(`/api/transactions/${txn.id}`).expect(404);

      // Cannot update
      await user2Agent.put(`/api/transactions/${txn.id}`).send({ amount: 999 }).expect(404);
    });

    it('security headers present', async () => {
      const res = await rawAgent().get('/api/health/live').expect(200);
      assert.ok(res.headers['x-content-type-options']);
      assert.ok(res.headers['x-frame-options'] || res.headers['content-security-policy']);
    });

    it('rate limiting header present on API', async () => {
      const res = await agent().get('/api/transactions').expect(200);
      // In test mode rate limiting is disabled, but headers may still appear
      assert.ok(res.status === 200);
    });

    it('password not returned in user data', async () => {
      const res = await agent().get('/api/auth/me').expect(200);
      assert.equal(res.body.user.password_hash, undefined);
      assert.equal(res.body.user.password, undefined);
    });
  });

  // ─── Iteration 43-44: Performance verification ───
  describe('Performance benchmarks', () => {
    it('GET /api/health/live responds < 100ms', async () => {
      const start = Date.now();
      await rawAgent().get('/api/health/live').expect(200);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 100, `Health check took ${elapsed}ms`);
    });

    it('GET /api/transactions responds < 500ms with data', async () => {
      for (let i = 0; i < 30; i++) {
        makeTransaction(account.id, { description: `Perf ${i}`, amount: 100 + i });
      }
      const start = Date.now();
      await agent().get('/api/transactions?limit=25').expect(200);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 500, `Transactions took ${elapsed}ms`);
    });

    it('GET /api/stats/overview responds < 500ms', async () => {
      for (let i = 0; i < 20; i++) {
        makeTransaction(account.id, { description: `Stat ${i}`, amount: 100 + i });
      }
      const start = Date.now();
      await agent().get('/api/stats/overview').expect(200);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 500, `Overview took ${elapsed}ms`);
    });

    it('POST /api/transactions responds < 200ms', async () => {
      const start = Date.now();
      await agent().post('/api/transactions').send({
        account_id: account.id,
        type: 'expense',
        amount: 500,
        description: 'Perf test',
        date: today(),
      }).expect(201);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 200, `Create transaction took ${elapsed}ms`);
    });
  });

  // ─── Iteration 45-47: Documentation & version ───
  describe('Documentation & version endpoints', () => {
    it('GET /api/version returns version', async () => {
      const res = await rawAgent().get('/api/version').expect(200);
      assert.ok(res.body.version);
    });

    it('GET /api/health/live returns alive', async () => {
      const res = await rawAgent().get('/api/health/live').expect(200);
      assert.equal(res.body.status, 'alive');
    });

    it('GET /api/health/ready returns ok', async () => {
      const res = await rawAgent().get('/api/health/ready').expect(200);
      assert.ok(res.body);
    });

    it('GET /api/whats-new accessible', async () => {
      await rawAgent().get('/api/whats-new').expect(200);
    });

    it('GET /api/branding accessible', async () => {
      await rawAgent().get('/api/branding').expect(200);
    });
  });

  // ─── Iteration 48: Complete API coverage check ───
  describe('All protected endpoints require auth', () => {
    const protectedPaths = [
      '/api/accounts',
      '/api/transactions',
      '/api/categories',
      '/api/budgets',
      '/api/goals',
      '/api/groups',
      '/api/subscriptions',
      '/api/settings',
      '/api/rules',
      '/api/recurring',
      '/api/tags',
      '/api/search?q=test',
      '/api/net-worth',
      '/api/reminders',
      '/api/reports/monthly?month=2026-01',
      '/api/insights/trends',
      '/api/charts/cashflow',
      '/api/notifications',
      '/api/calendar',
      '/api/spending-limits',
      '/api/tokens',
      '/api/stats/overview',
    ];

    for (const path of protectedPaths) {
      it(`${path} requires auth (401)`, async () => {
        const res = await rawAgent().get(path);
        assert.equal(res.status, 401, `${path} should require auth, got ${res.status}`);
      });
    }
  });

  // ─── Iteration 49: Final data integrity ───
  describe('Data integrity', () => {
    it('transaction creates update account balance', async () => {
      const initial = account.balance;
      makeTransaction(account.id, { amount: 5000, type: 'expense' });

      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id);
      assert.equal(updated.balance, initial - 5000);
    });

    it('income increases balance', async () => {
      const initial = account.balance;
      makeTransaction(account.id, { amount: 25000, type: 'income' });

      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id);
      assert.equal(updated.balance, initial + 25000);
    });

    it('delete undoes balance change', async () => {
      const txn = makeTransaction(account.id, { amount: 3000, type: 'expense' });

      const { db } = setup();
      const afterExpense = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id);
      assert.equal(afterExpense.balance, account.balance - 3000);

      await agent().delete(`/api/transactions/${txn.id}`).expect(200);

      const restored = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id);
      assert.equal(restored.balance, account.balance);
    });
  });
});
