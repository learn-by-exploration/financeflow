// tests/v7-simplify.test.js — Phase 1 SIMPLIFY tests
// Verifies removal of dead code, nav consolidation, and view merges

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const SRC = path.join(__dirname, '..', 'src');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');

// ═══════════════════════════════════════════════════════════════
// Task 1.1 — Privacy Banner Removal
// ═══════════════════════════════════════════════════════════════
describe('Task 1.1 — Privacy Banner Removed', () => {
  const html = read('index.html');
  const css = read('styles.css');
  const appJs = read('js/app.js');

  it('index.html does not contain privacy-banner element', () => {
    assert.ok(!html.includes('id="privacy-banner"'),
      'privacy-banner element should be removed from index.html');
  });

  it('index.html does not contain privacy-dismiss button', () => {
    assert.ok(!html.includes('id="privacy-dismiss"'),
      'privacy-dismiss button should be removed from index.html');
  });

  it('styles.css does not contain .privacy-banner class', () => {
    assert.ok(!css.includes('.privacy-banner'),
      '.privacy-banner CSS should be removed');
  });

  it('app.js does not reference pfi_privacy_accepted', () => {
    assert.ok(!appJs.includes('pfi_privacy_accepted'),
      'pfi_privacy_accepted localStorage references should be removed');
  });

  it('app.js does not reference privacy-banner', () => {
    assert.ok(!appJs.includes('privacy-banner'),
      'privacy-banner DOM references should be removed from app.js');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 1.2 — CSRF Dead Code Removal
// ═══════════════════════════════════════════════════════════════
describe('Task 1.2 — CSRF Dead Code Removed', () => {
  it('src/middleware/csrf.js does not exist', () => {
    assert.ok(!fs.existsSync(path.join(SRC, 'middleware', 'csrf.js')),
      'csrf.js should be deleted — CSRF is unnecessary with header-based auth');
  });

  it('server.js documents why CSRF is not needed', () => {
    const serverJs = fs.readFileSync(path.join(SRC, 'server.js'), 'utf8');
    assert.ok(serverJs.includes('X-Session-Token'),
      'server.js should explain header-based auth prevents CSRF');
  });

  it('server.js does not require csrf middleware', () => {
    const serverJs = fs.readFileSync(path.join(SRC, 'server.js'), 'utf8');
    assert.ok(!serverJs.includes("require('./middleware/csrf')"),
      'server.js should not require csrf middleware');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 1.3 — Calculators Merged into Financial Health
// ═══════════════════════════════════════════════════════════════
describe('Task 1.3 — Calculators Merged into Health', () => {
  const html = read('index.html');
  const appJs = read('js/app.js');

  it('calculators.js view file no longer exists', () => {
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'js', 'views', 'calculators.js')),
      'calculators.js should be removed — calculators are now in health view');
  });

  it('calculators nav item removed from sidebar', () => {
    assert.ok(!html.includes('data-view="calculators"'),
      'calculators nav item should be removed from sidebar');
  });

  it('app.js does not register calculators view', () => {
    assert.ok(!appJs.includes("calculators:"),
      'calculators view should not be in app.js view registry');
  });

  it('health view (reports.js) contains calculator sections', () => {
    const reportsJs = read('js/views/reports.js');
    assert.ok(reportsJs.includes('SIP Calculator') || reportsJs.includes('Planning Tools'),
      'Health view should include calculator content');
  });

  it('health view includes all 4 calculator types', () => {
    const reportsJs = read('js/views/reports.js');
    assert.ok(reportsJs.includes('sip-calculator'), 'Should include SIP calculator');
    assert.ok(reportsJs.includes('emi-calculator'), 'Should include EMI calculator');
    assert.ok(reportsJs.includes('fire-calculator'), 'Should include FIRE calculator');
    assert.ok(reportsJs.includes('lumpsum-calculator'), 'Should include Lumpsum calculator');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 1.4 — Challenges Merged into Goals
// ═══════════════════════════════════════════════════════════════
describe('Task 1.4 — Challenges Merged into Goals', () => {
  const html = read('index.html');
  const appJs = read('js/app.js');

  it('challenges.js view file no longer exists', () => {
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'js', 'views', 'challenges.js')),
      'challenges.js should be removed — challenges are now in goals view');
  });

  it('challenges nav item removed from sidebar', () => {
    assert.ok(!html.includes('data-view="challenges"'),
      'challenges nav item should be removed from sidebar');
  });

  it('app.js does not register challenges view', () => {
    assert.ok(!appJs.includes('challenges:'),
      'challenges view should not be in app.js view registry');
  });

  it('goals view contains challenges section', () => {
    const goalsJs = read('js/views/goals.js');
    assert.ok(goalsJs.includes('Challenges') || goalsJs.includes('challenges'),
      'Goals view should include challenges section');
  });

  it('goals view can create challenges via API', () => {
    const goalsJs = read('js/views/goals.js');
    assert.ok(goalsJs.includes('/stats/challenges'),
      'Goals view should call challenges API');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 1.5 — Tags, Rules, Export Moved to Settings
// ═══════════════════════════════════════════════════════════════
describe('Task 1.5 — Tags/Rules/Export in Settings', () => {
  const html = read('index.html');
  const appJs = read('js/app.js');
  const settingsJs = read('js/views/settings.js');

  it('rules nav item removed from sidebar', () => {
    assert.ok(!html.includes('data-view="rules"'),
      'rules nav should not be in sidebar');
  });

  it('export nav item removed from sidebar', () => {
    assert.ok(!html.includes('data-view="export"'),
      'export nav should not be in sidebar');
  });

  it('settings view lazy-loads tags module', () => {
    assert.ok(settingsJs.includes('tags.js'),
      'Settings should import tags module');
  });

  it('settings view lazy-loads rules module', () => {
    assert.ok(settingsJs.includes('rules.js'),
      'Settings should import rules module');
  });

  it('settings view lazy-loads export module', () => {
    assert.ok(settingsJs.includes('export.js'),
      'Settings should import export module');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 1.6 — What's New Converted to Modal
// ═══════════════════════════════════════════════════════════════
describe('Task 1.6 — What\'s New as Modal', () => {
  const html = read('index.html');
  const appJs = read('js/app.js');
  const settingsJs = read('js/views/settings.js');

  it('whats-new.js view file no longer exists', () => {
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'js', 'views', 'whats-new.js')),
      'whats-new.js should be removed — now a modal in settings');
  });

  it('whats-new nav item removed from sidebar', () => {
    assert.ok(!html.includes('data-view="whats-new"'),
      'whats-new nav should not be in sidebar');
  });

  it('app.js does not register whats-new view', () => {
    assert.ok(!appJs.includes("'whats-new'"),
      'whats-new view should not be in app.js view registry');
  });

  it('settings view has What\'s New button', () => {
    assert.ok(settingsJs.includes("What's New") || settingsJs.includes('whats-new'),
      'Settings should have What\'s New trigger');
  });

  it('settings view calls whats-new API', () => {
    assert.ok(settingsJs.includes('/whats-new'),
      'Settings should fetch changelog from whats-new endpoint');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 1.7 — Calendar → Dashboard Widget + Group Balances
// ═══════════════════════════════════════════════════════════════
describe('Task 1.7 — Calendar Merged into Dashboard', () => {
  const html = read('index.html');
  const appJs = read('js/app.js');
  const dashJs = read('js/views/dashboard.js');

  it('calendar.js view file no longer exists', () => {
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'js', 'views', 'calendar.js')),
      'calendar.js should be removed — merged into dashboard widget');
  });

  it('calendar nav item removed from sidebar', () => {
    assert.ok(!html.includes('data-view="calendar"'),
      'calendar nav should not be in sidebar');
  });

  it('app.js does not register calendar view', () => {
    assert.ok(!appJs.includes("calendar:") || !appJs.includes("calendar.js"),
      'calendar view should not be in app.js view registry');
  });

  it('dashboard has upcoming widget', () => {
    assert.ok(dashJs.includes('Upcoming') || dashJs.includes('upcoming'),
      'Dashboard should have upcoming transactions/recurring widget');
  });

  it('dashboard has group balances widget', () => {
    assert.ok(dashJs.includes('Group Balance') || dashJs.includes('group-balance') || dashJs.includes('balances'),
      'Dashboard should have group balances widget');
  });

  it('dashboard calls calendar or recurring API', () => {
    assert.ok(dashJs.includes('/calendar') || dashJs.includes('/recurring') || dashJs.includes('/stats/upcoming'),
      'Dashboard should fetch upcoming items');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 1.8 — Nav Cleanup + SW Cache Bump
// ═══════════════════════════════════════════════════════════════
describe('Task 1.8 — Nav Cleanup & SW Cache', () => {
  const html = read('index.html');
  const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');

  it('sidebar has exactly 13 nav items (down from 21)', () => {
    // Extract only sidebar nav items (before mobile bottom-nav section)
    const sidebarHtml = html.split('bottom-nav')[0];
    const navItems = (sidebarHtml.match(/data-view="[^"]+"/g) || [])
      .map(m => m.match(/data-view="([^"]+)"/)[1])
      .filter(v => v !== 'more' && v !== 'settings');
    // Expected: dashboard, transactions, accounts, categories,
    //   budgets, subscriptions, goals, recurring,
    //   groups, splits, health, reports, insights
    assert.equal(navItems.length, 13,
      `Expected 13 nav items, got ${navItems.length}: ${navItems.join(', ')}`);
  });

  it('empty System nav group is removed', () => {
    assert.ok(!html.includes('data-group="system"'),
      'Empty System nav group should be removed');
  });

  it('SW cache name is updated to v7.0.0', () => {
    assert.ok(sw.includes('financeflow-v7.0.0'),
      'SW CACHE_NAME should be financeflow-v7.0.0');
  });

  it('SW does not reference removed view files', () => {
    assert.ok(!sw.includes('calculators.js'), 'SW should not reference calculators.js');
    assert.ok(!sw.includes('challenges.js'), 'SW should not reference challenges.js');
    assert.ok(!sw.includes('calendar.js'), 'SW should not reference calendar.js');
    assert.ok(!sw.includes('whats-new.js'), 'SW should not reference whats-new.js');
  });

  it('removed nav items are not in sidebar', () => {
    const removed = ['calculators', 'challenges', 'calendar', 'whats-new', 'rules', 'export'];
    for (const view of removed) {
      assert.ok(!html.includes(`data-view="${view}"`),
        `${view} should not be in sidebar`);
    }
  });
});
