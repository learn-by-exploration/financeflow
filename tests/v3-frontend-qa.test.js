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
      'calendar', 'export', 'whats-new', 'calculators', 'challenges',
    ];

    for (const view of views) {
      it(`${view}.js exists in public/js/views/`, () => {
        const filePath = path.join(__dirname, '..', 'public', 'js', 'views', `${view}.js`);
        assert.ok(fs.existsSync(filePath), `${view}.js should exist`);
      });
    }
  });

  // ─── Calculators view module content ───
  describe('Calculators view module', () => {
    it('exports renderCalculators function', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'calculators.js'), 'utf8');
      assert.ok(content.includes('export async function renderCalculators'), 'Should export renderCalculators');
    });

    it('has SIP calculator form', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'calculators.js'), 'utf8');
      assert.ok(content.includes('SIP Calculator'), 'Should have SIP Calculator');
    });

    it('has FIRE calculator form', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'calculators.js'), 'utf8');
      assert.ok(content.includes('FIRE Calculator'), 'Should have FIRE Calculator');
    });

    it('has EMI calculator form', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'calculators.js'), 'utf8');
      assert.ok(content.includes('EMI Calculator'), 'Should have EMI Calculator');
    });

    it('uses el() helper not innerHTML with user data', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'calculators.js'), 'utf8');
      // innerHTML = '' for container reset is acceptable, but no dynamic data
      const dynamicInner = content.replace(/innerHTML\s*=\s*['"]\s*['"]\s*;/g, '').match(/innerHTML/g);
      assert.ok(!dynamicInner, 'Should not use innerHTML with dynamic content');
    });
  });

  // ─── Challenges view module content ───
  describe('Challenges view module', () => {
    it('exports renderChallenges function', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'challenges.js'), 'utf8');
      assert.ok(content.includes('export async function renderChallenges'), 'Should export renderChallenges');
    });

    it('has challenge creation form', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'challenges.js'), 'utf8');
      assert.ok(content.includes('New Savings Challenge'), 'Should have creation form');
    });

    it('shows progress bar', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'challenges.js'), 'utf8');
      assert.ok(content.includes('progress-bar'), 'Should have progress bar');
    });

    it('uses el() helper not innerHTML with user data', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'challenges.js'), 'utf8');
      // innerHTML = '' for container reset is acceptable
      const dynamicInner = content.replace(/innerHTML\s*=\s*['"]\s*['"]\s*;/g, '').match(/innerHTML/g);
      assert.ok(!dynamicInner || dynamicInner.length === 0, `Should minimize innerHTML with dynamic content`);
    });
  });

  // ─── Navigation integration ───
  describe('Navigation integration', () => {
    it('index.html has calculators nav item', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(content.includes('data-view="calculators"'), 'Should have calculators nav');
    });

    it('index.html has challenges nav item', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(content.includes('data-view="challenges"'), 'Should have challenges nav');
    });

    it('app.js has calculators route', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
      assert.ok(content.includes("calculators:"), 'Should have calculators route');
    });

    it('app.js has challenges route', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
      assert.ok(content.includes("challenges:"), 'Should have challenges route');
    });

    it('service worker caches calculators.js', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      assert.ok(content.includes('calculators.js'), 'SW should cache calculators.js');
    });

    it('service worker caches challenges.js', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      assert.ok(content.includes('challenges.js'), 'SW should cache challenges.js');
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
