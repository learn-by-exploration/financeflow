const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup, teardown, cleanDb, agent, rawAgent } = require('./helpers');

describe('Token Security (v0.3.27)', () => {
  let app, db;

  before(() => {
    ({ app, db } = setup());
  });

  beforeEach(() => {
    cleanDb();
  });

  after(() => {
    teardown();
  });

  // ─── Session Token Hashing ───

  describe('Session token hashing', () => {
    it('should authenticate with hashed session token storage', async () => {
      const res = await agent().get('/api/accounts');
      assert.equal(res.status, 200);
    });

    it('should reject a plain (unhashed) token inserted directly into DB', async () => {
      const plainToken = 'plain-token-' + crypto.randomUUID();
      // Insert WITHOUT hashing — simulates old-style storage
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(1, plainToken, expiresAt);

      // Try to use this plain token — middleware will hash it, won't match the plain value in DB
      const res = await rawAgent().get('/api/accounts').set('X-Session-Token', plainToken);
      assert.equal(res.status, 401);
    });

    it('register returns a token that works for auth', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        username: 'hashtest_user',
        password: 'TestPass123!',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.token);

      // Use the returned raw token
      const meRes = await rawAgent().get('/api/auth/me').set('X-Session-Token', res.body.token);
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.user.username, 'hashtest_user');
    });

    it('login returns a token that works for auth', async () => {
      // Register first
      await rawAgent().post('/api/auth/register').send({
        username: 'hashlogin_user',
        password: 'TestPass123!',
      });

      const loginRes = await rawAgent().post('/api/auth/login').send({
        username: 'hashlogin_user',
        password: 'TestPass123!',
      });
      assert.equal(loginRes.status, 200);
      assert.ok(loginRes.body.token);

      const meRes = await rawAgent().get('/api/auth/me').set('X-Session-Token', loginRes.body.token);
      assert.equal(meRes.status, 200);
    });
  });

  // ─── API Token Expiry ───

  describe('API token expiry', () => {
    it('should accept API token before expiry', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      // Create token with expiry
      const createRes = await agent().post('/api/tokens').send({
        name: 'expiry-test',
        scope: 'readwrite',
        expires_at: futureDate,
      });
      assert.equal(createRes.status, 201);
      const rawToken = createRes.body.token.raw_token;

      // Use it — should work
      const res = await rawAgent().get('/api/accounts').set('Authorization', `Bearer ${rawToken}`);
      assert.equal(res.status, 200);
    });

    it('should reject expired API token', async () => {
      // Create token with past expiry by directly inserting
      const rawToken = 'pfi_' + crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      db.prepare(
        'INSERT INTO api_tokens (user_id, name, token_hash, scope, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).run(1, 'expired-token', tokenHash, 'readwrite', pastDate);

      const res = await rawAgent().get('/api/accounts').set('Authorization', `Bearer ${rawToken}`);
      assert.equal(res.status, 401);
    });

    it('should accept API token with no expiry (null expires_at)', async () => {
      const createRes = await agent().post('/api/tokens').send({
        name: 'no-expiry-test',
        scope: 'readwrite',
      });
      assert.equal(createRes.status, 201);
      assert.equal(createRes.body.token.expires_at, null);
      const rawToken = createRes.body.token.raw_token;

      const res = await rawAgent().get('/api/accounts').set('Authorization', `Bearer ${rawToken}`);
      assert.equal(res.status, 200);
    });

    it('should include expires_at in token list', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      await agent().post('/api/tokens').send({
        name: 'list-test',
        expires_at: futureDate,
      });

      const listRes = await agent().get('/api/tokens');
      assert.equal(listRes.status, 200);
      const found = listRes.body.tokens.find(t => t.name === 'list-test');
      assert.ok(found);
      assert.ok(found.expires_at);
    });
  });

  // ─── Token Rotation ───

  describe('Token rotation', () => {
    it('should rotate token and return new raw token', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'rotate-test' });
      assert.equal(createRes.status, 201);
      const oldId = createRes.body.token.id;

      const rotateRes = await agent().put(`/api/tokens/${oldId}/rotate`);
      assert.equal(rotateRes.status, 200);
      assert.ok(rotateRes.body.token.raw_token);
      assert.ok(rotateRes.body.token.raw_token.startsWith('pfi_'));
      assert.notEqual(rotateRes.body.token.id, oldId);
    });

    it('rotated old token should no longer work', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'rotate-old-test' });
      const oldRawToken = createRes.body.token.raw_token;
      const oldId = createRes.body.token.id;

      // Rotate
      const rotateRes = await agent().put(`/api/tokens/${oldId}/rotate`);
      assert.equal(rotateRes.status, 200);

      // Old token should fail
      const res = await rawAgent().get('/api/accounts').set('Authorization', `Bearer ${oldRawToken}`);
      assert.equal(res.status, 401);
    });

    it('new rotated token should work', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'rotate-new-test' });
      const oldId = createRes.body.token.id;

      const rotateRes = await agent().put(`/api/tokens/${oldId}/rotate`);
      const newRawToken = rotateRes.body.token.raw_token;

      // New token should work
      const res = await rawAgent().get('/api/accounts').set('Authorization', `Bearer ${newRawToken}`);
      assert.equal(res.status, 200);
    });

    it('should return 404 for non-existent token rotation', async () => {
      const res = await agent().put('/api/tokens/99999/rotate');
      assert.equal(res.status, 404);
    });

    it('should return 400 when rotating already-inactive token', async () => {
      const createRes = await agent().post('/api/tokens').send({ name: 'double-rotate-test' });
      const oldId = createRes.body.token.id;

      // Rotate once
      await agent().put(`/api/tokens/${oldId}/rotate`);

      // Try rotating the old (now inactive) token again
      const res = await agent().put(`/api/tokens/${oldId}/rotate`);
      assert.equal(res.status, 400);
    });
  });
});
