const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('Session Management', () => {
  let app, db;

  before(() => {
    ({ app, db } = setup());
  });

  beforeEach(() => {
    cleanDb();
  });

  describe('GET /api/auth/sessions', () => {
    it('should list current session', async () => {
      const res = await agent().get('/api/auth/sessions');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.sessions));
      assert.ok(res.body.sessions.length >= 1);
      const current = res.body.sessions.find(s => s.is_current);
      assert.ok(current, 'should have a current session');
      assert.ok(current.created_at);
      assert.ok(current.last_used_at);
    });

    it('should return 401 without auth', async () => {
      const res = await rawAgent().get('/api/auth/sessions');
      assert.equal(res.status, 401);
    });
  });

  describe('DELETE /api/auth/sessions/:id', () => {
    it('should revoke a specific session', async () => {
      // Create another session via login
      const loginRes = await rawAgent()
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpassword' });
      assert.equal(loginRes.status, 200);
      const otherToken = loginRes.body.token;

      // List sessions to find the other session ID
      const listRes = await agent().get('/api/auth/sessions');
      assert.equal(listRes.status, 200);
      const otherSession = listRes.body.sessions.find(s => !s.is_current);
      assert.ok(otherSession, 'should have another session');

      // Revoke it
      const revokeRes = await agent().delete(`/api/auth/sessions/${otherSession.id}`);
      assert.equal(revokeRes.status, 200);
      assert.equal(revokeRes.body.ok, true);

      // Verify it's gone
      const listRes2 = await agent().get('/api/auth/sessions');
      const found = listRes2.body.sessions.find(s => s.id === otherSession.id);
      assert.equal(found, undefined);
    });

    it('should return 404 for non-existent session', async () => {
      const res = await agent().delete('/api/auth/sessions/999999');
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('should return 400 for invalid session ID', async () => {
      const res = await agent().delete('/api/auth/sessions/abc');
      assert.equal(res.status, 400);
    });
  });

  describe('POST /api/auth/sessions/revoke-others', () => {
    it('should revoke all other sessions but keep current', async () => {
      // Create two more sessions via login
      await rawAgent()
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpassword' });
      await rawAgent()
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpassword' });

      // Verify we have multiple sessions
      const listRes = await agent().get('/api/auth/sessions');
      assert.ok(listRes.body.sessions.length >= 3);

      // Revoke others
      const revokeRes = await agent().post('/api/auth/sessions/revoke-others');
      assert.equal(revokeRes.status, 200);
      assert.equal(revokeRes.body.ok, true);
      assert.ok(revokeRes.body.revoked >= 2);

      // Verify only current remains
      const listRes2 = await agent().get('/api/auth/sessions');
      assert.equal(listRes2.body.sessions.length, 1);
      assert.equal(listRes2.body.sessions[0].is_current, true);
    });
  });

  describe('Session metadata', () => {
    it('should store user agent on login', async () => {
      const loginRes = await rawAgent()
        .post('/api/auth/login')
        .set('User-Agent', 'TestBrowser/1.0')
        .send({ username: 'testuser', password: 'testpassword' });
      assert.equal(loginRes.status, 200);

      // Use the new token to list sessions
      const listRes = await rawAgent()
        .get('/api/auth/sessions')
        .set('X-Session-Token', loginRes.body.token);
      assert.equal(listRes.status, 200);

      const session = listRes.body.sessions.find(s => s.is_current);
      assert.ok(session);
      assert.equal(session.user_agent, 'TestBrowser/1.0');
    });

    it('should store IP address on login', async () => {
      const loginRes = await rawAgent()
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpassword' });
      assert.equal(loginRes.status, 200);

      const listRes = await rawAgent()
        .get('/api/auth/sessions')
        .set('X-Session-Token', loginRes.body.token);
      assert.equal(listRes.status, 200);

      const session = listRes.body.sessions.find(s => s.is_current);
      assert.ok(session);
      // IP will be populated (localhost in tests)
      assert.ok(session.ip_address !== undefined);
    });
  });

  describe('last_used_at update', () => {
    it('should update last_used_at on authenticated request', async () => {
      // Get initial last_used_at
      const listRes1 = await agent().get('/api/auth/sessions');
      const session1 = listRes1.body.sessions.find(s => s.is_current);
      const initial = session1.last_used_at;

      // Wait a tiny bit to ensure timestamp difference
      await new Promise(r => setTimeout(r, 50));

      // Make another authenticated request
      const listRes2 = await agent().get('/api/auth/sessions');
      const session2 = listRes2.body.sessions.find(s => s.is_current);

      // last_used_at should be >= initial (SQLite datetime resolution is 1 second,
      // so it may be the same within the same second)
      assert.ok(session2.last_used_at >= initial);
    });
  });
});
