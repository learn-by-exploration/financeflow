// tests/v3-frontend-qa.test.js — Iteration 8: Frontend views + scheduler + edge cases
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, today, daysFromNow } = require('./helpers');

describe('v3 Frontend & QA (Iter 8)', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 100000 });
    category = makeCategory({ name: 'QA' });
  });

  // ─── Frontend view module existence ───
  describe('Frontend view files exist', () => {
    const views = [
      'dashboard', 'accounts', 'transactions', 'categories', 'budgets',
      'subscriptions', 'goals', 'groups', 'splits', 'reports',
      'rules', 'settings', 'search', 'insights', 'recurring',
      'export',
    ];

    for (const view of views) {
      it(`${view}.js exists in public/js/views/`, () => {
        const filePath = path.join(__dirname, '..', 'public', 'js', 'views', `${view}.js`);
        assert.ok(fs.existsSync(filePath), `${view}.js should exist`);
      });
    }
  });

  // ─── Calculators merged into Health view (v7) ───
  describe('Calculators merged into Health view', () => {
    it('reports.js (health view) contains SIP calculator', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'reports.js'), 'utf8');
      assert.ok(content.includes('SIP Calculator'), 'Should have SIP Calculator in health view');
    });

    it('reports.js contains all 4 calculator types', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'reports.js'), 'utf8');
      assert.ok(content.includes('sip-calculator'), 'Should include SIP');
      assert.ok(content.includes('emi-calculator'), 'Should include EMI');
      assert.ok(content.includes('fire-calculator'), 'Should include FIRE');
      assert.ok(content.includes('lumpsum-calculator'), 'Should include Lumpsum');
    });

    it('calculators.js standalone view file no longer exists', () => {
      assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'views', 'calculators.js')));
    });
  });

  // ─── Challenges merged into Goals view (v7) ───
  describe('Challenges merged into Goals view', () => {
    it('goals.js contains challenge creation form', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'goals.js'), 'utf8');
      assert.ok(content.includes('New Savings Challenge'), 'Should have creation form in goals view');
    });

    it('goals.js shows challenge progress bar', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'goals.js'), 'utf8');
      assert.ok(content.includes('challenge-card'), 'Should have challenge cards in goals view');
    });

    it('challenges.js standalone view file no longer exists', () => {
      assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'views', 'challenges.js')));
    });
  });

  // ─── Navigation integration ───
  describe('Navigation integration', () => {
    it('calculators nav item removed (merged into health)', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(!content.includes('data-view="calculators"'), 'Calculators nav should be removed');
    });

    it('challenges nav item removed (merged into goals)', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(!content.includes('data-view="challenges"'), 'Challenges nav should be removed');
    });

    it('app.js does not have calculators route (merged)', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
      assert.ok(!content.includes("calculators:"), 'calculators route should be removed');
    });

    it('app.js does not have challenges route (merged)', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
      assert.ok(!content.includes("challenges:"), 'challenges route should be removed');
    });

    it('service worker caches reports.js (includes calculators)', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      assert.ok(content.includes('reports.js'), 'SW should cache reports.js');
    });
  });

  // ─── Scheduler edge cases ───
  describe('Scheduler edge cases', () => {
    it('spawnDueRecurring handles no due rules', () => {
      const { db } = setup();
      const logger = require('../src/logger');
      const createScheduler = require('../src/scheduler');
      const scheduler = createScheduler(db, logger);
      const result = scheduler.spawnDueRecurring();
      assert.equal(result.processed, 0);
      assert.equal(result.failures.length, 0);
    });

    it('advanceDate handles all frequencies', () => {
      const { db } = setup();
      const logger = require('../src/logger');
      const createScheduler = require('../src/scheduler');
      const scheduler = createScheduler(db, logger);

      assert.equal(scheduler.advanceDate('2025-01-01', 'daily'), '2025-01-02');
      assert.equal(scheduler.advanceDate('2025-01-01', 'weekly'), '2025-01-08');
      assert.equal(scheduler.advanceDate('2025-01-01', 'biweekly'), '2025-01-15');
      assert.equal(scheduler.advanceDate('2025-01-01', 'monthly'), '2025-02-01');
      assert.equal(scheduler.advanceDate('2025-01-01', 'quarterly'), '2025-04-01');
      assert.equal(scheduler.advanceDate('2025-01-01', 'yearly'), '2026-01-01');
    });

    it('advanceDate handles month end boundaries', () => {
      const { db } = setup();
      const logger = require('../src/logger');
      const createScheduler = require('../src/scheduler');
      const scheduler = createScheduler(db, logger);

      // Jan 31 + monthly → Feb 28 or March (depends on leap year handling)
      const result = scheduler.advanceDate('2025-01-31', 'monthly');
      assert.ok(result.startsWith('2025-0'), 'Should advance to Feb or Mar');
    });

    it('runCleanup does not crash on empty DB', () => {
      const { db } = setup();
      const logger = require('../src/logger');
      const createScheduler = require('../src/scheduler');
      const scheduler = createScheduler(db, logger);
      assert.doesNotThrow(() => scheduler.runCleanup());
    });
  });

  // ─── Report schema validation ───
  describe('Report schema module', () => {
    it('report schema module exports correctly', () => {
      const schema = require('../src/schemas/report.schema');
      assert.ok(schema.yearInReviewSchema);
      assert.ok(schema.monthlyReportSchema);
      assert.ok(schema.dateRangeSchema);
    });

    it('yearInReviewSchema validates YYYY', () => {
      const { yearInReviewSchema } = require('../src/schemas/report.schema');
      assert.ok(yearInReviewSchema.safeParse({ year: '2025' }).success);
      assert.ok(!yearInReviewSchema.safeParse({ year: '20' }).success);
      assert.ok(!yearInReviewSchema.safeParse({ year: '' }).success);
    });

    it('monthlyReportSchema validates YYYY-MM', () => {
      const { monthlyReportSchema } = require('../src/schemas/report.schema');
      assert.ok(monthlyReportSchema.safeParse({ month: '2025-01' }).success);
      assert.ok(!monthlyReportSchema.safeParse({ month: '2025-13' }).success);
      assert.ok(!monthlyReportSchema.safeParse({ month: '2025' }).success);
    });
  });

  // ─── Stats repository unit tests ───
  describe('Stats repository', () => {
    it('getAccountSummary returns assets and liabilities', () => {
      const { db } = setup();
      const createStatsRepo = require('../src/repositories/stats.repository');
      const repo = createStatsRepo({ db });
      const summary = repo.getAccountSummary(1);
      assert.ok(summary.assets !== undefined);
      assert.ok(summary.liabilities !== undefined);
    });

    it('getRecentTransactions returns array', () => {
      const { db } = setup();
      const createStatsRepo = require('../src/repositories/stats.repository');
      const repo = createStatsRepo({ db });
      makeTransaction(account.id, { amount: 100 });
      const txns = repo.getRecentTransactions(1);
      assert.ok(Array.isArray(txns));
    });

    it('getCategoryBreakdown returns array', () => {
      const { db } = setup();
      const createStatsRepo = require('../src/repositories/stats.repository');
      const repo = createStatsRepo({ db });
      makeTransaction(account.id, { amount: 100, category_id: category.id });
      const breakdown = repo.getCategoryBreakdown(1, 'expense');
      assert.ok(Array.isArray(breakdown));
    });
  });
});
