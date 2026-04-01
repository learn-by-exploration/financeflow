// tests/security-hardening-v2.test.js — Extended security hardening validation
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, rawAgent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

describe('Security Hardening v2', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
    // Reset any lockout state
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = 1').run();
  });

  describe('Authentication Enforcement', () => {
    it('critical write endpoints reject unauthenticated requests', async () => {
      const protectedPaths = [
        ['/api/accounts', 'POST'],
        ['/api/transactions', 'POST'],
        ['/api/categories', 'POST'],
        ['/api/budgets', 'POST'],
        ['/api/goals', 'POST'],
        ['/api/tags', 'POST'],
        ['/api/settings', 'PUT'],
        ['/api/data/import', 'POST'],
      ];

      for (const [path, method] of protectedPaths) {
        const res = await rawAgent()[method.toLowerCase()](path).send({});
        assert.equal(res.status, 401, `${method} ${path} should require auth`);
      }
    });

    it('health endpoints are public', async () => {
      const publicPaths = ['/api/health', '/api/health/live', '/api/health/ready'];
      for (const p of publicPaths) {
        const res = await rawAgent().get(p);
        assert.ok([200, 503].includes(res.status), `${p} should be public`);
      }
    });
  });

  describe('SQL Injection Prevention', () => {
    it('account name with SQL injection payload', async () => {
      const res = await agent().post('/api/accounts').send({
        name: "'; DROP TABLE accounts; --",
        type: 'checking', balance: 0
      });
      assert.equal(res.status, 201);
      // Verify accounts table still exists
      const count = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get();
      assert.ok(count.cnt >= 0);
    });

    it('transaction description with SQL injection', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 100, description: "1' OR '1'='1", date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(res.status, 201);
    });

    it('search with SQL injection in query', async () => {
      const res = await agent().get("/api/search?q=' OR 1=1 --");
      assert.ok([200, 400].includes(res.status));
    });
  });

  describe('Authorization', () => {
    it('cannot access other user data', async () => {
      const hash = require('bcryptjs').hashSync('password2', 4);
      const existing = db.prepare("SELECT id FROM users WHERE username = 'otheruser'").get();
      if (!existing) {
        db.prepare("INSERT INTO users (username, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?)")
          .run('otheruser', hash, 'Other', 'INR');
      }
      const otherUser = db.prepare("SELECT id FROM users WHERE username = 'otheruser'").get();
      db.prepare("INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_active, include_in_net_worth, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(otherUser.id, 'Other Account', 'checking', 'INR', 99999, '🏦', '#000', 1, 1, 0);
      const otherAccount = db.prepare("SELECT id FROM accounts WHERE user_id = ?").get(otherUser.id);

      const res = await agent().put(`/api/accounts/${otherAccount.id}`).send({ name: 'Hacked' });
      assert.equal(res.status, 404);
    });

    it('admin routes require admin role', async () => {
      const hash = require('bcryptjs').hashSync('normalpass', 4);
      const existing = db.prepare("SELECT id FROM users WHERE username = 'normaluser'").get();
      if (!existing) {
        db.prepare("INSERT INTO users (username, password_hash, display_name, default_currency, role) VALUES (?, ?, ?, ?, ?)")
          .run('normaluser', hash, 'Normal', 'INR', 'user');
      }
      const normalUser = db.prepare("SELECT id FROM users WHERE username = 'normaluser'").get();
      const crypto = require('crypto');
      const token = 'normal-user-token-' + crypto.randomUUID();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(
        normalUser.id, tokenHash, new Date(Date.now() + 86400000).toISOString()
      );

      const res = await rawAgent().get('/api/admin/backups').set('X-Session-Token', token);
      assert.equal(res.status, 403);
    });
  });

  describe('Input Validation', () => {
    it('rejects extremely long strings', async () => {
      const longName = 'A'.repeat(10000);
      const res = await agent().post('/api/accounts').send({
        name: longName, type: 'checking', balance: 0
      });
      assert.equal(res.status, 400);
    });

    it('handles unicode safely', async () => {
      const res = await agent().post('/api/accounts').send({
        name: '💰 Savings Account 存款', type: 'savings', balance: 1000
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.account.name.includes('💰'));
    });
  });

  describe('Session Security', () => {
    it('logout invalidates session', async () => {
      const loginRes = await rawAgent().post('/api/auth/login').send({
        username: 'testuser', password: 'testpassword'
      });
      assert.equal(loginRes.status, 200);
      const token = loginRes.body.token;

      await rawAgent().post('/api/auth/logout').set('X-Session-Token', token);

      const res = await rawAgent().get('/api/accounts').set('X-Session-Token', token);
      assert.equal(res.status, 401);
    });

    it('token is SHA-256 hashed in database', async () => {
      const loginRes = await rawAgent().post('/api/auth/login').send({
        username: 'testuser', password: 'testpassword'
      });
      const token = loginRes.body.token;

      const rawMatch = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
      assert.equal(rawMatch, undefined);

      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const hashedMatch = db.prepare('SELECT * FROM sessions WHERE token = ?').get(hash);
      assert.ok(hashedMatch);
    });
  });

  describe('Error Response Format', () => {
    it('404 returns structured error for non-existent budget', async () => {
      // Use rawAgent with explicit token to avoid stale session from password change test
      const loginRes = await rawAgent().post('/api/auth/login').send({
        username: 'testuser', password: 'testpassword'
      });
      const token = loginRes.body.token;
      const res = await rawAgent().get('/api/budgets/999999').set('X-Session-Token', token);
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
      assert.ok(res.body.error.code);
    });

    it('errors do not leak stack traces', async () => {
      const loginRes = await rawAgent().post('/api/auth/login').send({
        username: 'testuser', password: 'testpassword'
      });
      const token = loginRes.body.token;
      const res = await rawAgent().get('/api/budgets/999999').set('X-Session-Token', token);
      assert.ok(!res.body.stack);
      if (res.body.error) {
        assert.ok(!res.body.error.stack);
      }
    });
  });

  describe('CORS Security', () => {
    it('no wildcard CORS by default', async () => {
      const res = await rawAgent().get('/api/health');
      assert.notEqual(res.headers['access-control-allow-origin'], '*');
    });
  });

  describe('Account Lockout', () => {
    it('locks account after failed login attempts', async () => {
      // Make many failed login attempts
      for (let i = 0; i < 5; i++) {
        await rawAgent().post('/api/auth/login').send({
          username: 'testuser', password: 'wrong_password'
        });
      }

      // Next attempt should be locked
      const res = await rawAgent().post('/api/auth/login').send({
        username: 'testuser', password: 'testpassword'
      });
      assert.equal(res.status, 423);

      // Reset lockout for other tests
      db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE username = ?').run('testuser');
    });
  });

  describe('Audit Trail', () => {
    it('account creation is audited', async () => {
      const loginRes = await rawAgent().post('/api/auth/login').send({
        username: 'testuser', password: 'testpassword'
      });
      const token = loginRes.body.token;
      const before = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt;
      await rawAgent().post('/api/accounts').set('X-Session-Token', token).send({
        name: 'Audited Account', type: 'checking', balance: 0
      });
      const after = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt;
      assert.ok(after > before, 'Audit log should have new entries');
    });

    it('transaction creation is audited', async () => {
      const loginRes = await rawAgent().post('/api/auth/login').send({
        username: 'testuser', password: 'testpassword'
      });
      const token = loginRes.body.token;
      const acct = makeAccount();
      const cat = makeCategory();
      const before = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt;
      await rawAgent().post('/api/transactions').set('X-Session-Token', token).send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Audit test', date: new Date().toISOString().slice(0, 10)
      });
      const after = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt;
      assert.ok(after > before, 'Audit log should record transaction creation');
    });
  });
});
