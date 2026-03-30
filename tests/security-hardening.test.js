const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, rawAgent } = require('./helpers');

describe('v0.3.2 Security Hardening', () => {
  let db;

  before(() => {
    const ctx = setup();
    db = ctx.db;
  });

  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Password Complexity ───

  describe('Password complexity', () => {
    it('rejects password without uppercase letter', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ username: 'noupperuser', password: 'password1!' });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /uppercase/i);
    });

    it('rejects password without lowercase letter', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ username: 'noloweruser', password: 'PASSWORD1!' });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /lowercase/i);
    });

    it('rejects password without number', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ username: 'nonumuser', password: 'Password!!' });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /number/i);
    });

    it('rejects password without special character', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ username: 'nospecialuser', password: 'Password11' });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /special/i);
    });

    it('accepts compliant password', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ username: 'goodpwuser', password: 'GoodPass1!' });
      assert.equal(res.status, 201);
      assert.ok(res.body.token);
    });

    it('rejects weak new_password on password change', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'changepwuser', password: 'GoodPass1!' }).expect(201);

      const res = await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', reg.body.token)
        .send({ current_password: 'GoodPass1!', new_password: 'weakpass' });
      assert.equal(res.status, 400);
    });

    it('accepts compliant new_password on password change', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'changepwuser2', password: 'GoodPass1!' }).expect(201);

      const res = await rawAgent().put('/api/auth/password')
        .set('X-Session-Token', reg.body.token)
        .send({ current_password: 'GoodPass1!', new_password: 'NewPass2@' });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
    });
  });

  // ─── Account Lockout ───

  describe('Account lockout', () => {
    it('locks account after 5 failed login attempts', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'lockuser', password: 'GoodPass1!' }).expect(201);

      for (let i = 0; i < 5; i++) {
        await rawAgent().post('/api/auth/login')
          .send({ username: 'lockuser', password: 'wrongpass' }).expect(401);
      }

      const res = await rawAgent().post('/api/auth/login')
        .send({ username: 'lockuser', password: 'GoodPass1!' });
      assert.equal(res.status, 423);
      assert.match(res.body.error.message, /locked/i);
    });

    it('unlocks account after lockout period expires', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'lockuser2', password: 'GoodPass1!' }).expect(201);

      for (let i = 0; i < 5; i++) {
        await rawAgent().post('/api/auth/login')
          .send({ username: 'lockuser2', password: 'wrongpass' }).expect(401);
      }

      await rawAgent().post('/api/auth/login')
        .send({ username: 'lockuser2', password: 'GoodPass1!' }).expect(423);

      // Simulate time passing
      db.prepare("UPDATE users SET locked_until = datetime('now', '-1 minute') WHERE username = 'lockuser2'").run();

      const res = await rawAgent().post('/api/auth/login')
        .send({ username: 'lockuser2', password: 'GoodPass1!' });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
    });

    it('resets failed attempts on successful login', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'resetuser', password: 'GoodPass1!' }).expect(201);

      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await rawAgent().post('/api/auth/login')
          .send({ username: 'resetuser', password: 'wrongpass' }).expect(401);
      }

      // Successful login resets counter
      await rawAgent().post('/api/auth/login')
        .send({ username: 'resetuser', password: 'GoodPass1!' }).expect(200);

      // Need 5 more failures to lock (not 2)
      for (let i = 0; i < 4; i++) {
        await rawAgent().post('/api/auth/login')
          .send({ username: 'resetuser', password: 'wrongpass' }).expect(401);
      }

      // 4 failures since reset — should NOT be locked
      const res = await rawAgent().post('/api/auth/login')
        .send({ username: 'resetuser', password: 'GoodPass1!' });
      assert.equal(res.status, 200);
    });

    it('returns retry-after info in lockout response', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'retryuser', password: 'GoodPass1!' }).expect(201);

      for (let i = 0; i < 5; i++) {
        await rawAgent().post('/api/auth/login')
          .send({ username: 'retryuser', password: 'wrongpass' }).expect(401);
      }

      const res = await rawAgent().post('/api/auth/login')
        .send({ username: 'retryuser', password: 'GoodPass1!' });
      assert.equal(res.status, 423);
      assert.equal(res.body.error.code, 'ACCOUNT_LOCKED');
    });
  });

  // ─── Content-Type Validation ───

  describe('Content-Type validation', () => {
    it('rejects non-JSON Content-Type on POST endpoints', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('username=test&password=test');
      assert.equal(res.status, 415);
      assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    it('rejects text/plain Content-Type on PUT endpoints', async () => {
      const res = await rawAgent().put('/api/auth/password')
        .set('Content-Type', 'text/plain')
        .send('some text');
      assert.equal(res.status, 415);
    });

    it('allows POST without body (no Content-Type required)', async () => {
      const res = await rawAgent().post('/api/auth/logout');
      assert.notEqual(res.status, 415);
    });

    it('allows JSON POST requests normally', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .send({ username: 'test', password: 'test' });
      assert.notEqual(res.status, 415);
    });
  });

  // ─── CORS ───

  describe('CORS', () => {
    it('includes Access-Control-Allow-Origin header by default', async () => {
      const res = await rawAgent().get('/api/health')
        .set('Origin', 'http://evil.com');
      // Default CORS_ORIGINS is '*', so all origins are allowed
      assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    it('preflight returns CORS headers', async () => {
      const res = await rawAgent().options('/api/accounts')
        .set('Origin', 'http://evil.com')
        .set('Access-Control-Request-Method', 'POST');
      assert.ok(res.headers['access-control-allow-methods']);
    });
  });

  // ─── Audit Log with IP / User-Agent ───

  describe('Audit log with IP and user-agent', () => {
    it('logs failed login attempt with IP and user-agent', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'audituser', password: 'GoodPass1!' }).expect(201);

      await rawAgent().post('/api/auth/login')
        .set('User-Agent', 'TestBrowser/1.0')
        .send({ username: 'audituser', password: 'wrongpass' })
        .expect(401);

      const log = db.prepare(
        "SELECT * FROM audit_log WHERE action = 'user.login_failed' ORDER BY id DESC LIMIT 1"
      ).get();
      assert.ok(log, 'audit log entry should exist');
      assert.ok(log.ip, 'should have IP address');
      assert.equal(log.user_agent, 'TestBrowser/1.0');
    });

    it('logs successful login with IP and user-agent', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'audituser2', password: 'GoodPass1!' }).expect(201);

      await rawAgent().post('/api/auth/login')
        .set('User-Agent', 'TestBrowser/2.0')
        .send({ username: 'audituser2', password: 'GoodPass1!' })
        .expect(200);

      const log = db.prepare(
        "SELECT * FROM audit_log WHERE action = 'user.login' ORDER BY id DESC LIMIT 1"
      ).get();
      assert.ok(log, 'audit log entry should exist');
      assert.ok(log.ip, 'should have IP address');
      assert.equal(log.user_agent, 'TestBrowser/2.0');
    });
  });
});
