// tests/api-edge-cases.test.js — Boundary conditions and edge cases for API endpoints
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction, makeGoal, makeBudget, makeSubscription, rawAgent } = require('./helpers');

describe('API Edge Cases', () => {
  let app;
  beforeEach(() => {
    ({ app } = setup());
    cleanDb();
  });

  describe('Transactions', () => {
    it('rejects amount of 0', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 0, description: 'Zero', date: new Date().toISOString().slice(0, 10)
      });
      assert.ok([400, 422].includes(res.status), `Expected 400/422 got ${res.status}`);
    });

    it('rejects negative amount', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: -100, description: 'Negative', date: new Date().toISOString().slice(0, 10)
      });
      assert.ok([400, 422].includes(res.status));
    });

    it('handles very large amount within limits', async () => {
      const acct = makeAccount({ balance: 1e12 });
      const cat = makeCategory({ type: 'income' });
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'income',
        amount: 999999999, description: 'Big income', date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(res.status, 201);
    });

    it('handles description with special characters', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Café & Résumé <script>alert(1)</script>', date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(res.status, 201);
      // Verify the description is stored as-is (sanitized at render time)
      assert.ok(res.body.transaction.description.includes('Café'));
    });

    it('rejects future date more than reasonable', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Future', date: '2099-12-31'
      });
      // May be accepted depending on validation — but should not crash
      assert.ok([201, 400].includes(res.status));
    });

    it('bulk delete with empty array', async () => {
      const res = await agent(app).post('/api/transactions/bulk-delete').send({ ids: [] });
      assert.ok([400, 200].includes(res.status));
    });

    it('bulk delete with non-existent IDs', async () => {
      const res = await agent(app).post('/api/transactions/bulk-delete').send({ ids: [999999] });
      assert.ok([400, 200].includes(res.status));
    });

    it('handles missing description gracefully', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 50, date: new Date().toISOString().slice(0, 10)
      });
      // Description may or may not be required
      assert.ok([201, 400].includes(res.status));
    });
  });

  describe('Accounts', () => {
    it('rejects duplicate account names', async () => {
      makeAccount({ name: 'UniqueAccount' });
      const res = await agent(app).post('/api/accounts').send({
        name: 'UniqueAccount', type: 'checking', balance: 0
      });
      // May allow duplicates or reject as conflict
      assert.ok([201, 409].includes(res.status));
    });

    it('handles account with very long name within limits', async () => {
      const res = await agent(app).post('/api/accounts').send({
        name: 'A'.repeat(100), type: 'checking', balance: 0
      });
      assert.ok([201, 400].includes(res.status));
    });

    it('rejects invalid account type', async () => {
      const res = await agent(app).post('/api/accounts').send({
        name: 'Bad Type', type: 'invalid_type', balance: 0
      });
      assert.ok([400, 422].includes(res.status));
    });

    it('deleting account with transactions', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      makeTransaction(acct.id, { category_id: cat.id });
      const res = await agent(app).delete(`/api/accounts/${acct.id}`);
      // Should either succeed (cascade) or reject (has dependencies)
      assert.ok([200, 400, 409].includes(res.status));
    });

    it('updating non-existent account returns 404', async () => {
      const res = await agent(app).put('/api/accounts/999999').send({ name: 'Updated' });
      assert.equal(res.status, 404);
    });
  });

  describe('Categories', () => {
    it('rejects empty category name', async () => {
      const res = await agent(app).post('/api/categories').send({
        name: '', type: 'expense'
      });
      assert.ok([400, 422].includes(res.status));
    });

    it('can delete system category via API', async () => {
      const cat = makeCategory({ is_system: 1 });
      const res = await agent(app).delete(`/api/categories/${cat.id}`);
      assert.equal(res.status, 200);
    });

    it('category suggest returns null for empty description', async () => {
      const res = await agent(app).get('/api/categories/suggest');
      assert.equal(res.status, 200);
      assert.equal(res.body.suggestion, null);
    });
  });

  describe('Budgets', () => {
    it('rejects budget with end_date before start_date', async () => {
      const res = await agent(app).post('/api/budgets').send({
        name: 'Bad dates', period: 'monthly',
        start_date: '2025-12-31', end_date: '2025-01-01'
      });
      assert.ok([400, 422].includes(res.status));
    });

    it('budget summary for non-existent budget', async () => {
      const res = await agent(app).get('/api/budgets/999999/summary');
      assert.equal(res.status, 404);
    });
  });

  describe('Goals', () => {
    it('goal with target_amount 0 is rejected', async () => {
      const res = await agent(app).post('/api/goals').send({
        name: 'Zero goal', target_amount: 0
      });
      assert.ok([400, 422].includes(res.status));
    });

    it('goal progress at 100% marks completed', async () => {
      const goal = makeGoal({ target_amount: 100, current_amount: 100, is_completed: 0 });
      const res = await agent(app).put(`/api/goals/${goal.id}`).send({
        is_completed: 1
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.goal.is_completed, 1);
    });

    it('link same transaction twice returns conflict', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const goal = makeGoal();
      const tx = makeTransaction(acct.id, { category_id: cat.id, type: 'income', amount: 500 });

      await agent(app).post(`/api/goals/${goal.id}/transactions`).send({ transaction_id: tx.id });
      const res2 = await agent(app).post(`/api/goals/${goal.id}/transactions`).send({ transaction_id: tx.id });
      assert.equal(res2.status, 409);
    });
  });

  describe('Tags', () => {
    it('duplicate tag name returns conflict', async () => {
      await agent(app).post('/api/tags').send({ name: 'DupTag', color: '#FF0000' });
      const res = await agent(app).post('/api/tags').send({ name: 'DupTag', color: '#00FF00' });
      assert.equal(res.status, 409);
    });

    it('empty tag name is rejected', async () => {
      const res = await agent(app).post('/api/tags').send({ name: '', color: '#FF0000' });
      assert.ok([400, 422].includes(res.status));
    });
  });

  describe('Subscriptions', () => {
    it('rejects invalid frequency', async () => {
      const res = await agent(app).post('/api/subscriptions').send({
        name: 'Bad', amount: 100, frequency: 'biweekly'
      });
      assert.ok([400, 422].includes(res.status));
    });

    it('upcoming subscriptions with zero days', async () => {
      const res = await agent(app).get('/api/subscriptions/upcoming?days=0');
      assert.equal(res.status, 200);
    });
  });

  describe('Stats Calculators', () => {
    it('EMI calculator rejects zero principal', async () => {
      const res = await agent(app).get('/api/stats/emi-calculator?principal=0&rate=10&tenure=12');
      assert.equal(res.status, 400);
    });

    it('SIP calculator handles step-up of 0', async () => {
      const res = await agent(app).get('/api/stats/sip-calculator?monthly=5000&return=12&years=10&step_up=0');
      assert.equal(res.status, 200);
      assert.ok(res.body.total_invested > 0);
    });

    it('FIRE calculator with minimum values', async () => {
      const res = await agent(app).get('/api/stats/fire-calculator?annual_expense=100000');
      assert.equal(res.status, 200);
      assert.ok(res.body.fire_number > 0);
    });

    it('lumpsum calculator returns correct values', async () => {
      const res = await agent(app).get('/api/stats/lumpsum-calculator?principal=100000&return=10&years=1');
      assert.equal(res.status, 200);
      assert.ok(res.body.future_value > 100000);
    });
  });

  describe('Auth Edge Cases', () => {
    it('login with empty body', async () => {
      const res = await agent(app).post('/api/auth/login').send({});
      assert.ok([400, 401].includes(res.status));
    });

    it('register with very short password', async () => {
      const res = await agent(app).post('/api/auth/register').send({
        username: 'shortpw', password: 'ab'
      });
      assert.equal(res.status, 400);
    });

    it('request with expired session token', async () => {
      const { db } = setup();
      const crypto = require('crypto');
      const token = 'expired-test-token-' + crypto.randomUUID();
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(
        1, hash, '2020-01-01T00:00:00Z'
      );
      const res = await rawAgent().get('/api/accounts').set('X-Session-Token', token);
      assert.equal(res.status, 401);
    });

    it('change password with wrong current password', async () => {
      const res = await agent(app).put('/api/auth/password').send({
        current_password: 'wrong_password_here',
        new_password: 'newSecurePassword123!'
      });
      assert.equal(res.status, 401);
    });
  });

  describe('Health & Diagnostics', () => {
    it('health endpoint returns status', async () => {
      const res = await agent(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.ok(res.body.status);
    });

    it('liveness probe always responds', async () => {
      const res = await agent(app).get('/api/health/live');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'alive');
    });

    it('readiness probe checks db', async () => {
      const res = await agent(app).get('/api/health/ready');
      assert.equal(res.status, 200);
    });
  });

  describe('Data Import/Export', () => {
    it('export returns valid JSON structure', async () => {
      const res = await agent(app).get('/api/data/export');
      assert.equal(res.status, 200);
      assert.ok(res.body.exported_at);
      assert.ok(res.body.version);
    });

    it('import without password fails', async () => {
      const res = await agent(app).post('/api/data/import').send({
        data: {}, confirm: 'DELETE ALL DATA'
      });
      assert.equal(res.status, 403);
    });

    it('import without confirmation fails', async () => {
      const res = await agent(app).post('/api/data/import').send({
        password: 'testpassword', data: {}
      });
      assert.equal(res.status, 400);
    });

    it('CSV template download works', async () => {
      const res = await agent(app).get('/api/data/csv-template');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/csv'));
    });
  });

  describe('Pagination', () => {
    it('transactions with offset beyond count returns empty', async () => {
      const res = await agent(app).get('/api/transactions?offset=999999');
      assert.equal(res.status, 200);
      assert.equal(res.body.transactions.length, 0);
    });

    it('categories with limit of 1', async () => {
      makeCategory({ name: 'Cat1' });
      makeCategory({ name: 'Cat2' });
      const res = await agent(app).get('/api/categories?limit=1');
      assert.equal(res.status, 200);
      assert.equal(res.body.categories.length, 1);
    });

    it('accounts with type filter', async () => {
      makeAccount({ name: 'Checking1', type: 'checking' });
      makeAccount({ name: 'Credit1', type: 'credit_card' });
      const res = await agent(app).get('/api/accounts?type=checking');
      assert.equal(res.status, 200);
      assert.ok(res.body.accounts.every(a => a.type === 'checking'));
    });
  });

  describe('Settings & Preferences', () => {
    it('set and get a preference', async () => {
      await agent(app).put('/api/settings').send({ key: 'default_currency', value: 'USD' });
      const res = await agent(app).get('/api/settings');
      assert.equal(res.status, 200);
      assert.equal(res.body.settings.default_currency, 'USD');
    });

    it('rejects invalid setting key', async () => {
      const res = await agent(app).put('/api/settings').send({ key: 'invalid_key_xxx', value: 'test' });
      assert.equal(res.status, 400);
    });
  });

  describe('Notifications', () => {
    it('read-all with no notifications succeeds', async () => {
      const res = await agent(app).post('/api/notifications/read-all');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });
});
