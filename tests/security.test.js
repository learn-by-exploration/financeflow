const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, makeBudget, makeSubscription, makeGoal, makeGroup, makeSecondUser } = require('./helpers');

describe('Security', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('Authentication sweep — all protected routes return 401 without auth', () => {
    const protectedRoutes = [
      ['GET', '/api/accounts'],
      ['POST', '/api/accounts'],
      ['PUT', '/api/accounts/1'],
      ['DELETE', '/api/accounts/1'],
      ['GET', '/api/transactions'],
      ['POST', '/api/transactions'],
      ['PUT', '/api/transactions/1'],
      ['DELETE', '/api/transactions/1'],
      ['GET', '/api/categories'],
      ['POST', '/api/categories'],
      ['PUT', '/api/categories/1'],
      ['DELETE', '/api/categories/1'],
      ['GET', '/api/budgets'],
      ['POST', '/api/budgets'],
      ['PUT', '/api/budgets/1'],
      ['DELETE', '/api/budgets/1'],
      ['GET', '/api/subscriptions'],
      ['POST', '/api/subscriptions'],
      ['PUT', '/api/subscriptions/1'],
      ['DELETE', '/api/subscriptions/1'],
      ['GET', '/api/goals'],
      ['POST', '/api/goals'],
      ['PUT', '/api/goals/1'],
      ['DELETE', '/api/goals/1'],
      ['GET', '/api/groups'],
      ['POST', '/api/groups'],
      ['GET', '/api/stats/overview'],
      ['GET', '/api/stats/trends'],
      ['GET', '/api/stats/category-breakdown'],
      ['GET', '/api/stats/financial-health'],
      ['GET', '/api/settings'],
      ['PUT', '/api/settings'],
      ['GET', '/api/rules'],
      ['POST', '/api/rules'],
      ['PUT', '/api/rules/1'],
      ['DELETE', '/api/rules/1'],
      ['GET', '/api/data/export'],
      ['POST', '/api/data/import'],
      ['GET', '/api/data/csv-template'],
      ['POST', '/api/data/csv-import'],
      ['PUT', '/api/auth/password'],
      ['DELETE', '/api/auth/account'],
      ['GET', '/api/recurring'],
      ['POST', '/api/recurring'],
      ['PUT', '/api/recurring/1'],
      ['DELETE', '/api/recurring/1'],
      ['POST', '/api/recurring/1/skip'],
      ['GET', '/api/tags'],
      ['POST', '/api/tags'],
      ['PUT', '/api/tags/1'],
      ['DELETE', '/api/tags/1'],
      ['GET', '/api/search?q=test'],
    ];

    for (const [method, path] of protectedRoutes) {
      it(`${method} ${path} → 401`, async () => {
        const res = await rawAgent()[method.toLowerCase()](path).send({});
        assert.equal(res.status, 401);
      });
    }
  });

  describe('Cross-user data isolation', () => {
    it('User A cannot see User B accounts', async () => {
      const acct = makeAccount({ name: 'User A Savings' });
      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/accounts').expect(200);
      const names = res.body.accounts.map(a => a.name);
      assert.ok(!names.includes('User A Savings'));
    });

    it('User A cannot see User B transactions', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Secret Purchase' });
      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/transactions').expect(200);
      const descs = res.body.transactions.map(t => t.description);
      assert.ok(!descs.includes('Secret Purchase'));
    });

    it('User A cannot see User B budgets', async () => {
      makeBudget({ name: 'Secret Budget' });
      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/budgets').expect(200);
      const names = res.body.budgets.map(b => b.name);
      assert.ok(!names.includes('Secret Budget'));
    });

    it('User A cannot see User B goals', async () => {
      makeGoal({ name: 'Secret Goal', target_amount: 10000 });
      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/goals').expect(200);
      const names = res.body.goals.map(g => g.name);
      assert.ok(!names.includes('Secret Goal'));
    });

    it('User A cannot see User B subscriptions', async () => {
      makeSubscription({ name: 'Secret Sub', amount: 499, frequency: 'monthly' });
      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/subscriptions').expect(200);
      const names = res.body.subscriptions.map(s => s.name);
      assert.ok(!names.includes('Secret Sub'));
    });
  });

  describe('SQL injection protection', () => {
    it('search params are safely parameterized', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Normal purchase' });
      // Try SQL injection in search
      const res = await agent().get("/api/transactions?search='; DROP TABLE users;--").expect(200);
      // Should return 0 results (not crash)
      assert.ok(Array.isArray(res.body.transactions));
      // Verify users table still exists
      const { db } = setup();
      const user = db.prepare('SELECT id FROM users WHERE id = 1').get();
      assert.ok(user);
    });

    it('description fields store raw text safely', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const xssPayload = '<script>alert("xss")</script>';
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 100,
        date: new Date().toISOString().slice(0, 10),
        description: xssPayload
      }).expect(201);
      // Stored as-is (no HTML encoding needed in API — CSP headers handle XSS)
      assert.equal(res.body.transaction.description, xssPayload);
    });
  });

  describe('Invalid input handling', () => {
    it('invalid JSON body → error response with no SQL leak', async () => {
      const res = await agent()
        .post('/api/accounts')
        .set('Content-Type', 'application/json')
        .send('this is not json');
      assert.ok(res.status >= 400);
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('SQLITE'), 'Should not leak SQL errors');
    });

    it('oversized body → rejected', async () => {
      const largeBody = { data: 'x'.repeat(2 * 1024 * 1024) };
      const res = await agent()
        .post('/api/accounts')
        .send(largeBody);
      assert.ok(res.status >= 400);
    });
  });

  describe('Error responses', () => {
    it('never leak SQL errors in response body', async () => {
      // Force an error by sending bad data
      const res = await agent().post('/api/transactions').send({
        account_id: 99999,
        type: 'expense',
        amount: 100,
        date: new Date().toISOString().slice(0, 10),
        description: 'test'
      });
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('SQLITE'), 'Response should not contain SQLITE errors');
    });
  });
});
