const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OTPAuth = require('otpauth');
const { setup, agent, cleanDb } = require('./helpers');

describe('TOTP 2FA & Admin Password Reset', () => {
  let db, app;

  before(() => {
    const ctx = setup();
    db = ctx.db;
    app = ctx.app;
  });

  // Helper: create a second (non-admin) user and return token
  function createUser(username = 'user2', password = 'Test1234!') {
    const hash = bcrypt.hashSync(password, 4);
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    let userId;
    if (existing) {
      userId = existing.id;
      db.prepare('UPDATE users SET password_hash = ?, totp_enabled = 0, totp_secret = NULL, role = ? WHERE id = ?').run(hash, 'user', userId);
    } else {
      const r = db.prepare(
        'INSERT INTO users (username, password_hash, display_name, default_currency, role) VALUES (?, ?, ?, ?, ?)'
      ).run(username, hash, username, 'INR', 'user');
      userId = r.lastInsertRowid;
    }
    // Create session
    const token = 'test-session-' + crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, tokenHash, expiresAt);
    return { userId, token };
  }

  // Helper: generate a valid TOTP code from a secret
  function generateTOTP(secret) {
    const totp = new OTPAuth.TOTP({
      issuer: 'PersonalFi',
      label: 'test',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    return totp.generate();
  }

  // ─── Admin Password Reset ───

  describe('Admin Password Reset', () => {
    it('admin can reset a user password', async () => {
      const { userId } = createUser('resetme', 'OldPass1!');
      const res = await agent()
        .post(`/api/admin/users/${userId}/reset-password`)
        .send({ newPassword: 'NewPass99!' });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      // Verify new password works
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
      assert.ok(bcrypt.compareSync('NewPass99!', user.password_hash));
    });

    it('admin reset password invalidates user sessions', async () => {
      const { userId, token } = createUser('sessionkill', 'OldPass1!');
      await agent()
        .post(`/api/admin/users/${userId}/reset-password`)
        .send({ newPassword: 'NewPass99!' });
      // Old session should be gone
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const session = db.prepare('SELECT id FROM sessions WHERE token = ?').get(tokenHash);
      assert.equal(session, undefined);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await agent()
        .post('/api/admin/users/99999/reset-password')
        .send({ newPassword: 'NewPass99!' });
      assert.equal(res.status, 404);
    });

    it('returns 400 for missing or short password', async () => {
      const { userId } = createUser('shortpw', 'OldPass1!');
      const res = await agent()
        .post(`/api/admin/users/${userId}/reset-password`)
        .send({ newPassword: 'short' });
      assert.equal(res.status, 400);
    });

    it('non-admin cannot reset passwords (403)', async () => {
      const { token: nonAdminToken } = createUser('nonadmin', 'Test1234!');
      const { userId: targetId } = createUser('target', 'Test1234!');
      const res = await agent()
        .post(`/api/admin/users/${targetId}/reset-password`)
        .set('x-session-token', nonAdminToken)
        .send({ newPassword: 'NewPass99!' });
      assert.equal(res.status, 403);
    });

    it('unauthenticated user cannot reset passwords (401)', async () => {
      const { userId } = createUser('unauth-target', 'Test1234!');
      const request = require('supertest');
      const res = await request(app)
        .post(`/api/admin/users/${userId}/reset-password`)
        .set('content-type', 'application/json')
        .send({ newPassword: 'NewPass99!' });
      assert.equal(res.status, 401);
    });
  });

  // ─── TOTP 2FA ───

  describe('TOTP Setup', () => {
    it('returns secret and URI', async () => {
      const { token } = createUser('totp-setup', 'Test1234!');
      const res = await agent()
        .post('/api/auth/totp/setup')
        .set('x-session-token', token)
        .send({});
      assert.equal(res.status, 200);
      assert.ok(res.body.secret);
      assert.ok(res.body.uri);
      assert.ok(res.body.uri.startsWith('otpauth://totp/'));
    });

    it('cannot setup when already enabled', async () => {
      const { userId, token } = createUser('totp-already', 'Test1234!');
      // Enable TOTP directly
      db.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?')
        .run('JBSWY3DPEHPK3PXP', userId);
      const res = await agent()
        .post('/api/auth/totp/setup')
        .set('x-session-token', token)
        .send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('already enabled'));
    });

    it('requires authentication', async () => {
      const request = require('supertest');
      const res = await request(app)
        .post('/api/auth/totp/setup')
        .set('content-type', 'application/json')
        .send({});
      assert.equal(res.status, 401);
    });
  });

  describe('TOTP Verify', () => {
    it('valid code enables 2FA', async () => {
      const { userId, token } = createUser('totp-verify', 'Test1234!');
      // Setup first
      const setupRes = await agent()
        .post('/api/auth/totp/setup')
        .set('x-session-token', token)
        .send({});
      const secret = setupRes.body.secret;
      const code = generateTOTP(secret);
      const res = await agent()
        .post('/api/auth/totp/verify')
        .set('x-session-token', token)
        .send({ code });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      // Confirm enabled in DB
      const user = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(userId);
      assert.equal(user.totp_enabled, 1);
    });

    it('invalid code fails', async () => {
      const { token } = createUser('totp-badcode', 'Test1234!');
      await agent()
        .post('/api/auth/totp/setup')
        .set('x-session-token', token)
        .send({});
      const res = await agent()
        .post('/api/auth/totp/verify')
        .set('x-session-token', token)
        .send({ code: '000000' });
      assert.equal(res.status, 400);
    });

    it('fails without setup', async () => {
      const { token } = createUser('totp-noseup', 'Test1234!');
      const res = await agent()
        .post('/api/auth/totp/verify')
        .set('x-session-token', token)
        .send({ code: '123456' });
      assert.equal(res.status, 400);
    });

    it('fails without code', async () => {
      const { token } = createUser('totp-nocode', 'Test1234!');
      await agent()
        .post('/api/auth/totp/setup')
        .set('x-session-token', token)
        .send({});
      const res = await agent()
        .post('/api/auth/totp/verify')
        .set('x-session-token', token)
        .send({});
      assert.equal(res.status, 400);
    });
  });

  describe('Login with 2FA', () => {
    it('requires totp_code when 2FA enabled', async () => {
      const password = 'Test1234!';
      const { userId } = createUser('totp-login', password);
      // Enable TOTP
      const secret = new OTPAuth.Secret({ size: 20 });
      db.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?')
        .run(secret.base32, userId);

      const request = require('supertest');
      const res = await request(app)
        .post('/api/auth/login')
        .set('content-type', 'application/json')
        .send({ username: 'totp-login', password });
      assert.equal(res.status, 403);
      assert.equal(res.body.requires_2fa, true);
    });

    it('login with valid totp_code succeeds', async () => {
      const password = 'Test1234!';
      const { userId } = createUser('totp-login-ok', password);
      const secret = new OTPAuth.Secret({ size: 20 });
      db.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?')
        .run(secret.base32, userId);

      const code = generateTOTP(secret.base32);
      const request = require('supertest');
      const res = await request(app)
        .post('/api/auth/login')
        .set('content-type', 'application/json')
        .send({ username: 'totp-login-ok', password, totp_code: code });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
    });

    it('login with invalid totp_code fails', async () => {
      const password = 'Test1234!';
      const { userId } = createUser('totp-login-bad', password);
      const secret = new OTPAuth.Secret({ size: 20 });
      db.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?')
        .run(secret.base32, userId);

      const request = require('supertest');
      const res = await request(app)
        .post('/api/auth/login')
        .set('content-type', 'application/json')
        .send({ username: 'totp-login-bad', password, totp_code: '000000' });
      assert.equal(res.status, 401);
    });

    it('login without 2FA enabled works normally', async () => {
      const password = 'Test1234!';
      createUser('normal-login', password);
      const request = require('supertest');
      const res = await request(app)
        .post('/api/auth/login')
        .set('content-type', 'application/json')
        .send({ username: 'normal-login', password });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
    });
  });

  describe('TOTP Disable', () => {
    it('disable with correct password works', async () => {
      const password = 'Test1234!';
      const { userId, token } = createUser('totp-disable', password);
      db.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?')
        .run('JBSWY3DPEHPK3PXP', userId);
      const res = await agent()
        .post('/api/auth/totp/disable')
        .set('x-session-token', token)
        .send({ password });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      const user = db.prepare('SELECT totp_enabled, totp_secret FROM users WHERE id = ?').get(userId);
      assert.equal(user.totp_enabled, 0);
      assert.equal(user.totp_secret, null);
    });

    it('disable without password fails', async () => {
      const { userId, token } = createUser('totp-disable-nopw', 'Test1234!');
      db.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?')
        .run('JBSWY3DPEHPK3PXP', userId);
      const res = await agent()
        .post('/api/auth/totp/disable')
        .set('x-session-token', token)
        .send({});
      assert.equal(res.status, 400);
    });

    it('disable with wrong password fails', async () => {
      const { userId, token } = createUser('totp-disable-badpw', 'Test1234!');
      db.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?')
        .run('JBSWY3DPEHPK3PXP', userId);
      const res = await agent()
        .post('/api/auth/totp/disable')
        .set('x-session-token', token)
        .send({ password: 'WrongPass1!' });
      assert.equal(res.status, 401);
    });
  });
});
