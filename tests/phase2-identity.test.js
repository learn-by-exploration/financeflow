const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeBudget } = require('./helpers');

describe('Phase 2 — Identity & First Impressions', () => {
  let app, db;

  before(() => {
    ({ app, db } = setup());
  });

  after(() => {
    // teardown handled globally
  });

  // ─── 2.1 Branding ─────────────────────────────────────

  describe('Branding — FinanceFlow', () => {
    it('index.html sidebar logo says FinanceFlow', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(html.includes('FinanceFlow'), 'index.html should contain FinanceFlow');
      assert.ok(!html.includes('PersonalFi'), 'index.html should not contain PersonalFi');
    });

    it('login.html title says FinanceFlow', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf8');
      assert.ok(html.includes('FinanceFlow'), 'login.html should contain FinanceFlow');
      assert.ok(!html.includes('PersonalFi'), 'login.html should not contain PersonalFi');
    });

    it('manifest.json name is FinanceFlow', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8'));
      assert.equal(manifest.name, 'FinanceFlow');
      assert.equal(manifest.short_name, 'FinanceFlow');
    });
  });

  // ─── 2.2 Service Worker ───────────────────────────────

  describe('Service Worker cache', () => {
    it('sw.js cache name starts with financeflow-', () => {
      const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      const match = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/);
      assert.ok(match, 'Should have CACHE_NAME');
      assert.ok(match[1].startsWith('financeflow-'), `Cache name should start with financeflow-, got: ${match[1]}`);
    });

    it('sw.js cache name contains version close to package.json', () => {
      const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      const match = sw.match(/CACHE_NAME\s*=\s*'financeflow-v([^']+)'/);
      assert.ok(match, 'Cache name should have version');
      // Major version should match
      const swMajor = match[1].split('.')[0];
      const pkgMajor = pkg.version.split('.')[0];
      assert.equal(swMajor, pkgMajor, 'Major version should match package.json');
    });

    it('sw.js STATIC_ASSETS includes key files', () => {
      const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      const requiredAssets = ['/css/login.css', '/js/login.js', '/js/vendor/chart.min.js'];
      for (const asset of requiredAssets) {
        assert.ok(sw.includes(`'${asset}'`), `STATIC_ASSETS should include ${asset}`);
      }
    });
  });

  // ─── 2.3 Settings version ─────────────────────────────

  describe('Settings version', () => {
    it('settings.js does not have hardcoded 0.1.7', () => {
      const settings = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'settings.js'), 'utf8');
      assert.ok(!settings.includes("'0.1.7'"), 'settings.js should not have hardcoded version 0.1.7');
    });
  });

  // ─── 2.4 Onboarding checklist API ─────────────────────

  describe('Onboarding Checklist API', () => {
    before(() => {
      cleanDb();
    });

    it('GET /api/users/onboarding returns checklist for new user (all incomplete)', async () => {
      const res = await agent().get('/api/users/onboarding');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.steps), 'Should return steps array');
      assert.equal(res.body.steps.length, 3);

      const accountStep = res.body.steps.find(s => s.name === 'account');
      const transactionStep = res.body.steps.find(s => s.name === 'transaction');
      const budgetStep = res.body.steps.find(s => s.name === 'budget');

      assert.ok(accountStep, 'Should have account step');
      assert.ok(transactionStep, 'Should have transaction step');
      assert.ok(budgetStep, 'Should have budget step');

      assert.equal(accountStep.completed, false);
      assert.equal(transactionStep.completed, false);
      assert.equal(budgetStep.completed, false);
      assert.equal(res.body.dismissed, false);
    });

    it('after creating an account, account step is completed', async () => {
      makeAccount();
      const res = await agent().get('/api/users/onboarding');
      assert.equal(res.status, 200);
      const accountStep = res.body.steps.find(s => s.name === 'account');
      assert.equal(accountStep.completed, true);
    });

    it('after creating a transaction, transaction step is completed', async () => {
      const acct = db.prepare('SELECT id FROM accounts WHERE user_id = 1').get();
      makeTransaction(acct.id);
      const res = await agent().get('/api/users/onboarding');
      assert.equal(res.status, 200);
      const transactionStep = res.body.steps.find(s => s.name === 'transaction');
      assert.equal(transactionStep.completed, true);
    });

    it('after creating a budget, budget step is completed', async () => {
      makeBudget();
      const res = await agent().get('/api/users/onboarding');
      assert.equal(res.status, 200);
      const budgetStep = res.body.steps.find(s => s.name === 'budget');
      assert.equal(budgetStep.completed, true);
    });

    it('PUT /api/users/onboarding/dismiss marks dismissed', async () => {
      const res = await agent().put('/api/users/onboarding/dismiss').send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.dismissed, true);

      const check = await agent().get('/api/users/onboarding');
      assert.equal(check.status, 200);
      assert.equal(check.body.dismissed, true);
    });
  });
});
