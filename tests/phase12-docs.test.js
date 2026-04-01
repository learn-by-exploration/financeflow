const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, cleanDb, teardown, rawAgent } = require('./helpers');

const ROOT = path.resolve(__dirname, '..');

describe('Phase 12 — Docs & Community (P3)', () => {

  // ─── 12.1 SECURITY.md & security.txt ───

  describe('12.1 — SECURITY.md', () => {
    it('SECURITY.md exists', () => {
      const secPath = path.join(ROOT, 'SECURITY.md');
      assert.ok(fs.existsSync(secPath), 'SECURITY.md should exist in project root');
    });

    it('SECURITY.md contains Security Policy title', () => {
      const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8');
      assert.ok(content.includes('Security Policy'), 'Should have Security Policy title');
    });

    it('SECURITY.md contains supported versions section', () => {
      const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8');
      assert.ok(content.includes('Supported Versions'), 'Should have Supported Versions section');
      assert.ok(content.includes('0.4.0'), 'Should reference v0.4.0');
    });

    it('SECURITY.md contains reporting instructions', () => {
      const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8');
      assert.ok(content.includes('security@financeflow.app'), 'Should have security email');
      assert.ok(content.includes('72 hours') || content.includes('72-hour'), 'Should mention 72-hour acknowledgment');
      assert.ok(content.includes('30 days') || content.includes('30-day'), 'Should mention 30-day fix timeline');
    });

    it('SECURITY.md covers security scope', () => {
      const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8');
      assert.ok(content.includes('authentication') || content.includes('Authentication'), 'Should mention authentication');
      assert.ok(content.includes('encryption') || content.includes('Encryption'), 'Should mention encryption');
      assert.ok(content.includes('session') || content.includes('Session'), 'Should mention session management');
    });

    it('SECURITY.md mentions responsible disclosure credit', () => {
      const content = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8');
      assert.ok(
        content.includes('credit') || content.includes('Credit') || content.includes('acknowledgment') || content.includes('Hall of Fame'),
        'Should mention responsible disclosure credit'
      );
    });
  });

  describe('12.1 — security.txt', () => {
    let app;
    before(() => {
      ({ app } = setup());
    });

    it('security.txt file exists in public/.well-known/', () => {
      const txtPath = path.join(ROOT, 'public', '.well-known', 'security.txt');
      assert.ok(fs.existsSync(txtPath), 'security.txt should exist');
    });

    it('security.txt is served at /.well-known/security.txt', async () => {
      const res = await rawAgent().get('/.well-known/security.txt');
      assert.equal(res.status, 200);
      assert.ok(res.text.length > 0, 'Response should have content');
    });

    it('security.txt contains Contact field', async () => {
      const res = await rawAgent().get('/.well-known/security.txt');
      assert.ok(res.text.includes('Contact:'), 'Should have Contact field');
      assert.ok(res.text.includes('security@financeflow.app'), 'Should have security email');
    });

    it('security.txt contains Expires field', () => {
      const content = fs.readFileSync(path.join(ROOT, 'public', '.well-known', 'security.txt'), 'utf8');
      assert.ok(content.includes('Expires:'), 'Should have Expires field');
    });

    it('security.txt contains Preferred-Languages', () => {
      const content = fs.readFileSync(path.join(ROOT, 'public', '.well-known', 'security.txt'), 'utf8');
      assert.ok(content.includes('Preferred-Languages: en'), 'Should have Preferred-Languages: en');
    });
  });

  // ─── 12.2 Expanded Seed Data ───

  describe('12.2 — Expanded Seed Data', () => {
    let db;
    let seedResult;

    before(() => {
      ({ db } = setup());
      cleanDb();
      // Run seed
      const seedDemoData = require('../src/db/seed');
      seedResult = db.transaction(() => seedDemoData(db))();
    });

    it('seed creates groups for demo user', () => {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      assert.ok(user, 'Demo user should exist');
      const groups = db.prepare(
        'SELECT g.* FROM groups g WHERE g.created_by = ?'
      ).all(user.id);
      assert.ok(groups.length >= 2, `Should have at least 2 groups, got ${groups.length}`);
    });

    it('seed makes demo user a member of created groups', () => {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const memberships = db.prepare(
        'SELECT gm.* FROM group_members gm WHERE gm.user_id = ?'
      ).all(user.id);
      assert.ok(memberships.length >= 2, `Should be member of at least 2 groups, got ${memberships.length}`);
    });

    it('seed creates budgets for demo user', () => {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(user.id);
      assert.ok(budgets.length >= 3, `Should have at least 3 budgets, got ${budgets.length}`);
    });

    it('seed creates goals for demo user', () => {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(user.id);
      assert.ok(goals.length >= 2, `Should have at least 2 goals, got ${goals.length}`);
    });

    it('seed creates transaction templates for demo user', () => {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const templates = db.prepare('SELECT * FROM transaction_templates WHERE user_id = ?').all(user.id);
      assert.ok(templates.length >= 3, `Should have at least 3 templates, got ${templates.length}`);
    });

    it('seed creates notifications for demo user', () => {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ?').all(user.id);
      assert.ok(notifications.length >= 2, `Should have at least 2 notifications, got ${notifications.length}`);
    });
  });

  // ─── 12.3 Version ───

  describe('12.3 — Version endpoint', () => {
    let app;
    before(() => {
      ({ app } = setup());
    });

    it('GET /api/version returns version info', async () => {
      const res = await rawAgent().get('/api/version');
      assert.equal(res.status, 200);
      assert.ok(res.body.version, 'Response should include version');
      assert.ok(/^\d+\.\d+\.\d+/.test(res.body.version), 'Version should be semver format');
    });
  });
});
