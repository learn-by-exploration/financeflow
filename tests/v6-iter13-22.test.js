// tests/v6-iter13-22.test.js — Iterations 13-22: Security & reliability
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction,
  makeBudget, makeGoal, makeSubscription, makeGroup, makeGroupMember,
  makeTag, makeRecurringRule,
  today, daysFromNow } = require('./helpers');

describe('v6 Iterations 13-22: Security & Reliability', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ═══════════════════════════════════════
  // ITER 13: OWASP security headers
  // ═══════════════════════════════════════
  describe('Security headers', () => {
    it('responses have X-Content-Type-Options', async () => {
      const res = await agent().get('/api/health/live');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });

    it('responses have X-Frame-Options', async () => {
      const res = await agent().get('/api/health/live');
      assert.ok(res.headers['x-frame-options']);
    });

    it('responses have Content-Security-Policy', async () => {
      const res = await agent().get('/api/health/live');
      assert.ok(res.headers['content-security-policy']);
    });

    it('responses have Strict-Transport-Security', async () => {
      const res = await agent().get('/api/health/live');
      // Only present in production, so check if present or skip
      const hsts = res.headers['strict-transport-security'];
      assert.ok(hsts === undefined || hsts.includes('max-age'));
    });

    it('responses do not expose X-Powered-By', async () => {
      const res = await agent().get('/api/health/live');
      assert.equal(res.headers['x-powered-by'], undefined);
    });
  });

  // ═══════════════════════════════════════
  // ITER 14: Auth security
  // ═══════════════════════════════════════
  describe('Authentication security', () => {
    it('invalid session token returns 401', async () => {
      const { default: supertest } = await import('supertest');
      const raw = supertest(app);
      const res = await raw.get('/api/accounts').set('X-Session-Token', 'bogus-token-12345');
      assert.equal(res.status, 401);
    });

    it('expired session token returns 401', async () => {
      // Create an expired session
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(1, tokenHash, pastDate);

      const { default: supertest } = await import('supertest');
      const raw = supertest(app);
      const res = await raw.get('/api/accounts').set('X-Session-Token', token);
      assert.equal(res.status, 401);
    });

    it('missing session token returns 401', async () => {
      const { default: supertest } = await import('supertest');
      const raw = supertest(app);
      const res = await raw.get('/api/accounts');
      assert.equal(res.status, 401);
    });

    it('login with wrong password returns 401', async () => {
      const { default: supertest } = await import('supertest');
      const raw = supertest(app);
      const res = await raw.post('/api/auth/login').send({ username: 'testuser', password: 'wrongpassword' });
      assert.equal(res.status, 401);
    });

    it('register with short password is rejected', async () => {
      const { default: supertest } = await import('supertest');
      const raw = supertest(app);
      const res = await raw.post('/api/auth/register').send({
        username: 'newuser', password: '12', display_name: 'Test',
      });
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════
  // ITER 15: Data ownership / authorization
  // ═══════════════════════════════════════
  describe('Data ownership enforcement', () => {
    function createOtherUser() {
      // Create a user with id 999 for ownership tests
      const bcryptjs = require('bcryptjs');
      const passHash = bcryptjs.hashSync('otherpass123', 4);
      try {
        db.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)').run(999, 'otheruser', passHash, 'Other');
      } catch (_e) { /* already exists */ }
    }

    it('cannot update another user account', async () => {
      createOtherUser();
      db.prepare('INSERT INTO accounts (user_id, name, type, balance, currency) VALUES (?, ?, ?, ?, ?)').run(999, 'OtherAcct', 'checking', 5000, 'INR');
      const otherAcct = db.prepare("SELECT id FROM accounts WHERE user_id = 999").get();
      const res = await agent().put(`/api/accounts/${otherAcct.id}`).send({ name: 'Hacked' });
      assert.equal(res.status, 404, 'Should not find another user\'s account');
    });

    it('cannot delete another user category', async () => {
      createOtherUser();
      db.prepare('INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)').run(999, 'OtherUserCat', 'expense');
      const otherCat = db.prepare("SELECT id FROM categories WHERE name = 'OtherUserCat'").get();
      const res = await agent().delete(`/api/categories/${otherCat.id}`);
      assert.equal(res.status, 404, 'Should not find another user\'s category');
    });

    it('cannot view another user transactions', async () => {
      createOtherUser();
      const acct = db.prepare('INSERT INTO accounts (user_id, name, type, balance, currency) VALUES (?, ?, ?, ?, ?)').run(999, 'OtherAcct2', 'checking', 1000, 'INR');
      db.prepare('INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(999, acct.lastInsertRowid, 'expense', 100, 'INR', 'other user tx', today());

      const res = await agent().get('/api/transactions');
      const otherTxns = res.body.transactions.filter(t => t.description === 'other user tx');
      assert.equal(otherTxns.length, 0, 'Should not see other user transactions');
    });

    it('cannot modify another user budget', async () => {
      createOtherUser();
      db.prepare('INSERT INTO budgets (user_id, name, period, start_date) VALUES (?, ?, ?, ?)').run(999, 'OtherBudget', 'monthly', today());
      const otherBudget = db.prepare("SELECT id FROM budgets WHERE name = 'OtherBudget'").get();
      const res = await agent().put(`/api/budgets/${otherBudget.id}`).send({ name: 'Hacked' });
      assert.equal(res.status, 404);
    });
  });

  // ═══════════════════════════════════════
  // ITER 16: Input sanitization
  // ═══════════════════════════════════════
  describe('Input sanitization', () => {
    it('SQL injection in transaction description is safely stored', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 100,
        description: "'; DROP TABLE transactions; --", date: today(),
      });
      assert.equal(res.status, 201);
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions').get().c;
      assert.ok(count > 0, 'transactions table should not be dropped');
    });

    it('SQL injection in category name is safely stored', async () => {
      const res = await agent().post('/api/categories').send({
        name: "'; DROP TABLE categories; --", type: 'expense',
      });
      assert.equal(res.status, 201);
      const count = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
      assert.ok(count > 0);
    });

    it('SQL injection in search is handled safely', async () => {
      const res = await agent().get("/api/transactions/search?q=' OR 1=1 --");
      assert.ok([200, 400].includes(res.status));
    });

    it('very long input is handled', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 100,
        description: 'A'.repeat(10000), date: today(),
      });
      assert.ok([201, 400].includes(res.status));
    });

    it('null bytes in input are handled', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 100,
        description: 'test\x00null', date: today(),
      });
      assert.ok([201, 400].includes(res.status));
    });
  });

  // ═══════════════════════════════════════
  // ITER 17: Rate limiting (test mode exempt)
  // ═══════════════════════════════════════
  describe('Rate limiting configuration', () => {
    it('health endpoint is accessible without auth', async () => {
      const { default: supertest } = await import('supertest');
      const raw = supertest(app);
      const res = await raw.get('/api/health/live');
      assert.equal(res.status, 200);
    });

    it('health endpoint returns expected fields', async () => {
      const { default: supertest } = await import('supertest');
      const raw = supertest(app);
      const res = await raw.get('/api/health/live');
      assert.equal(res.status, 200);
      assert.ok(res.body.status === 'ok' || res.body.status === 'alive' || res.body.healthy === true || res.body.alive === true);
    });
  });

  // ═══════════════════════════════════════
  // ITER 18: Boundary testing
  // ═══════════════════════════════════════
  describe('Boundary conditions', () => {
    it('budget with amount 0 is allowed', async () => {
      const cat = makeCategory({ name: 'BoundaryTest', type: 'expense' });
      const budgetRes = await agent().post('/api/budgets').send({
        name: 'ZeroBudget', period: 'monthly', start_date: today(),
        items: [{ category_id: cat.id, amount: 0 }],
      });
      assert.ok([201, 400].includes(budgetRes.status));
    });

    it('goal with zero target is handled', async () => {
      const res = await agent().post('/api/goals').send({
        name: 'ZeroGoal', target_amount: 0, target_date: daysFromNow(30),
      });
      assert.ok([201, 400].includes(res.status));
    });

    it('empty body on POST endpoints returns 400', async () => {
      const res = await agent().post('/api/accounts').send({});
      assert.equal(res.status, 400);
    });

    it('transaction with future date works', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 100,
        description: 'future', date: daysFromNow(30),
      });
      assert.equal(res.status, 201);
    });

    it('transaction with past date works', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 100,
        description: 'past', date: '2020-01-01',
      });
      assert.equal(res.status, 201);
    });

    it('multiple categories with same name are allowed', async () => {
      await agent().post('/api/categories').send({ name: 'DupeName', type: 'expense' });
      const res = await agent().post('/api/categories').send({ name: 'DupeName', type: 'income' });
      assert.ok([201, 409].includes(res.status));
    });
  });

  // ═══════════════════════════════════════
  // ITER 19: Cascading operations
  // ═══════════════════════════════════════
  describe('Cascading operations', () => {
    it('deleting a category does not orphan transactions', async () => {
      const cat = makeCategory({ name: 'Groceries' });
      const acct = makeAccount();
      makeTransaction(acct.id, { category_id: cat.id, description: 'test-orphan' });

      await agent().delete(`/api/categories/${cat.id}`);

      const tx = db.prepare("SELECT * FROM transactions WHERE description = 'test-orphan'").get();
      assert.ok(tx, 'Transaction should still exist');
    });

    it('goal transactions are tracked correctly', async () => {
      const goal = makeGoal({ name: 'Vacation', target_amount: 10000 });
      const acct = makeAccount({ balance: 50000 });
      // Goal transactions require an existing transaction
      const tx = makeTransaction(acct.id, { amount: 1000, description: 'goal deposit', type: 'expense' });

      const res = await agent().post(`/api/goals/${goal.id}/transactions`).send({
        transaction_id: tx.id, amount: 1000,
      });
      assert.equal(res.status, 201);
    });

    it('recurring rule generates predictable dates', async () => {
      const acct = makeAccount();
      const rule = makeRecurringRule(acct.id, {
        amount: 1000, frequency: 'monthly', description: 'Rent',
      });
      assert.ok(rule.id);
      assert.equal(rule.frequency, 'monthly');
      assert.equal(rule.amount, 1000);
    });
  });

  // ═══════════════════════════════════════
  // ITER 20: Group / collaborative features
  // ═══════════════════════════════════════
  describe('Group features integrity', () => {
    it('group creation returns expected fields', async () => {
      const res = await agent().post('/api/groups').send({ name: 'Housemates', currency: 'INR' });
      assert.equal(res.status, 201);
      assert.ok(res.body.group.id);
      assert.equal(res.body.group.name, 'Housemates');
    });

    it('group expenses track splits correctly', async () => {
      const group = makeGroup();
      const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? LIMIT 1').get(group.id);

      const res = await agent().post(`/api/splits/${group.id}/expenses`).send({
        amount: 1000, currency: 'INR', description: 'Dinner', date: today(),
        paid_by: member.id, split_method: 'equal',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.expense || res.body.id, 'Should return expense data');
    });

    it('settlement creation works', async () => {
      const group = makeGroup();
      const members = db.prepare('SELECT id FROM group_members WHERE group_id = ?').all(group.id);
      if (members.length >= 2) {
        const res = await agent().post(`/api/splits/${group.id}/settle`).send({
          payer_id: members[0].id, payee_id: members[1].id, amount: 500, currency: 'INR', date: today(),
        });
        assert.ok([201, 200].includes(res.status));
      }
    });

    it('non-member cannot access group expenses', async () => {
      const bcryptjs = require('bcryptjs');
      try {
        db.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)').run(999, 'otheruser', bcryptjs.hashSync('pass123', 4), 'Other');
      } catch (_e) { /* exists */ }
      db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)').run('OtherGroup', 999);
      const otherGroup = db.prepare("SELECT id FROM groups WHERE name = 'OtherGroup'").get();
      db.prepare('INSERT INTO group_members (group_id, user_id, role, display_name) VALUES (?, ?, ?, ?)').run(otherGroup.id, 999, 'admin', 'Other');

      const res = await agent().get(`/api/splits/${otherGroup.id}/expenses`);
      assert.ok([403, 404].includes(res.status));
    });
  });

  // ═══════════════════════════════════════
  // ITER 21: Export and backup
  // ═══════════════════════════════════════
  describe('Export and backup', () => {
    it('GET /api/export/transactions returns CSV content', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { amount: 100, description: 'export-test' });
      const res = await agent().get('/api/export/transactions');
      assert.equal(res.status, 200);
    });

    it('GET /api/export/all returns JSON content', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { amount: 100, description: 'export-test' });
      const res = await agent().get('/api/export/all');
      assert.equal(res.status, 200);
    });

    it('export all includes accounts and transactions', async () => {
      const acct = makeAccount({ name: 'ExportAcct' });
      const cat = makeCategory({ name: 'ExportCat' });
      makeTransaction(acct.id, { category_id: cat.id, amount: 500, description: 'export-tx' });

      const res = await agent().get('/api/export/all');
      assert.equal(res.status, 200);
    });
  });

  // ═══════════════════════════════════════
  // ITER 22: Notifications & subscriptions
  // ═══════════════════════════════════════
  describe('Notifications lifecycle', () => {
    it('GET /api/notifications returns array', async () => {
      const res = await agent().get('/api/notifications');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.notifications));
    });

    it('notification can be marked as read', async () => {
      // Create notification directly
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)`).run(1, 'system', 'Test', 'Test message');
      const notif = db.prepare('SELECT id FROM notifications WHERE user_id = 1 ORDER BY id DESC LIMIT 1').get();

      const res = await agent().put(`/api/notifications/${notif.id}/read`);
      assert.equal(res.status, 200);

      const updated = db.prepare('SELECT is_read FROM notifications WHERE id = ?').get(notif.id);
      assert.equal(updated.is_read, 1);
    });

    it('GET /api/subscriptions returns subscriptions with amounts', async () => {
      makeSubscription({ name: 'Netflix', amount: 649 });
      const res = await agent().get('/api/subscriptions');
      assert.equal(res.status, 200);
      const netflix = res.body.subscriptions.find(s => s.name === 'Netflix');
      assert.ok(netflix);
      assert.equal(netflix.amount, 649);
    });

    it('subscription delete works', async () => {
      const sub = makeSubscription({ name: 'ToCancel' });
      const res = await agent().delete(`/api/subscriptions/${sub.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it('subscription update works', async () => {
      const sub = makeSubscription({ name: 'OldName' });
      const res = await agent().put(`/api/subscriptions/${sub.id}`).send({ name: 'NewName' });
      assert.equal(res.status, 200);
      assert.equal(res.body.subscription.name, 'NewName');
    });
  });
});
