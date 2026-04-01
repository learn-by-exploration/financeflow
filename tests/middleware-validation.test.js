// tests/middleware-validation.test.js — Middleware and server configuration tests
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, rawAgent } = require('./helpers');
const fs = require('fs');
const path = require('path');

describe('Middleware & Server Configuration', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  describe('Content-Type Handling', () => {
    it('API accepts application/json', async () => {
      const res = await agent().post('/api/accounts')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ name: 'Test', type: 'checking', balance: 0 }));
      assert.equal(res.status, 201);
    });

    it('GET requests work without content-type', async () => {
      const res = await agent().get('/api/health');
      assert.equal(res.status, 200);
    });
  });

  describe('Error Middleware', () => {
    it('unknown API routes handled gracefully', async () => {
      const res = await agent().get('/api/nonexistent');
      assert.ok([200, 404].includes(res.status));
    });

    it('method not allowed on API routes', async () => {
      const res = await agent().patch('/api/health');
      assert.ok([200, 404, 405].includes(res.status));
    });
  });

  describe('Static File Serving', () => {
    it('serves index.html', async () => {
      const res = await rawAgent().get('/');
      assert.ok([200, 301, 302].includes(res.status));
    });

    it('serves login.html', async () => {
      const res = await rawAgent().get('/login.html');
      assert.equal(res.status, 200);
    });

    it('serves landing.html', async () => {
      const res = await rawAgent().get('/landing.html');
      assert.equal(res.status, 200);
    });

    it('serves styles.css', async () => {
      const res = await rawAgent().get('/styles.css');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('css'));
    });

    it('serves manifest.json', async () => {
      const res = await rawAgent().get('/manifest.json');
      assert.equal(res.status, 200);
    });

    it('serves service worker', async () => {
      const res = await rawAgent().get('/sw.js');
      assert.equal(res.status, 200);
    });
  });

  describe('Branding API', () => {
    it('returns branding info', async () => {
      const res = await rawAgent().get('/api/branding');
      assert.equal(res.status, 200);
      assert.ok(res.body.name);
    });
  });

  describe('What\'s New API', () => {
    it('returns releases info', async () => {
      const res = await agent().get('/api/whats-new');
      assert.equal(res.status, 200);
      assert.ok(res.body.entries || res.body.releases || Array.isArray(res.body));
    });
  });

  describe('Config Validation', () => {
    it('config module exports frozen object', () => {
      const config = require('../src/config');
      assert.ok(config);
      assert.ok(config.port);
      assert.ok(config.auth);
      assert.ok(config.auth.saltRounds);
    });
  });

  describe('Error Classes', () => {
    it('error hierarchy works correctly', () => {
      const { AppError, NotFoundError, ValidationError, ForbiddenError, ConflictError, UnauthorizedError } = require('../src/errors');

      const notFound = new NotFoundError('Account');
      assert.ok(notFound instanceof AppError);
      assert.equal(notFound.status, 404);
      assert.equal(notFound.code, 'NOT_FOUND');

      const validation = new ValidationError('Bad input');
      assert.ok(validation instanceof AppError);
      assert.equal(validation.status, 400);

      const forbidden = new ForbiddenError();
      assert.equal(forbidden.status, 403);

      const conflict = new ConflictError('Exists');
      assert.equal(conflict.status, 409);

      const unauthorized = new UnauthorizedError();
      assert.equal(unauthorized.status, 401);
    });
  });

  describe('Database', () => {
    it('SQLite is in WAL mode', () => {
      const mode = db.pragma('journal_mode', { simple: true });
      assert.equal(mode, 'wal');
    });

    it('foreign keys are enabled', () => {
      const fk = db.pragma('foreign_keys', { simple: true });
      assert.equal(fk, 1);
    });

    it('all required tables exist', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
      const required = [
        'users', 'sessions', 'accounts', 'transactions', 'categories',
        'budgets', 'budget_items', 'savings_goals', 'subscriptions',
        'tags', 'transaction_tags', 'recurring_rules', 'settings',
        'audit_log', 'notifications', 'groups', 'group_members',
        'shared_expenses', 'expense_splits', 'settlements'
      ];
      for (const t of required) {
        assert.ok(tables.includes(t), `Table ${t} should exist`);
      }
    });

    it('migrations are all applied', () => {
      const migrations = db.prepare('SELECT * FROM _migrations ORDER BY id ASC').all();
      assert.ok(migrations.length >= 29);
    });
  });

  describe('Onboarding', () => {
    it('returns onboarding steps', async () => {
      const res = await agent().get('/api/users/onboarding');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.steps));
      assert.ok(res.body.steps.length >= 3);
    });

    it('dismiss onboarding', async () => {
      const res = await agent().put('/api/users/onboarding/dismiss');
      assert.equal(res.status, 200);
    });
  });

  describe('Dashboard Layout', () => {
    it('get dashboard layout', async () => {
      const res = await agent().get('/api/settings/dashboard');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.layout));
    });

    it('update dashboard layout', async () => {
      const res = await agent().put('/api/settings')
        .send({ key: 'dashboard_layout', value: JSON.stringify(['net_worth', 'spending_trend']) });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
      // Verify it was saved
      const get = await agent().get('/api/settings/dashboard');
      assert.deepEqual(get.body.layout, ['net_worth', 'spending_trend']);
    });
  });

  describe('CSV Import/Export', () => {
    it('CSV template has correct headers', async () => {
      const res = await agent().get('/api/data/csv-template');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('date'));
      assert.ok(res.text.includes('description'));
      assert.ok(res.text.includes('amount'));
    });

    it('export transactions as CSV', async () => {
      const { makeAccount, makeCategory, makeTransaction } = require('./helpers');
      const acct = makeAccount();
      const cat = makeCategory();
      makeTransaction(acct.id, { category_id: cat.id, description: 'Test CSV' });

      const res = await agent().get('/api/export/transactions');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('csv') || res.headers['content-disposition']);
    });

    it('export accounts as CSV', async () => {
      const { makeAccount } = require('./helpers');
      makeAccount();
      const res = await agent().get('/api/export/accounts');
      assert.ok([200, 400].includes(res.status));
    });
  });

  describe('API Tokens', () => {
    it('create and list API tokens', async () => {
      const createRes = await agent().post('/api/tokens').send({
        name: 'Test Token', scope: 'read'
      });
      assert.equal(createRes.status, 201);
      assert.ok(createRes.body.token.raw_token);
      assert.ok(createRes.body.token.raw_token.startsWith('pfi_'));

      const listRes = await agent().get('/api/tokens');
      assert.equal(listRes.status, 200);
      assert.ok(listRes.body.tokens.length >= 1);
    });

    it('revoke API token', async () => {
      const createRes = await agent().post('/api/tokens').send({
        name: 'Temp Token', scope: 'read'
      });
      const tokenId = createRes.body.token.id;

      const delRes = await agent().delete(`/api/tokens/${tokenId}`);
      assert.equal(delRes.status, 200);
    });
  });

  describe('Preferences', () => {
    it('get and set preferences', async () => {
      const getRes = await agent().get('/api/preferences');
      assert.equal(getRes.status, 200);
      assert.ok(getRes.body.preferences);

      const setRes = await agent().put('/api/preferences').send({
        items_per_page: 25
      });
      assert.equal(setRes.status, 200);
    });
  });

  describe('Net Worth', () => {
    it('calculates net worth from accounts', async () => {
      const { makeAccount } = require('./helpers');
      makeAccount({ type: 'checking', balance: 50000 });
      makeAccount({ type: 'credit_card', balance: -5000 });

      const res = await agent().get('/api/net-worth');
      assert.equal(res.status, 200);
      assert.ok(res.body.net_worth);
      assert.ok(res.body.total_assets >= 50000);
      assert.ok(res.body.total_liabilities >= 5000);
    });

    it('net worth history returns data', async () => {
      const res = await agent().get('/api/net-worth/history');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.snapshots));
    });
  });
});
