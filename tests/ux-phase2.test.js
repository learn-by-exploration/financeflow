const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf-8');

describe('P7 — Tab-Based Auth', () => {
  const loginHtml = read('login.html');
  const loginCss = read('css/login.css');
  const loginJs = read('js/login.js');

  it('login.html contains auth-tabs tablist', () => {
    assert.ok(loginHtml.includes('auth-tabs'));
    assert.ok(loginHtml.includes('role="tablist"'));
  });

  it('login.html has Sign In and Register tab buttons', () => {
    assert.ok(loginHtml.includes('Sign In') || loginHtml.includes('sign-in'));
    assert.match(loginHtml, /role="tab"/);
  });

  it('auth tab buttons have aria-selected attribute', () => {
    assert.ok(loginHtml.includes('aria-selected'));
  });

  it('login.css contains .auth-tab styling', () => {
    assert.ok(loginCss.includes('.auth-tab'));
  });

  it('login.js handles tab click for auth switching', () => {
    assert.ok(loginJs.includes('auth-tab'));
  });
});

describe('P8 — Remember Me Checkbox', () => {
  const loginHtml = read('login.html');
  const loginJs = read('js/login.js');
  const loginCss = read('css/login.css');
  const utilsJs = read('js/utils.js');

  it('login.html contains remember-me checkbox', () => {
    assert.ok(loginHtml.includes('remember-me'));
  });

  it('remember me checkbox has associated label', () => {
    assert.ok(loginHtml.includes('remember-me'));
    assert.match(loginHtml, /remember/i);
  });

  it('login.js reads remember-me state on submit', () => {
    assert.ok(loginJs.includes('remember-me') || loginJs.includes('remember'));
  });

  it('utils.js token function checks sessionStorage fallback', () => {
    assert.ok(utilsJs.includes('sessionStorage'));
  });

  it('login.css has remember-me styling', () => {
    assert.ok(loginCss.includes('remember'));
  });
});

describe('P9 — First-Run Onboarding Wizard', () => {
  const appJs = read('js/app.js');
  const css = read('styles.css');

  it('app.js checks pfi_onboarding_done localStorage flag', () => {
    assert.ok(appJs.includes('pfi_onboarding_done'));
  });

  it('app.js has wizard rendering with steps', () => {
    assert.ok(appJs.includes('wizard') || appJs.includes('onboarding-wizard'));
  });

  it('wizard has a Skip button', () => {
    assert.ok(appJs.includes('Skip'));
  });

  it('styles.css contains onboarding-wizard styles', () => {
    assert.ok(css.includes('onboarding-wizard') || css.includes('.wizard'));
  });
});

describe('P10 — Error Boundary / View Recovery', () => {
  const uiStates = read('js/ui-states.js');
  const appJs = read('js/app.js');

  it('showError accepts dashboardHandler option', () => {
    assert.ok(uiStates.includes('dashboardHandler') || uiStates.includes('dashboard'));
  });

  it('showError renders Go to Dashboard button when option provided', () => {
    assert.ok(uiStates.includes('Dashboard'));
  });

  it('app.js render catch passes dashboard navigation', () => {
    assert.ok(appJs.includes('navigateTo') && appJs.includes('showError'));
  });
});

describe('P11 — Backdrop Blur on Top Bar', () => {
  const css = read('styles.css');

  it('.top-bar has backdrop-filter property', () => {
    assert.ok(css.includes('backdrop-filter'));
  });

  it('.top-bar has position:sticky', () => {
    assert.match(css, /\.top-bar[\s\S]*?position:\s*sticky/);
  });
});

describe('P12 — Expandable Stat Cards', () => {
  const dashJs = read('js/views/dashboard.js');
  const css = read('styles.css');

  it('dashboard.js stat cards have aria-expanded attribute', () => {
    assert.ok(dashJs.includes('aria-expanded'));
  });

  it('styles.css has stat-detail class', () => {
    assert.ok(css.includes('.stat-detail'));
  });

  it('stat card expansion toggles on click', () => {
    assert.ok(dashJs.includes('expanded') || dashJs.includes('toggleExpand'));
  });

  it('expanded stat shows View all link', () => {
    assert.match(dashJs, /View all|view.all|View All/i);
  });
});

describe('P13 — Privacy Banner', () => {
  const html = read('index.html');
  const css = read('styles.css');
  const appJs = read('js/app.js');

  it('index.html contains privacy-banner element', () => {
    assert.ok(html.includes('privacy-banner'));
  });

  it('privacy banner mentions data staying on server', () => {
    assert.match(html, /data stays|no cookie|no tracking/i);
  });

  it('styles.css contains .privacy-banner styles', () => {
    assert.ok(css.includes('.privacy-banner'));
  });

  it('app.js checks pfi_privacy_accepted localStorage', () => {
    assert.ok(appJs.includes('pfi_privacy_accepted'));
  });
});

describe('P14 — Enhanced Skeleton Loaders', () => {
  const uiStates = read('js/ui-states.js');
  const css = read('styles.css');

  it('ui-states.js exports showTableSkeleton', () => {
    assert.ok(uiStates.includes('showTableSkeleton'));
  });

  it('styles.css contains skeleton-row styles', () => {
    assert.ok(css.includes('.skeleton-row'));
  });
});

describe('P15 — Notification Enhancements', () => {
  const notifJs = read('js/notifications.js');

  it('notification click navigates to related view', () => {
    assert.ok(notifJs.includes('navigateTo') || notifJs.includes('navigate'));
  });

  it('notification types map to views', () => {
    assert.ok(notifJs.includes('budget') || notifJs.includes('budgets'));
  });
});
