const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup, cleanDb, teardown, agent, rawAgent, makeAccount, makeCategory } = require('./helpers');

describe('Phase 11 — Security Hardening', () => {
  let app, db;

  before(() => {
    ({ app, db } = setup());
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── 11.1 Active Sessions Management ───

  describe('GET /api/auth/sessions', () => {
    it('lists active sessions for current user', async () => {
      const res = await agent().get('/api/auth/sessions');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.sessions));
      assert.ok(res.body.sessions.length >= 1);
      const s = res.body.sessions[0];
      assert.ok('id' in s);
      assert.ok('created_at' in s);
      assert.ok('is_current' in s);
    });

    it('marks current session with is_current: true', async () => {
      const res = await agent().get('/api/auth/sessions');
      assert.equal(res.status, 200);
      const current = res.body.sessions.filter(s => s.is_current);
      assert.equal(current.length, 1);
    });
  });

  describe('DELETE /api/auth/sessions/:id', () => {
    it('revokes a specific session', async () => {
      // Create an extra session for user 1
      const extraToken = 'extra-session-' + crypto.randomUUID();
      const extraHash = crypto.createHash('sha256').update(extraToken).digest('hex');
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(1, extraHash, expiresAt);

      // Find the extra session id
      const listRes = await agent().get('/api/auth/sessions');
      const otherSession = listRes.body.sessions.find(s => !s.is_current);
      assert.ok(otherSession, 'should have an extra session');

      const res = await agent().delete(`/api/auth/sessions/${otherSession.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it('cannot revoke current session (returns 400)', async () => {
      const listRes = await agent().get('/api/auth/sessions');
      const currentSession = listRes.body.sessions.find(s => s.is_current);
      assert.ok(currentSession);

      const res = await agent().delete(`/api/auth/sessions/${currentSession.id}`);
      assert.equal(res.status, 400);
    });

    it('revoked session is no longer valid for auth', async () => {
      // Create extra session
      const extraToken = 'extra-revoke-' + crypto.randomUUID();
      const extraHash = crypto.createHash('sha256').update(extraToken).digest('hex');
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(1, extraHash, expiresAt);

      // Find and revoke it
      const listRes = await agent().get('/api/auth/sessions');
      const otherSession = listRes.body.sessions.find(s => !s.is_current);
      assert.ok(otherSession);

      await agent().delete(`/api/auth/sessions/${otherSession.id}`);

      // Try to use the revoked token
      const meRes = await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', extraToken);
      assert.equal(meRes.status, 401);
    });
  });

  // ─── 11.2 Security Checkup Widget ───

  describe('GET /api/auth/security-status', () => {
    it('returns security info', async () => {
      const res = await agent().get('/api/auth/security-status');
      assert.equal(res.status, 200);
      assert.ok(res.body.security);
      assert.ok('has_2fa' in res.body.security);
      assert.ok('session_count' in res.body.security);
      assert.ok('last_password_change' in res.body.security);
    });

    it('session_count reflects actual session count', async () => {
      // Add an extra session
      const token = 'count-session-' + crypto.randomUUID();
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(1, hash, expiresAt);

      const res = await agent().get('/api/auth/security-status');
      assert.equal(res.status, 200);
      assert.ok(res.body.security.session_count >= 2);
    });

    it('has_2fa is false when no TOTP configured', async () => {
      // Ensure TOTP is not enabled for test user
      db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = 1').run();

      const res = await agent().get('/api/auth/security-status');
      assert.equal(res.status, 200);
      assert.equal(res.body.security.has_2fa, false);
    });
  });

  // ─── 11.3 Auto-Backup Before Destructive Import ───

  describe('POST /api/data/import — safety confirmation', () => {
    it('import without confirm field returns 400', async () => {
      const res = await agent().post('/api/data/import')
        .send({ password: 'testpassword', data: { accounts: [] } });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.toLowerCase().includes('confirm'));
    });

    it('import with wrong confirm text returns 400', async () => {
      const res = await agent().post('/api/data/import')
        .send({ password: 'testpassword', data: { accounts: [] }, confirm: 'yes' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.toLowerCase().includes('delete all data'));
    });

    it('import with "DELETE ALL DATA" confirmation proceeds', async () => {
      // Seed some data so import has something to replace
      makeAccount();
      makeCategory();

      const res = await agent().post('/api/data/import')
        .send({
          password: 'testpassword',
          confirm: 'DELETE ALL DATA',
          data: {
            accounts: [{ id: 999, name: 'Imported Acct', type: 'checking', currency: 'INR', balance: 1000 }],
            categories: [{ id: 999, name: 'Imported Cat', type: 'expense' }],
          },
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      // Verify backup was created
      assert.ok(res.body.backup, 'response should include backup snapshot');
      assert.ok(res.body.backup.accounts, 'backup should have accounts');
    });
  });
});
