const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb } = require('./helpers');
const createAuditRetention = require('../src/services/audit-retention');

let db;

before(() => {
  const ctx = setup();
  db = ctx.db;
});

beforeEach(() => {
  cleanDb();
});

// ─── Audit Retention Service Tests ───

describe('Audit retention service', () => {
  function insertAuditLog(daysAgo, action = 'TEST_ACTION') {
    db.prepare(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
       VALUES (1, ?, 'test', 1, '{}', datetime('now', '-' || ? || ' days'))`
    ).run(action, daysAgo);
  }

  it('purgeOldLogs deletes logs older than retention period', () => {
    insertAuditLog(100);
    insertAuditLog(95);
    insertAuditLog(10);
    insertAuditLog(5);

    const retention = createAuditRetention(db);
    const result = retention.purgeOldLogs(90);

    assert.equal(result.deleted, 2);
    const remaining = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;
    assert.equal(remaining, 2);
  });

  it('purgeOldLogs keeps logs within retention period', () => {
    insertAuditLog(1);
    insertAuditLog(30);
    insertAuditLog(60);
    insertAuditLog(89);

    const retention = createAuditRetention(db);
    const result = retention.purgeOldLogs(90);

    assert.equal(result.deleted, 0);
    const remaining = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;
    assert.equal(remaining, 4);
  });

  it('purgeOldLogs respects custom retention days', () => {
    insertAuditLog(10);
    insertAuditLog(20);
    insertAuditLog(40);

    const retention = createAuditRetention(db);
    const result = retention.purgeOldLogs(15);

    assert.equal(result.deleted, 2);
  });

  it('purgeOldLogs rejects invalid retentionDays', () => {
    const retention = createAuditRetention(db);
    assert.throws(() => retention.purgeOldLogs(0), /positive integer/);
    assert.throws(() => retention.purgeOldLogs(-5), /positive integer/);
    assert.throws(() => retention.purgeOldLogs(1.5), /positive integer/);
  });

  it('getAuditStats returns age buckets', () => {
    insertAuditLog(0);  // within 24h
    insertAuditLog(3);  // within 7d
    insertAuditLog(15); // within 30d
    insertAuditLog(60); // within 90d
    insertAuditLog(120); // older than 90d

    const retention = createAuditRetention(db);
    const stats = retention.getAuditStats();

    assert.equal(stats.total, 5);
    assert.equal(stats.last_24h, 1);
    assert.equal(stats.last_7d, 2);
    assert.equal(stats.last_30d, 3);
    assert.equal(stats.last_90d, 4);
  });
});

// ─── Audit Admin API Tests ───

describe('Audit admin API', () => {
  function insertAuditLog(daysAgo) {
    db.prepare(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
       VALUES (1, 'TEST', 'test', 1, '{}', datetime('now', '-' || ? || ' days'))`
    ).run(daysAgo);
  }

  it('POST /api/admin/audit/purge deletes old logs', async () => {
    insertAuditLog(100);
    insertAuditLog(50);

    const res = await agent()
      .post('/api/admin/audit/purge')
      .send({ retentionDays: 90 });

    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, 1);
  });

  it('POST /api/admin/audit/purge uses default 90 days', async () => {
    insertAuditLog(100);
    insertAuditLog(50);

    const res = await agent()
      .post('/api/admin/audit/purge')
      .send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, 1);
  });

  it('GET /api/admin/audit/stats returns stats', async () => {
    insertAuditLog(0);
    insertAuditLog(5);
    insertAuditLog(45);

    const res = await agent().get('/api/admin/audit/stats');

    assert.equal(res.status, 200);
    assert.ok(typeof res.body.total === 'number');
    assert.ok(typeof res.body.last_24h === 'number');
    assert.ok(typeof res.body.last_7d === 'number');
    assert.ok(typeof res.body.last_30d === 'number');
    assert.ok(typeof res.body.last_90d === 'number');
  });

  it('POST /api/admin/audit/purge requires auth', async () => {
    const supertest = require('supertest');
    const { app } = setup();
    const noAuth = supertest(app);
    const res = await noAuth.post('/api/admin/audit/purge').send({});
    assert.equal(res.status, 401);
  });

  it('GET /api/admin/audit/stats requires auth', async () => {
    const supertest = require('supertest');
    const { app } = setup();
    const noAuth = supertest(app);
    const res = await noAuth.get('/api/admin/audit/stats');
    assert.equal(res.status, 401);
  });
});

// ─── Per-User Rate Limiting Tests ───

describe('Per-user rate limiting', () => {
  const createPerUserRateLimit = require('../src/middleware/per-user-rate-limit');

  it('returns 429 after exceeding rate limit', () => {
    createPerUserRateLimit._resetAll();
    const middleware = createPerUserRateLimit({ max: 3, windowMs: 60000, skipInTest: false });

    let callCount = 0;
    const req = { user: { id: 999 } };
    const headers = {};
    const res = {
      set(k, v) { headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; },
    };

    // First 3 should pass
    for (let i = 0; i < 3; i++) {
      middleware(req, { ...res, set: res.set.bind(res) }, () => { callCount++; });
    }
    assert.equal(callCount, 3);

    // 4th should be rejected
    const res429 = { statusCode: null, body: null, set(k, v) { headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    middleware(req, res429, () => { callCount++; });
    assert.equal(callCount, 3); // not incremented
    assert.equal(res429.statusCode, 429);
    assert.ok(res429.body.error.code === 'RATE_LIMIT_EXCEEDED');
    assert.ok(headers['Retry-After']);

    createPerUserRateLimit._resetAll();
  });

  it('includes rate limit headers on responses', () => {
    createPerUserRateLimit._resetAll();
    const middleware = createPerUserRateLimit({ max: 10, windowMs: 60000, skipInTest: false });

    const req = { user: { id: 888 } };
    const headers = {};
    const res = {
      set(k, v) { headers[k] = v; },
    };
    middleware(req, res, () => {});

    assert.equal(headers['X-RateLimit-Limit'], '10');
    assert.ok('X-RateLimit-Remaining' in headers);
    assert.ok('X-RateLimit-Reset' in headers);

    createPerUserRateLimit._resetAll();
  });

  it('tracks per user independently', () => {
    createPerUserRateLimit._resetAll();
    const middleware = createPerUserRateLimit({ max: 2, windowMs: 60000, skipInTest: false });

    function makeCallable(userId) {
      return {
        req: { user: { id: userId } },
        res: { set() {}, status(c) { this.statusCode = c; return this; }, json() {} },
      };
    }

    // User A makes 2 requests (limit)
    const a = makeCallable(777);
    let aCount = 0;
    middleware(a.req, a.res, () => { aCount++; });
    middleware(a.req, a.res, () => { aCount++; });
    assert.equal(aCount, 2);

    // User B can still make requests (independent limit)
    const b = makeCallable(666);
    let bCount = 0;
    middleware(b.req, b.res, () => { bCount++; });
    assert.equal(bCount, 1);

    // User A is blocked
    const aBlocked = { ...a.res, statusCode: null, set() {}, status(c) { this.statusCode = c; return this; }, json() {} };
    middleware(a.req, aBlocked, () => { aCount++; });
    assert.equal(aCount, 2); // still 2
    assert.equal(aBlocked.statusCode, 429);

    createPerUserRateLimit._resetAll();
  });

  it('resets after window expires', async () => {
    createPerUserRateLimit._resetAll();
    const middleware = createPerUserRateLimit({ max: 1, windowMs: 100, skipInTest: false });

    const req = { user: { id: 555 } };
    const makeRes = () => ({ set() {}, status(c) { this.statusCode = c; return this; }, json() {} });

    let count = 0;
    middleware(req, makeRes(), () => { count++; });
    assert.equal(count, 1);

    // Should be blocked
    const blocked = makeRes();
    middleware(req, blocked, () => { count++; });
    assert.equal(count, 1);
    assert.equal(blocked.statusCode, 429);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be allowed again
    middleware(req, makeRes(), () => { count++; });
    assert.equal(count, 2);

    createPerUserRateLimit._resetAll();
  });

  it('skips rate limiting when no user is present', () => {
    createPerUserRateLimit._resetAll();
    const middleware = createPerUserRateLimit({ max: 1, windowMs: 60000, skipInTest: false });

    let called = false;
    middleware({}, { set() {} }, () => { called = true; });
    assert.ok(called);

    createPerUserRateLimit._resetAll();
  });

  it('Retry-After header is present on 429 response', () => {
    createPerUserRateLimit._resetAll();
    const middleware = createPerUserRateLimit({ max: 1, windowMs: 60000, skipInTest: false });

    const req = { user: { id: 444 } };
    const headers = {};
    const res = { set(k, v) { headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json() {} };

    middleware(req, { set() {} }, () => {}); // first request OK
    middleware(req, res, () => {}); // second blocked

    assert.equal(res.statusCode, 429);
    assert.ok(headers['Retry-After']);
    assert.ok(parseInt(headers['Retry-After'], 10) > 0);

    createPerUserRateLimit._resetAll();
  });
});
