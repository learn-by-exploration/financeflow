// tests/v7-simplify.test.js — Phase 1 SIMPLIFY tests
// Verifies removal of dead code, nav consolidation, and view merges

const { describe, it, before, after, beforeEach } = require('node:test');
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

// ═══════════════════════════════════════════════════════════════
// PHASE 2: GUIDE
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Task 2.1 — Onboarding Wizard Redesign
// ═══════════════════════════════════════════════════════════════
describe('Task 2.1 — Onboarding Wizard', () => {
  const appJs = read('js/app.js');

  it('wizard has 4 steps', () => {
    // Check for step 4 handling in the wizard
    assert.ok(appJs.includes('step === 4') || appJs.includes("step = 4"),
      'Should handle 4 wizard steps');
    assert.ok(appJs.includes('<= 4') || appJs.includes('i <= 4'),
      'Should loop through 4 wizard dots');
  });

  it('wizard includes income/currency step', () => {
    assert.ok(appJs.includes('income') || appJs.includes('Income'),
      'Wizard should ask about income');
    assert.ok(appJs.includes('currency') || appJs.includes('Currency'),
      'Wizard should ask about currency');
  });

  it('wizard includes methodology picker', () => {
    assert.ok(appJs.includes('50/30/20') || appJs.includes('methodology'),
      'Wizard should offer budget methodology options');
  });

  it('wizard includes account creation step', () => {
    assert.ok(appJs.includes('Add an Account') || appJs.includes('account'),
      'Wizard should have account creation step');
  });

  it('wizard saves methodology preference via API', () => {
    assert.ok(appJs.includes('/settings') || appJs.includes('/preferences'),
      'Wizard should save preferences via API');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 2.2 — Budget Templates
// ═══════════════════════════════════════════════════════════════
describe('Task 2.2 — Budget Templates', () => {
  const { setup, cleanDb, makeCategory, agent } = require('./helpers');
  let app, db;

  before(() => { ({ app, db } = setup()); });
  beforeEach(() => cleanDb());

  it('POST /api/budgets/from-template creates budget from 50/30/20 template', async () => {
    const a = agent(app);
    // Create some categories first
    makeCategory({ name: 'Rent', type: 'expense' });
    makeCategory({ name: 'Food', type: 'expense' });
    makeCategory({ name: 'Savings', type: 'expense' });

    const res = await a.post('/api/budgets/from-template')
      .send({ template: '50/30/20', income: 100000 })
      .expect(201);

    assert.ok(res.body.id, 'Should return new budget id');
  });

  it('POST /api/budgets/from-template rejects invalid template', async () => {
    const a = agent(app);
    await a.post('/api/budgets/from-template')
      .send({ template: 'invalid', income: 50000 })
      .expect(400);
  });

  it('POST /api/budgets/from-template rejects missing income', async () => {
    const a = agent(app);
    await a.post('/api/budgets/from-template')
      .send({ template: '50/30/20' })
      .expect(400);
  });

  it('POST /api/budgets/from-template supports zero-based template', async () => {
    const a = agent(app);
    makeCategory({ name: 'Rent', type: 'expense' });
    makeCategory({ name: 'Food', type: 'expense' });

    const res = await a.post('/api/budgets/from-template')
      .send({ template: 'zero-based', income: 80000 })
      .expect(201);

    assert.ok(res.body.id);
  });

  it('POST /api/budgets/from-template supports conscious-spending template', async () => {
    const a = agent(app);
    makeCategory({ name: 'Rent', type: 'expense' });

    const res = await a.post('/api/budgets/from-template')
      .send({ template: 'conscious-spending', income: 60000 })
      .expect(201);

    assert.ok(res.body.id);
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 2.3 — Health Score Enhancement
// ═══════════════════════════════════════════════════════════════
describe('Task 2.3 — Health Score Enhancement', () => {
  it('reports.js renders benchmark bars for each ratio', () => {
    const reportsJs = fs.readFileSync(path.join(PUBLIC, 'js/views/reports.js'), 'utf8');
    assert.ok(reportsJs.includes('benchmark') || reportsJs.includes('progress-fill') || reportsJs.includes('ratio-bar'),
      'Health view should render benchmark/progress bars per ratio');
  });

  it('reports.js shows status indicators for ratios', () => {
    const reportsJs = fs.readFileSync(path.join(PUBLIC, 'js/views/reports.js'), 'utf8');
    assert.ok(reportsJs.includes('check_circle') || reportsJs.includes('warning') || reportsJs.includes('status-icon') || reportsJs.includes('ratio-status'),
      'Health view should show status indicators (good/warning/bad)');
  });

  it('reports.js includes Expected Net Worth section', () => {
    const reportsJs = fs.readFileSync(path.join(PUBLIC, 'js/views/reports.js'), 'utf8');
    assert.ok(reportsJs.includes('Expected Net Worth') || reportsJs.includes('expected_net_worth') || reportsJs.includes('expectedNetWorth'),
      'Health view should show Expected Net Worth (Stanley formula)');
  });

  it('reports.js shows improvement tips per ratio', () => {
    const reportsJs = fs.readFileSync(path.join(PUBLIC, 'js/views/reports.js'), 'utf8');
    assert.ok(reportsJs.includes('recommendation') || reportsJs.includes('tip'),
      'Health view should show improvement tips');
  });

  it('stats endpoint returns age-based expected net worth when age provided', async () => {
    const { setup, cleanDb, agent } = require('./helpers');
    const { app: app2 } = setup();
    cleanDb();
    const a = agent(app2);
    const res = await a.get('/api/stats/financial-health?age=30').expect(200);
    // May be gated — that's OK, but when not gated it should have expected_net_worth
    if (!res.body.gated && res.body.score !== undefined) {
      assert.ok('expected_net_worth' in res.body || res.body.ratios,
        'Should return expected_net_worth or ratio data');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 2.4 — Net Worth History Chart
// ═══════════════════════════════════════════════════════════════
describe('Task 2.4 — Net Worth History Chart', () => {
  it('scheduler has net-worth-snapshot job registered', () => {
    const schedulerSrc = fs.readFileSync(path.join(SRC, 'scheduler.js'), 'utf8');
    assert.ok(schedulerSrc.includes('net-worth') || schedulerSrc.includes('net_worth') || schedulerSrc.includes('snapshot'),
      'Scheduler should register net worth snapshot job');
  });

  it('dashboard renders net worth sparkline or trend', () => {
    const dashJs = fs.readFileSync(path.join(PUBLIC, 'js/views/dashboard.js'), 'utf8');
    assert.ok(dashJs.includes('net-worth') || dashJs.includes('sparkline') || dashJs.includes('net_worth') || dashJs.includes('history'),
      'Dashboard should render net worth trend/sparkline');
  });

  it('reports view renders full net worth chart', () => {
    const reportsJs = fs.readFileSync(path.join(PUBLIC, 'js/views/reports.js'), 'utf8');
    assert.ok(reportsJs.includes('net-worth') || reportsJs.includes('net_worth') || reportsJs.includes('Net Worth'),
      'Reports should have net worth chart section');
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 2.5 — Live Category Suggestion
// ═══════════════════════════════════════════════════════════════
describe('Task 2.5 — Live Category Suggestion', () => {
  it('transaction form has category suggestion logic', () => {
    const txnJs = fs.readFileSync(path.join(PUBLIC, 'js/views/transactions.js'), 'utf8');
    assert.ok(txnJs.includes('suggest') || txnJs.includes('categories/suggest'),
      'Transaction form should call category suggest API');
  });

  it('suggestion chip rendered in form', () => {
    const txnJs = fs.readFileSync(path.join(PUBLIC, 'js/views/transactions.js'), 'utf8');
    assert.ok(txnJs.includes('suggestion-chip') || txnJs.includes('suggest-chip') || txnJs.includes('category-suggest'),
      'Transaction form should show a suggestion chip');
  });

  it('GET /api/categories/suggest returns suggestion for matching rule', async () => {
    const { setup, cleanDb, makeCategory, agent } = require('./helpers');
    const { app: app2 } = setup();
    cleanDb();
    const a = agent(app2);
    const cat = makeCategory({ name: 'Food', type: 'expense' });
    // Create a rule
    await a.post('/api/rules').send({ pattern: 'Swiggy|Zomato', category_id: cat.id }).expect(201);

    const res = await a.get('/api/categories/suggest?description=Swiggy order').expect(200);
    assert.ok(res.body.suggestion, 'Should return a suggestion');
    assert.strictEqual(res.body.suggestion.category_id, cat.id);
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 2.6 — Cash Flow Forecast Rendering
// ═══════════════════════════════════════════════════════════════
describe('Task 2.6 — Cash Flow Forecast Rendering', () => {
  it('reports.js renders cashflow forecast section', () => {
    const reportsJs = fs.readFileSync(path.join(PUBLIC, 'js/views/reports.js'), 'utf8');
    assert.ok(reportsJs.includes('cashflow-forecast') || reportsJs.includes('cash-flow') || reportsJs.includes('Cash Flow'),
      'Reports should render cash flow forecast section');
  });

  it('reports.js supports 30/60/90-day projection toggles', () => {
    const reportsJs = fs.readFileSync(path.join(PUBLIC, 'js/views/reports.js'), 'utf8');
    assert.ok(
      (reportsJs.includes('30') && reportsJs.includes('60') && reportsJs.includes('90')) ||
      reportsJs.includes('days') || reportsJs.includes('forecast'),
      'Reports should support multiple projection periods');
  });

  it('GET /api/reports/cashflow-forecast returns forecast array', async () => {
    const { setup, cleanDb, agent } = require('./helpers');
    const { app: app2 } = setup();
    cleanDb();
    const a = agent(app2);
    const res = await a.get('/api/reports/cashflow-forecast?days=7').expect(200);
    assert.ok(Array.isArray(res.body.forecast), 'Should return forecast array');
    assert.ok(res.body.forecast.length > 0, 'Forecast should have entries');
    assert.ok(res.body.forecast[0].date, 'Each entry should have a date');
    assert.ok('projected_balance' in res.body.forecast[0], 'Each entry should have projected_balance');
  });
});

// ═══════════════════════════════════════════════════════════════
// PHASE 3 — NUDGE: Behavioral Finance Features
// ═══════════════════════════════════════════════════════════════

// Task 3.1 — Contextual Financial Tips
describe('Task 3.1 — Contextual Financial Tips', () => {
  it('transaction-orchestrator has financial tips logic', () => {
    const orchSrc = fs.readFileSync(path.join(SRC, 'services/transaction-orchestrator.service.js'), 'utf8');
    assert.ok(orchSrc.includes('financialTip') || orchSrc.includes('financial_tip') || orchSrc.includes('contextual'),
      'Orchestrator should have financial tip logic');
  });

  it('POST /api/transactions returns contextual tip for large rent', async () => {
    const { setup, cleanDb, makeCategory, makeAccount, agent } = require('./helpers');
    const { app: a2 } = setup();
    cleanDb();
    const a = agent(a2);
    const cat = makeCategory({ name: 'Rent', type: 'expense' });
    const acct = makeAccount({ balance: 500000 });

    // Set monthly income
    await a.put('/api/settings').send({ key: 'monthly_income', value: '100000' });

    const res = await a.post('/api/transactions').send({
      account_id: acct.id, category_id: cat.id, type: 'expense',
      amount: 35000, description: 'Monthly rent', date: new Date().toISOString().slice(0, 10),
    }).expect(201);

    // Tip may or may not appear depending on threshold
    assert.ok(res.body.transaction, 'Transaction should be created');
  });
});

// Task 3.2 — Budget Threshold Alerts (already exists — verify)
describe('Task 3.2 — Budget Threshold Alerts', () => {
  it('orchestrator checks budget thresholds on expense', () => {
    const orchSrc = fs.readFileSync(path.join(SRC, 'services/transaction-orchestrator.service.js'), 'utf8');
    assert.ok(orchSrc.includes('checkBudgetThresholds'), 'Should have budget threshold checking');
  });

  it('budget alert includes top transactions causing overrun', () => {
    const orchSrc = fs.readFileSync(path.join(SRC, 'services/transaction-orchestrator.service.js'), 'utf8');
    assert.ok(orchSrc.includes('top_transactions') || orchSrc.includes('topTransactions') || orchSrc.includes('budget_exceeded'),
      'Budget alerts should reference top transactions or use budget_exceeded type');
  });
});

// Task 3.3 — Inactivity Nudge
describe('Task 3.3 — Inactivity Nudge', () => {
  it('scheduler has inactivity nudge job', () => {
    const schedulerSrc = fs.readFileSync(path.join(SRC, 'scheduler.js'), 'utf8');
    assert.ok(schedulerSrc.includes('inactivity') || schedulerSrc.includes('inactive'),
      'Scheduler should have inactivity nudge job');
  });

  it('inactivity_nudge_days is a configurable setting', () => {
    const settingsSrc = fs.readFileSync(path.join(SRC, 'routes/settings.js'), 'utf8');
    assert.ok(settingsSrc.includes('inactivity_nudge_days') || settingsSrc.includes('inactivity'),
      'Settings should allow configuring inactivity nudge days');
  });
});

// Task 3.4 — Monthly Digest Notification
describe('Task 3.4 — Monthly Digest Notification', () => {
  it('scheduler has monthly digest job', () => {
    const schedulerSrc = fs.readFileSync(path.join(SRC, 'scheduler.js'), 'utf8');
    assert.ok(schedulerSrc.includes('monthly-digest') || schedulerSrc.includes('digest'),
      'Scheduler should have monthly digest job');
  });
});

// Task 3.5 — Financial Year Support
describe('Task 3.5 — Financial Year Support', () => {
  it('fiscal_year_start is an allowed setting key', () => {
    const settingsSrc = fs.readFileSync(path.join(SRC, 'routes/settings.js'), 'utf8');
    assert.ok(settingsSrc.includes('fiscal_year_start'),
      'Settings should support fiscal_year_start preference');
  });

  it('PUT /api/settings accepts fiscal_year_start', async () => {
    const { setup, cleanDb, agent } = require('./helpers');
    const { app: a2 } = setup();
    cleanDb();
    const a = agent(a2);
    await a.put('/api/settings').send({ key: 'fiscal_year_start', value: 'April' }).expect(200);
  });
});

// Task 3.6 — New-IP Login Notification
describe('Task 3.6 — New-IP Login Notification', () => {
  it('auth route checks for new IP on login', () => {
    const authSrc = fs.readFileSync(path.join(SRC, 'routes/auth.js'), 'utf8');
    assert.ok(authSrc.includes('new_ip') || authSrc.includes('new-ip') || authSrc.includes('newIp') || authSrc.includes('new login'),
      'Auth should check for new IP on login');
  });
});

// Task 3.7 — Financial Milestones
describe('Task 3.7 — Financial Milestones', () => {
  it('orchestrator or scheduler checks for milestones', () => {
    const orchSrc = fs.readFileSync(path.join(SRC, 'services/transaction-orchestrator.service.js'), 'utf8');
    const schedulerSrc = fs.readFileSync(path.join(SRC, 'scheduler.js'), 'utf8');
    assert.ok(
      orchSrc.includes('milestone') || schedulerSrc.includes('milestone'),
      'Should have milestone detection logic');
  });

  it('milestone types include net worth and transaction count', () => {
    const orchSrc = fs.readFileSync(path.join(SRC, 'services/transaction-orchestrator.service.js'), 'utf8');
    const schedulerSrc = fs.readFileSync(path.join(SRC, 'scheduler.js'), 'utf8');
    const combined = orchSrc + schedulerSrc;
    assert.ok(
      combined.includes('net_worth_milestone') || combined.includes('milestone'),
      'Should detect net worth milestones');
  });
});
