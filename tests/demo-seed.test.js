const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let app, db, dir;

function setup() {
  if (!app) {
    process.env.NODE_ENV = 'test';
    const { tmpdir } = require('os');
    const { mkdtempSync } = require('fs');
    const path = require('path');
    dir = mkdtempSync(path.join(tmpdir(), 'personalfi-demo-test-'));
    process.env.DB_DIR = dir;
    // Clear cached modules so we get a fresh server
    delete require.cache[require.resolve('../src/server')];
    delete require.cache[require.resolve('../src/config')];
    const server = require('../src/server');
    app = server.app;
    db = server.db;
  }
  return { app, db, dir };
}

function teardown() {
  if (db) { try { db.close(); } catch {} }
  if (dir) {
    const { rmSync } = require('fs');
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const request = require('supertest');
const seedDemoData = require('../src/db/seed');

function rawAgent() {
  return request(app);
}

describe('Demo Mode & Seed', () => {
  before(() => setup());
  after(() => teardown());

  describe('Seed script', () => {
    beforeEach(() => {
      // Clean demo user before each seed test
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      if (existing) {
        db.prepare('DELETE FROM users WHERE id = ?').run(existing.id);
      }
    });

    it('creates a demo user with correct credentials', () => {
      const bcrypt = require('bcryptjs');
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get('demo');
      assert.ok(user, 'Demo user should exist');
      assert.equal(user.email, 'demo@example.com');
      assert.ok(bcrypt.compareSync('demo123', user.password_hash));
    });

    it('creates 5 accounts', () => {
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const accounts = db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE user_id = ?').get(user.id);
      assert.equal(accounts.cnt, 5);
    });

    it('creates 15 categories', () => {
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const cats = db.prepare('SELECT COUNT(*) as cnt FROM categories WHERE user_id = ?').get(user.id);
      assert.equal(cats.cnt, 15);
    });

    it('creates expected category names', () => {
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const cats = db.prepare('SELECT name FROM categories WHERE user_id = ? ORDER BY position').all(user.id);
      const names = cats.map(c => c.name);
      for (const expected of ['Food & Dining', 'Transport', 'Rent', 'Salary', 'Freelance', 'Groceries', 'Utilities']) {
        assert.ok(names.includes(expected), `Missing category: ${expected}`);
      }
    });

    it('creates 100+ transactions', () => {
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const txns = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?').get(user.id);
      assert.ok(txns.cnt >= 100, `Expected 100+ transactions, got ${txns.cnt}`);
    });

    it('creates 3 budgets', () => {
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const budgets = db.prepare('SELECT COUNT(*) as cnt FROM budgets WHERE user_id = ?').get(user.id);
      assert.equal(budgets.cnt, 3);
    });

    it('creates 3 savings goals', () => {
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const goals = db.prepare('SELECT COUNT(*) as cnt FROM savings_goals WHERE user_id = ?').get(user.id);
      assert.equal(goals.cnt, 3);
    });

    it('creates 3 recurring rules', () => {
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const rules = db.prepare('SELECT COUNT(*) as cnt FROM recurring_rules WHERE user_id = ?').get(user.id);
      assert.equal(rules.cnt, 3);
    });

    it('is idempotent — running twice does not error', () => {
      db.transaction(() => { seedDemoData(db); })();
      // Running a second time should not throw
      db.transaction(() => { seedDemoData(db); })();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      assert.ok(user, 'Demo user should still exist after double seed');
      const accounts = db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE user_id = ?').get(user.id);
      assert.equal(accounts.cnt, 5, 'Should have exactly 5 accounts after re-seed');
    });
  });

  describe('Demo API endpoints', () => {
    it('GET /api/demo/status returns demoMode status', async () => {
      const res = await rawAgent().get('/api/demo/status').expect(200);
      assert.equal(typeof res.body.demoMode, 'boolean');
    });

    it('GET /api/demo/session returns 404 when demo mode disabled', async () => {
      const origDemo = process.env.DEMO_MODE;
      delete process.env.DEMO_MODE;
      try {
        const res = await rawAgent().get('/api/demo/session').expect(404);
        assert.ok(res.body.error);
      } finally {
        if (origDemo !== undefined) process.env.DEMO_MODE = origDemo;
      }
    });

    it('POST /api/demo/reset returns 404 when demo mode disabled', async () => {
      const origDemo = process.env.DEMO_MODE;
      delete process.env.DEMO_MODE;
      try {
        const res = await rawAgent().post('/api/demo/reset').send({}).expect(404);
        assert.ok(res.body.error);
      } finally {
        if (origDemo !== undefined) process.env.DEMO_MODE = origDemo;
      }
    });

    it('GET /api/demo/session returns valid token when demo mode enabled', async () => {
      const origDemo = process.env.DEMO_MODE;
      process.env.DEMO_MODE = 'true';

      // Seed demo user first
      db.transaction(() => { seedDemoData(db); })();

      try {
        const res = await rawAgent().get('/api/demo/session').expect(200);
        assert.ok(res.body.token, 'Should return a token');
        assert.equal(res.body.user.username, 'demo');

        // Verify the token works for auth
        const meRes = await rawAgent().get('/api/auth/me')
          .set('X-Session-Token', res.body.token)
          .expect(200);
        assert.equal(meRes.body.user.username, 'demo');
      } finally {
        if (origDemo !== undefined) { process.env.DEMO_MODE = origDemo; } else { delete process.env.DEMO_MODE; }
      }
    });

    it('POST /api/demo/reset clears and re-seeds data', async () => {
      const origDemo = process.env.DEMO_MODE;
      process.env.DEMO_MODE = 'true';

      // Seed first
      db.transaction(() => { seedDemoData(db); })();

      try {
        // Add an extra transaction to verify reset clears it
        const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
        const account = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(user.id);
        db.prepare(
          'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(user.id, account.id, 'expense', 99999, 'INR', 'Extra test transaction', '2025-01-01');

        const beforeCount = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?').get(user.id).cnt;

        const res = await rawAgent().post('/api/demo/reset').send({}).expect(200);
        assert.equal(res.body.ok, true);

        // After reset, the extra transaction should be gone (user recreated)
        const newUser = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
        const afterCount = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?').get(newUser.id).cnt;
        assert.ok(afterCount < beforeCount, 'Reset should remove extra transactions');
        assert.ok(afterCount >= 100, 'Should still have 100+ seeded transactions');
      } finally {
        if (origDemo !== undefined) { process.env.DEMO_MODE = origDemo; } else { delete process.env.DEMO_MODE; }
      }
    });
  });
});
