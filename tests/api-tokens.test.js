const { describe, it, before, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('API Tokens', () => {
  before(() => setup());
  afterEach(() => cleanDb());
  after(() => teardown());

  describe('POST /api/tokens', () => {
    it('creates a token and returns raw token once', async () => {
      const res = await agent()
        .post('/api/tokens')
        .send({ name: 'My CLI Token' });
      assert.equal(res.status, 201);
      assert.ok(res.body.token);
      assert.ok(res.body.token.raw_token, 'raw_token should be present on create');
      assert.ok(res.body.token.raw_token.startsWith('pfi_'), 'token should have pfi_ prefix');
      assert.equal(res.body.token.raw_token.length, 68, 'pfi_ + 64 hex chars');
      assert.equal(res.body.token.name, 'My CLI Token');
      assert.equal(res.body.token.scope, 'readwrite');
      assert.ok(res.body.token.id);
      assert.ok(res.body.token.created_at);
    });

    it('creates a read-only token', async () => {
      const res = await agent()
        .post('/api/tokens')
        .send({ name: 'Read Only', scope: 'read' });
      assert.equal(res.status, 201);
      assert.equal(res.body.token.scope, 'read');
    });

    it('rejects missing name', async () => {
      const res = await agent()
        .post('/api/tokens')
        .send({});
      assert.equal(res.status, 400);
    });

    it('rejects invalid scope', async () => {
      const res = await agent()
        .post('/api/tokens')
        .send({ name: 'Bad', scope: 'admin' });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/tokens', () => {
    it('lists tokens without raw token', async () => {
      // Create two tokens
      await agent().post('/api/tokens').send({ name: 'Token A' });
      await agent().post('/api/tokens').send({ name: 'Token B' });

      const res = await agent().get('/api/tokens');
      assert.equal(res.status, 200);
      assert.equal(res.body.tokens.length, 2);
      for (const t of res.body.tokens) {
        assert.equal(t.raw_token, undefined, 'raw_token must not be in list');
        assert.equal(t.token_hash, undefined, 'token_hash must not be in list');
        assert.ok(t.name);
        assert.ok(t.scope);
      }
    });
  });

  describe('DELETE /api/tokens/:id', () => {
    it('revokes a token', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'Temp' });
      const tokenId = createRes.body.token.id;

      const delRes = await agent().delete(`/api/tokens/${tokenId}`);
      assert.equal(delRes.status, 200);
      assert.deepEqual(delRes.body, { ok: true });

      // Verify it's gone
      const listRes = await agent().get('/api/tokens');
      assert.equal(listRes.body.tokens.length, 0);
    });

    it('returns 404 for non-existent token', async () => {
      const res = await agent().delete('/api/tokens/99999');
      assert.equal(res.status, 404);
    });
  });

  describe('Bearer token authentication', () => {
    it('authenticates via Authorization: Bearer header', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'Bearer Test' });
      const rawToken = createRes.body.token.raw_token;

      const res = await rawAgent()
        .get('/api/accounts')
        .set('Authorization', `Bearer ${rawToken}`);
      assert.equal(res.status, 200);
    });

    it('returns 401 for invalid token', async () => {
      const res = await rawAgent()
        .get('/api/accounts')
        .set('Authorization', 'Bearer pfi_' + 'a'.repeat(64));
      assert.equal(res.status, 401);
    });

    it('returns 401 for no auth at all', async () => {
      const res = await rawAgent().get('/api/accounts');
      assert.equal(res.status, 401);
    });

    it('works even with expired session (API token still valid)', async () => {
      const { db } = setup();
      const createRes = await agent().post('/api/tokens').send({ name: 'Persistent' });
      const rawToken = createRes.body.token.raw_token;

      // Expire all sessions
      db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day')").run();

      const res = await rawAgent()
        .get('/api/accounts')
        .set('Authorization', `Bearer ${rawToken}`);
      assert.equal(res.status, 200);

      // Restore sessions for other tests
      db.prepare("UPDATE sessions SET expires_at = datetime('now', '+1 day')").run();
    });

    it('revoked token returns 401', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'To Revoke' });
      const rawToken = createRes.body.token.raw_token;
      const tokenId = createRes.body.token.id;

      // Revoke
      await agent().delete(`/api/tokens/${tokenId}`);

      const res = await rawAgent()
        .get('/api/accounts')
        .set('Authorization', `Bearer ${rawToken}`);
      assert.equal(res.status, 401);
    });
  });

  describe('Token scopes', () => {
    it('read-only token can GET', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'Reader', scope: 'read' });
      const rawToken = createRes.body.token.raw_token;

      const res = await rawAgent()
        .get('/api/accounts')
        .set('Authorization', `Bearer ${rawToken}`);
      assert.equal(res.status, 200);
    });

    it('read-only token cannot POST to protected routes', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'Reader', scope: 'read' });
      const rawToken = createRes.body.token.raw_token;

      const res = await rawAgent()
        .post('/api/accounts')
        .set('Authorization', `Bearer ${rawToken}`)
        .send({ name: 'Blocked Account', type: 'checking', currency: 'INR' });
      assert.equal(res.status, 403);
    });

    it('read-only token can still manage its own tokens (POST /api/tokens)', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'Reader', scope: 'read' });
      const rawToken = createRes.body.token.raw_token;

      // Should be allowed to list tokens via the Bearer token
      const listRes = await rawAgent()
        .get('/api/tokens')
        .set('Authorization', `Bearer ${rawToken}`);
      assert.equal(listRes.status, 200);
    });

    it('readwrite token can POST', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'Writer', scope: 'readwrite' });
      const rawToken = createRes.body.token.raw_token;

      const res = await rawAgent()
        .post('/api/accounts')
        .set('Authorization', `Bearer ${rawToken}`)
        .send({ name: 'API Account', type: 'checking', currency: 'INR' });
      assert.equal(res.status, 201);
    });
  });

  describe('last_used_at tracking', () => {
    it('updates last_used_at on use', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'Tracker' });
      const rawToken = createRes.body.token.raw_token;
      const tokenId = createRes.body.token.id;

      // Initially null
      assert.equal(createRes.body.token.last_used_at, null);

      // Use the token
      await rawAgent()
        .get('/api/accounts')
        .set('Authorization', `Bearer ${rawToken}`);

      // Check last_used_at is set
      const listRes = await agent().get('/api/tokens');
      const updated = listRes.body.tokens.find(t => t.id === tokenId);
      assert.ok(updated.last_used_at, 'last_used_at should be set after use');
    });
  });
});
