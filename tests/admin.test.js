// tests/admin.test.js — Admin route tests (8 endpoints)
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeSecondUser } = require('./helpers');

describe('Admin Routes', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);
  beforeEach(cleanDb);

  // ── POST /api/admin/users/:id/reset-password ──

  describe('POST /api/admin/users/:id/reset-password', () => {
    it('resets a user password and invalidates sessions', async () => {
      const { userId } = makeSecondUser();
      const res = await agent().post(`/api/admin/users/${userId}/reset-password`)
        .send({ newPassword: 'newSecure123!' });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.match(res.body.message, /reset/i);

      // Verify old sessions for that user are deleted
      const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(userId);
      assert.equal(sessions.length, 0);
    });

    it('returns 400 for invalid user ID', async () => {
      const res = await agent().post('/api/admin/users/abc/reset-password')
        .send({ newPassword: 'newSecure123!' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('returns 404 for non-existent user', async () => {
      const res = await agent().post('/api/admin/users/99999/reset-password')
        .send({ newPassword: 'newSecure123!' });
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('returns 400 when newPassword is too short', async () => {
      const { userId } = makeSecondUser();
      const res = await agent().post(`/api/admin/users/${userId}/reset-password`)
        .send({ newPassword: 'short' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('returns 400 when newPassword is missing', async () => {
      const { userId } = makeSecondUser();
      const res = await agent().post(`/api/admin/users/${userId}/reset-password`)
        .send({});
      assert.equal(res.status, 400);
    });

    it('returns 403 for non-admin user', async () => {
      const { agent: userAgent, userId } = makeSecondUser();
      const res = await userAgent.post(`/api/admin/users/${userId}/reset-password`)
        .send({ newPassword: 'newSecure123!' });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('returns 401 for unauthenticated request', async () => {
      const res = await rawAgent().post('/api/admin/users/1/reset-password')
        .send({ newPassword: 'newSecure123!' });
      assert.equal(res.status, 401);
    });

    it('allows login with new password after reset', async () => {
      const { userId } = makeSecondUser({ username: 'resetme', password: 'oldPassword1!' });
      await agent().post(`/api/admin/users/${userId}/reset-password`)
        .send({ newPassword: 'brandNewPass1!' });

      const loginRes = await rawAgent().post('/api/auth/login')
        .send({ username: 'resetme', password: 'brandNewPass1!' });
      assert.equal(loginRes.status, 200);
      assert.ok(loginRes.body.token);
    });
  });

  // ── POST /api/admin/backup ──

  describe('POST /api/admin/backup', () => {
    it('creates a backup file', async () => {
      const res = await agent().post('/api/admin/backup');
      assert.equal(res.status, 201);
      assert.ok(res.body.filename);
      assert.match(res.body.filename, /^backup-.*\.db$/);
      assert.ok(res.body.size > 0);
      assert.ok(res.body.created);
    });

    it('returns 403 for non-admin user', async () => {
      const { agent: userAgent } = makeSecondUser();
      const res = await userAgent.post('/api/admin/backup');
      assert.equal(res.status, 403);
    });

    it('returns 401 for unauthenticated request', async () => {
      const res = await rawAgent().post('/api/admin/backup');
      assert.equal(res.status, 401);
    });
  });

  // ── GET /api/admin/backups ──

  describe('GET /api/admin/backups', () => {
    it('lists backups (empty initially)', async () => {
      const res = await agent().get('/api/admin/backups');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.backups));
    });

    it('lists backups after creating one', async () => {
      await agent().post('/api/admin/backup');
      const res = await agent().get('/api/admin/backups');
      assert.equal(res.status, 200);
      assert.ok(res.body.backups.length >= 1);
      assert.ok(res.body.backups[0].filename);
      assert.ok(res.body.backups[0].size > 0);
    });

    it('returns 403 for non-admin user', async () => {
      const { agent: userAgent } = makeSecondUser();
      const res = await userAgent.get('/api/admin/backups');
      assert.equal(res.status, 403);
    });
  });

  // ── GET /api/admin/backups/:filename ──

  describe('GET /api/admin/backups/:filename', () => {
    it('downloads a backup file', async () => {
      const createRes = await agent().post('/api/admin/backup');
      const { filename } = createRes.body;
      const res = await agent().get(`/api/admin/backups/${filename}`);
      assert.equal(res.status, 200);
    });

    it('returns 404 for non-existent backup', async () => {
      const res = await agent().get('/api/admin/backups/backup-2020-01-01T00-00-00-000.db');
      assert.equal(res.status, 404);
    });

    it('returns 400 for invalid filename', async () => {
      const res = await agent().get('/api/admin/backups/not-a-backup.txt');
      assert.equal(res.status, 400);
    });

    it('validates filename matches backup pattern', async () => {
      const res = await agent().get('/api/admin/backups/malicious file.db');
      assert.equal(res.status, 400);
    });
  });

  // ── GET /api/admin/backups/:filename/download ──

  describe('GET /api/admin/backups/:filename/download', () => {
    it('downloads a backup file (decryption path)', async () => {
      const createRes = await agent().post('/api/admin/backup');
      const { filename } = createRes.body;
      const res = await agent().get(`/api/admin/backups/${filename}/download`);
      assert.equal(res.status, 200);
    });

    it('returns 404 for non-existent backup', async () => {
      const res = await agent().get('/api/admin/backups/backup-2020-01-01T00-00-00-000.db/download');
      assert.equal(res.status, 404);
    });

    it('returns 400 for invalid filename', async () => {
      const res = await agent().get('/api/admin/backups/not-a-backup.txt/download');
      assert.equal(res.status, 400);
    });
  });

  // ── DELETE /api/admin/backups/:filename ──

  describe('DELETE /api/admin/backups/:filename', () => {
    it('deletes a backup', async () => {
      const createRes = await agent().post('/api/admin/backup');
      const { filename } = createRes.body;
      const res = await agent().delete(`/api/admin/backups/${filename}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.deleted, true);

      // Verify it's gone
      const listRes = await agent().get('/api/admin/backups');
      const found = listRes.body.backups.find(b => b.filename === filename);
      assert.equal(found, undefined);
    });

    it('returns 400 for invalid filename', async () => {
      const res = await agent().delete('/api/admin/backups/not-a-backup.txt');
      assert.equal(res.status, 400);
    });

    it('returns 403 for non-admin user', async () => {
      const { agent: userAgent } = makeSecondUser();
      const res = await userAgent.delete('/api/admin/backups/backup-test.db');
      assert.equal(res.status, 403);
    });
  });

  // ── POST /api/admin/audit/purge ──

  describe('POST /api/admin/audit/purge', () => {
    it('purges audit logs with default retention', async () => {
      // Insert some audit entries
      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, datetime('now', '-100 days'))"
      ).run(1, 'TEST', 'test', 1);
      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).run(1, 'TEST', 'test', 2);

      const res = await agent().post('/api/admin/audit/purge').send({});
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.deleted, 'number');
      assert.ok(res.body.deleted >= 1); // The 100-day-old one

      // Recent entry should still exist
      const recent = db.prepare('SELECT * FROM audit_log WHERE entity_id = 2').get();
      assert.ok(recent);
    });

    it('purges with custom retention days', async () => {
      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, datetime('now', '-10 days'))"
      ).run(1, 'TEST', 'test', 1);

      const res = await agent().post('/api/admin/audit/purge')
        .send({ retentionDays: 7 });
      assert.equal(res.status, 200);
      assert.ok(res.body.deleted >= 1);
    });

    it('returns 400 for retentionDays < 7', async () => {
      const res = await agent().post('/api/admin/audit/purge')
        .send({ retentionDays: 3 });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('returns 403 for non-admin user', async () => {
      const { agent: userAgent } = makeSecondUser();
      const res = await userAgent.post('/api/admin/audit/purge').send({});
      assert.equal(res.status, 403);
    });
  });

  // ── GET /api/admin/audit/stats ──

  describe('GET /api/admin/audit/stats', () => {
    it('returns audit statistics by time bucket', async () => {
      // Insert some audit entries at various ages
      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).run(1, 'TEST', 'test', 1);
      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, datetime('now', '-2 days'))"
      ).run(1, 'TEST', 'test', 2);
      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, datetime('now', '-50 days'))"
      ).run(1, 'TEST', 'test', 3);

      const res = await agent().get('/api/admin/audit/stats');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body.last_24h === 'number');
      assert.ok(typeof res.body.last_7d === 'number');
      assert.ok(typeof res.body.last_30d === 'number');
      assert.ok(typeof res.body.last_90d === 'number');
      assert.ok(typeof res.body.total === 'number');
      assert.ok(res.body.last_24h >= 1);
      assert.ok(res.body.last_7d >= 2);
      assert.ok(res.body.total >= 3);
    });

    it('returns all zeros on empty audit log', async () => {
      const res = await agent().get('/api/admin/audit/stats');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 0);
    });

    it('returns 403 for non-admin user', async () => {
      const { agent: userAgent } = makeSecondUser();
      const res = await userAgent.get('/api/admin/audit/stats');
      assert.equal(res.status, 403);
    });

    it('returns 401 for unauthenticated request', async () => {
      const res = await rawAgent().get('/api/admin/audit/stats');
      assert.equal(res.status, 401);
    });
  });
});
