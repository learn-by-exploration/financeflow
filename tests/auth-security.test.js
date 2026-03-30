const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeTransaction, makeCategory, makeBudget, makeGoal, makeSubscription, makeGroup } = require('./helpers');

describe('Auth Security — v0.2.1', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Password Change ───

  describe('PUT /api/auth/password', () => {
    it('changes password with valid current password (200)', async () => {
      // Register a fresh user
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'pwuser', password: 'oldpass123' }).expect(201);
      const token = reg.body.token;

      const res = await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', token)
        .send({ current_password: 'oldpass123', new_password: 'newpass456' })
        .expect(200);
      assert.ok(res.body.token, 'should return new session token');

      // Old token should be invalid
      await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', token)
        .expect(401);

      // Can login with new password
      await rawAgent().post('/api/auth/login')
        .send({ username: 'pwuser', password: 'newpass456' })
        .expect(200);
    });

    it('rejects wrong current password (401)', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'pwuser2', password: 'correct123' }).expect(201);

      await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', reg.body.token)
        .send({ current_password: 'wrongpassword', new_password: 'newpass456' })
        .expect(401);
    });

    it('rejects new password shorter than 8 chars (400)', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'pwuser3', password: 'validpass1' }).expect(201);

      await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', reg.body.token)
        .send({ current_password: 'validpass1', new_password: 'short' })
        .expect(400);
    });

    it('rejects missing fields (400)', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'pwuser4', password: 'validpass1' }).expect(201);

      await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', reg.body.token)
        .send({ current_password: 'validpass1' })
        .expect(400);

      await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', reg.body.token)
        .send({ new_password: 'newpass456' })
        .expect(400);
    });

    it('requires authentication (401)', async () => {
      await rawAgent().put('/api/auth/password')
        .send({ current_password: 'x', new_password: 'y' })
        .expect(401);
    });

    it('invalidates all other sessions on password change', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'pwuser5', password: 'validpass1' }).expect(201);
      const token1 = reg.body.token;

      // Login again to get a second session
      const login = await rawAgent().post('/api/auth/login')
        .send({ username: 'pwuser5', password: 'validpass1' }).expect(200);
      const token2 = login.body.token;

      // Change password using token1
      const res = await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', token1)
        .send({ current_password: 'validpass1', new_password: 'newpass456' })
        .expect(200);
      const newToken = res.body.token;

      // Both old tokens should be invalid
      await rawAgent().get('/api/auth/me').set('X-Session-Token', token1).expect(401);
      await rawAgent().get('/api/auth/me').set('X-Session-Token', token2).expect(401);

      // New token should work
      await rawAgent().get('/api/auth/me').set('X-Session-Token', newToken).expect(200);
    });

    it('cannot login with old password after change', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'pwuser6', password: 'oldpass123' }).expect(201);

      await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', reg.body.token)
        .send({ current_password: 'oldpass123', new_password: 'newpass456' })
        .expect(200);

      await rawAgent().post('/api/auth/login')
        .send({ username: 'pwuser6', password: 'oldpass123' })
        .expect(401);
    });
  });

  // ─── Account Deletion ───

  describe('DELETE /api/auth/account', () => {
    it('deletes account and all data with correct password (200)', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'deluser', password: 'password123' }).expect(201);
      const token = reg.body.token;
      const userId = reg.body.user.id;

      // Create some data
      const acctRes = await rawAgent().post('/api/accounts')
        .set('X-Session-Token', token)
        .send({ name: 'Checking', type: 'checking' }).expect(201);

      await rawAgent().post('/api/transactions')
        .set('X-Session-Token', token)
        .send({ account_id: acctRes.body.account.id, type: 'expense', amount: 100, description: 'Test', date: '2025-01-01' }).expect(201);

      // Delete account
      const res = await rawAgent().delete('/api/auth/account')
        .set('X-Session-Token', token)
        .send({ password: 'password123' })
        .expect(200);
      assert.deepEqual(res.body, { ok: true });

      // Token should be invalid
      await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', token).expect(401);

      // Cannot login
      await rawAgent().post('/api/auth/login')
        .send({ username: 'deluser', password: 'password123' }).expect(401);

      // Data should be gone
      const { db } = setup();
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      assert.equal(user, undefined);
      const accts = db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE user_id = ?').get(userId);
      assert.equal(accts.cnt, 0);
      const txns = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?').get(userId);
      assert.equal(txns.cnt, 0);
    });

    it('rejects wrong password (401)', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'deluser2', password: 'password123' }).expect(201);

      await rawAgent().delete('/api/auth/account')
        .set('X-Session-Token', reg.body.token)
        .send({ password: 'wrongpassword' })
        .expect(401);

      // User should still exist
      await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', reg.body.token).expect(200);
    });

    it('rejects missing password (400)', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'deluser3', password: 'password123' }).expect(201);

      await rawAgent().delete('/api/auth/account')
        .set('X-Session-Token', reg.body.token)
        .send({})
        .expect(400);
    });

    it('requires authentication (401)', async () => {
      await rawAgent().delete('/api/auth/account')
        .send({ password: 'password123' })
        .expect(401);
    });

    it('cascades deletion to all user entities', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'cascadeuser', password: 'password123' }).expect(201);
      const token = reg.body.token;
      const userId = reg.body.user.id;

      // Create entities: account, category, budget, goal, subscription
      await rawAgent().post('/api/accounts')
        .set('X-Session-Token', token)
        .send({ name: 'My Savings', type: 'savings' }).expect(201);

      await rawAgent().post('/api/goals')
        .set('X-Session-Token', token)
        .send({ name: 'Vacation', target_amount: 50000 }).expect(201);

      await rawAgent().post('/api/subscriptions')
        .set('X-Session-Token', token)
        .send({ name: 'Netflix', amount: 199, frequency: 'monthly' }).expect(201);

      // Delete account
      await rawAgent().delete('/api/auth/account')
        .set('X-Session-Token', token)
        .send({ password: 'password123' }).expect(200);

      // Verify cascade
      const { db } = setup();
      const tables = ['accounts', 'categories', 'savings_goals', 'subscriptions', 'sessions', 'settings'];
      for (const table of tables) {
        const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE user_id = ?`).get(userId);
        assert.equal(row.cnt, 0, `${table} should be empty for deleted user`);
      }
    });
  });
});
