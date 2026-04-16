// tests/frontend-app-deep.test.js — Deep coverage: app.js SPA + sw.js service worker
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const appSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'app.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

// ════════════════════════════════════════════════════════════════
// APP.JS — Auth Guard
// ════════════════════════════════════════════════════════════════

describe('app.js — Auth Guard', () => {
  it('redirects to login if no token', () => {
    assert.ok(appSrc.includes("if (!getToken())"));
    assert.ok(appSrc.includes("window.location.href = '/login.html'"));
  });

  it('imports getToken from utils', () => {
    assert.ok(appSrc.includes('getToken'));
    assert.ok(appSrc.includes("from './utils.js'"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Theme System
// ════════════════════════════════════════════════════════════════

describe('app.js — Theme System', () => {
  it('defines initTheme function', () => {
    assert.ok(appSrc.includes('function initTheme()'));
  });

  it('defines toggleTheme function', () => {
    assert.ok(appSrc.includes('function toggleTheme()'));
  });

  it('defines updateThemeButton function', () => {
    assert.ok(appSrc.includes('function updateThemeButton()'));
  });

  it('reads theme from localStorage (pfi_theme)', () => {
    assert.ok(appSrc.includes("localStorage.getItem('pfi_theme')"));
  });

  it('sets data-theme attribute on documentElement', () => {
    assert.ok(appSrc.includes("document.documentElement.setAttribute('data-theme'"));
  });

  it('saves theme to localStorage on toggle', () => {
    assert.ok(appSrc.includes("localStorage.setItem('pfi_theme'"));
  });

  it('toggles between light and dark', () => {
    assert.ok(appSrc.includes("'light'"));
    assert.ok(appSrc.includes("'dark'"));
  });

  it('updates button icon: light_mode / dark_mode', () => {
    assert.ok(appSrc.includes("'light_mode'"));
    assert.ok(appSrc.includes("'dark_mode'"));
  });

  it('updates aria-label on theme button', () => {
    assert.ok(appSrc.includes("btn.setAttribute('aria-label'"));
  });

  it('calls initTheme on load', () => {
    assert.ok(appSrc.includes('initTheme()'));
  });

  it('binds click to theme-toggle button', () => {
    assert.ok(appSrc.includes("document.getElementById('theme-toggle')"));
    assert.ok(appSrc.includes("addEventListener('click', toggleTheme)"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — View Registry
// ════════════════════════════════════════════════════════════════

describe('app.js — View Registry', () => {
  const expectedViews = [
    'dashboard', 'accounts', 'transactions', 'categories', 'budgets',
    'subscriptions', 'goals', 'groups', 'splits', 'health', 'reports',
    'rules', 'settings', 'search', 'insights', 'recurring', 'export',
    'tags', 'calendar', 'calculators', 'challenges', 'automation',
  ];

  it('defines views object', () => {
    assert.ok(appSrc.includes('const views = {'));
  });

  for (const view of expectedViews) {
    it(`registers "${view}" in view map`, () => {
      assert.ok(appSrc.includes(`${view}:`), `Missing view: ${view}`);
    });
  }

  it('uses dynamic import() for lazy loading', () => {
    const imports = appSrc.match(/import\('\.\/views\//g) || [];
    assert.ok(imports.length >= 18, `Only ${imports.length} lazy imports found`);
  });

  it('each loader returns render function via .then(m => m.render*)', () => {
    const loaders = appSrc.match(/\.then\(m\s*=>\s*m\.render\w+\)/g) || [];
    assert.ok(loaders.length >= 18, `Only ${loaders.length} render loaders found`);
  });

  it('reports.js is reused for both "health" and "reports" views', () => {
    assert.ok(appSrc.includes("health:") && appSrc.includes("reports:"));
    const healthLine = appSrc.match(/health:\s+\(\)\s*=>\s*import\('\.\/views\/reports\.js'\)/);
    assert.ok(healthLine, 'health view should import from reports.js');
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Navigation
// ════════════════════════════════════════════════════════════════

describe('app.js — Navigation', () => {
  it('defines navigateTo function', () => {
    assert.ok(appSrc.includes('function navigateTo(view'));
  });

  it('navigateTo pushes history state', () => {
    assert.ok(appSrc.includes("history.pushState("));
  });

  it('navigateTo updates hash URL to /#/view', () => {
    assert.ok(appSrc.includes("`/#/${view}`"));
  });

  it('navigateTo sets active nav-item class', () => {
    assert.ok(appSrc.includes("classList.add('active')"));
  });

  it('navigateTo removes active from all nav items first', () => {
    assert.ok(appSrc.includes("classList.remove('active')"));
  });

  it('navigateTo closes mobile sidebar', () => {
    assert.ok(appSrc.includes("sidebar.classList.remove('open')"));
  });

  it('navigateTo updates breadcrumb', () => {
    assert.ok(appSrc.includes("getElementById('breadcrumb')"));
    assert.ok(appSrc.includes("aria-current"));
  });

  it('navigateTo calls render()', () => {
    assert.ok(appSrc.includes('render()'));
  });

  it('popstate listener handles browser back/forward', () => {
    assert.ok(appSrc.includes("window.addEventListener('popstate'"));
    assert.ok(appSrc.includes('navigateTo(e.state.view, false)'));
  });

  it('reads initial view from hash on load', () => {
    assert.ok(appSrc.includes("location.hash.replace('#/', '')"));
  });

  it('replaces history state on init', () => {
    assert.ok(appSrc.includes('history.replaceState'));
  });

  it('updates bottom nav active state', () => {
    assert.ok(appSrc.includes('updateBottomNavActive'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Render System
// ════════════════════════════════════════════════════════════════

describe('app.js — Render Dispatcher', () => {
  it('defines async render function', () => {
    assert.ok(appSrc.includes('async function render()'));
  });

  it('uses generation counter to prevent stale renders', () => {
    assert.ok(appSrc.includes('_renderGen'));
    assert.ok(appSrc.includes('thisRender !== _renderGen'));
  });

  it('clears container before rendering', () => {
    assert.ok(appSrc.includes("container.innerHTML = ''"));
  });

  it('calls showLoading during fetch', () => {
    assert.ok(appSrc.includes('showLoading(container)'));
  });

  it('handles render error with showError + retry', () => {
    assert.ok(appSrc.includes("showError(container"));
    assert.ok(appSrc.includes('retryHandler'));
  });

  it('error handler offers dashboard navigation fallback', () => {
    assert.ok(appSrc.includes('dashboardHandler'));
  });

  it('passes search query for search view only', () => {
    assert.ok(appSrc.includes("currentView === 'search'"));
    assert.ok(appSrc.includes('renderFn(container, currentSearchQuery)'));
  });

  it('respects prefers-reduced-motion when animating view change', () => {
    assert.ok(appSrc.includes('prefers-reduced-motion'));
  });

  it('announces view change to screen readers', () => {
    assert.ok(appSrc.includes('announceToScreenReader'));
  });

  it('focuses main heading after view load (a11y)', () => {
    assert.ok(appSrc.includes('focusMainHeading'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Onboarding Wizard
// ════════════════════════════════════════════════════════════════

describe('app.js — Onboarding', () => {
  it('defines showOnboardingWizard', () => {
    assert.ok(appSrc.includes('function showOnboardingWizard'));
  });

  it('defines renderOnboarding fallback', () => {
    assert.ok(appSrc.includes('function renderOnboarding'));
  });

  it('reads pfi_onboarding_done from localStorage', () => {
    assert.ok(appSrc.includes("localStorage.getItem('pfi_onboarding_done')"));
  });

  it('wizard has 4 steps (dots)', () => {
    assert.ok(appSrc.includes("step === 1"));
    assert.ok(appSrc.includes("step === 2"));
    assert.ok(appSrc.includes("step === 3"));
    assert.ok(appSrc.includes("step === 4"));
  });

  it('step 1: currency + income collection', () => {
    assert.ok(appSrc.includes('wiz-currency'));
    assert.ok(appSrc.includes('wiz-income'));
  });

  it('supports 9 currencies', () => {
    const currencies = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'SGD', 'AED'];
    for (const c of currencies) {
      assert.ok(appSrc.includes(`'${c}'`), `Missing currency: ${c}`);
    }
  });

  it('step 2: budget methodology (3 methods)', () => {
    assert.ok(appSrc.includes("'50/30/20'"));
    assert.ok(appSrc.includes("'zero-based'"));
    assert.ok(appSrc.includes("'just-track'"));
  });

  it('step 3: first account creation', () => {
    assert.ok(appSrc.includes('Add an Account'));
  });

  it('step 4: optional extras (budget, group, goal)', () => {
    assert.ok(appSrc.includes('Create a Budget'));
    assert.ok(appSrc.includes('Create a Group'));
    assert.ok(appSrc.includes('Set a Goal'));
  });

  it('skipAll sets onboarding done and re-renders', () => {
    assert.ok(appSrc.includes("localStorage.setItem('pfi_onboarding_done', '1')"));
    assert.ok(appSrc.includes('skipAll'));
  });

  it('saves wizard preferences via Api.put /settings', () => {
    assert.ok(appSrc.includes("Api.put('/settings'"));
  });

  it('wizard has dot indicators', () => {
    assert.ok(appSrc.includes('wizard-dots'));
    assert.ok(appSrc.includes('wizard-dot'));
  });

  it('handles new user with 0 accounts → shows onboarding', () => {
    assert.ok(appSrc.includes("accounts.length === 0"));
    assert.ok(appSrc.includes('renderOnboarding(container)'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Keyboard Shortcuts
// ════════════════════════════════════════════════════════════════

describe('app.js — Keyboard Shortcuts', () => {
  it('defines defaultShortcuts', () => {
    assert.ok(appSrc.includes('defaultShortcuts'));
  });

  it('reads custom shortcuts from pfi_shortcuts', () => {
    assert.ok(appSrc.includes("localStorage.getItem('pfi_shortcuts')"));
  });

  it('has Escape to close modal', () => {
    assert.ok(appSrc.includes("e.key === 'Escape'"));
    assert.ok(appSrc.includes('closeModal()'));
  });

  it('has N for quick-add', () => {
    assert.ok(appSrc.includes("e.key === 'n'"));
    assert.ok(appSrc.includes('showQuickAdd'));
  });

  it('has ? for shortcuts help', () => {
    assert.ok(appSrc.includes("e.key === '?'"));
    assert.ok(appSrc.includes('showShortcutsHelp'));
  });

  it('has Ctrl+K / slash to focus search', () => {
    assert.ok(appSrc.includes("e.key === 'k'"));
    assert.ok(appSrc.includes("e.ctrlKey || e.metaKey"));
    assert.ok(appSrc.includes("e.key === '/'"));
  });

  it('has number keys 1-5 for navigation', () => {
    for (let i = 1; i <= 5; i++) {
      assert.ok(appSrc.includes(`'${i}'`), `Missing number key ${i}`);
    }
  });

  it('number key map: 1=dashboard, 2=txn, 3=accounts, 4=budgets, 5=goals', () => {
    assert.ok(appSrc.includes("'1': 'dashboard'"));
    assert.ok(appSrc.includes("'2': 'transactions'"));
    assert.ok(appSrc.includes("'3': 'accounts'"));
    assert.ok(appSrc.includes("'4': 'budgets'"));
    assert.ok(appSrc.includes("'5': 'goals'"));
  });

  it('has M for multi-select toggle in transactions', () => {
    assert.ok(appSrc.includes("e.key === 'm'"));
    assert.ok(appSrc.includes("currentView === 'transactions'"));
    assert.ok(appSrc.includes('toggle-multi-select'));
  });

  it('skips shortcuts when typing in inputs/textareas/selects', () => {
    assert.ok(appSrc.includes("e.target.tagName === 'INPUT'"));
    assert.ok(appSrc.includes("e.target.tagName === 'TEXTAREA'"));
    assert.ok(appSrc.includes("e.target.tagName === 'SELECT'"));
    assert.ok(appSrc.includes('e.target.isContentEditable'));
  });

  it('modal tab trap cycles focus between first and last focusable', () => {
    assert.ok(appSrc.includes("e.key === 'Tab'"));
    assert.ok(appSrc.includes('first'));
    assert.ok(appSrc.includes('last'));
    assert.ok(appSrc.includes('e.shiftKey'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Vim Mode
// ════════════════════════════════════════════════════════════════

describe('app.js — Vim Navigation', () => {
  it('reads pfi_vim from localStorage', () => {
    assert.ok(appSrc.includes("localStorage.getItem('pfi_vim')"));
  });

  it('j key moves focus down the list', () => {
    assert.ok(appSrc.includes("e.key === 'j'"));
    assert.ok(appSrc.includes('moveFocusInList(1)'));
  });

  it('k key moves focus up the list', () => {
    assert.ok(appSrc.includes("e.key === 'k'"));
    assert.ok(appSrc.includes('moveFocusInList(-1)'));
  });

  it('moveFocusInList finds focusable elements', () => {
    assert.ok(appSrc.includes('function moveFocusInList'));
    assert.ok(appSrc.includes('querySelectorAll'));
  });

  it('focus bounds-checked (no crash at start/end)', () => {
    assert.ok(appSrc.includes('idx >= 0 && idx < items.length'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Search
// ════════════════════════════════════════════════════════════════

describe('app.js — Global Search', () => {
  it('binds to global-search input', () => {
    assert.ok(appSrc.includes("document.getElementById('global-search')"));
  });

  it('uses 300ms debounce on input', () => {
    assert.ok(appSrc.includes('searchTimeout'));
    assert.ok(appSrc.includes('setTimeout'));
    assert.ok(appSrc.includes('300'));
  });

  it('clears debounce on each keystroke', () => {
    assert.ok(appSrc.includes('clearTimeout(searchTimeout)'));
  });

  it('handles Enter key for immediate search', () => {
    assert.ok(appSrc.includes("e.key === 'Enter'"));
  });

  it('handles Escape key to clear and blur', () => {
    assert.ok(appSrc.includes("searchInput.value = ''"));
    assert.ok(appSrc.includes('searchInput.blur()'));
  });

  it('stores viewBeforeSearch to restore on clear', () => {
    assert.ok(appSrc.includes('viewBeforeSearch'));
  });

  it('trims search input', () => {
    assert.ok(appSrc.includes('searchInput.value.trim()'));
  });

  it('requires non-empty query', () => {
    assert.ok(appSrc.includes('q.length > 0'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Quick Add (FAB)
// ════════════════════════════════════════════════════════════════

describe('app.js — Quick Add Transaction', () => {
  it('binds to fab-add button', () => {
    assert.ok(appSrc.includes("document.getElementById('fab-add')"));
  });

  it('defines showQuickAdd function', () => {
    assert.ok(appSrc.includes('async function showQuickAdd'));
  });

  it('loads accounts before showing form', () => {
    assert.ok(appSrc.includes("Api.get('/accounts')"));
  });

  it('shows info toast and redirects if no accounts', () => {
    assert.ok(appSrc.includes("toast('Add an account first', 'info')"));
    assert.ok(appSrc.includes("navigateTo('accounts')"));
  });

  it('has NLP quick capture input', () => {
    assert.ok(appSrc.includes('quick-capture-input'));
    assert.ok(appSrc.includes('parseQuickEntry'));
  });

  it('posts to /transactions endpoint', () => {
    assert.ok(appSrc.includes("Api.post('/transactions'"));
  });

  it('uses withLoading to prevent double-submit', () => {
    assert.ok(appSrc.includes('withLoading(submitBtn'));
  });

  it('shows success toast and closes modal', () => {
    assert.ok(appSrc.includes("toast('Transaction added', 'success')"));
    assert.ok(appSrc.includes('closeModal()'));
  });

  it('shows inline error in form on failure', () => {
    assert.ok(appSrc.includes('modal-error'));
    assert.ok(appSrc.includes('errDiv.textContent = err.message'));
  });

  it('re-renders dashboard or transactions after add', () => {
    assert.ok(appSrc.includes("currentView === 'dashboard' || currentView === 'transactions'"));
  });

  it('form has all required fields: description, amount, type, account, date', () => {
    assert.ok(appSrc.includes("name: 'description'"));
    assert.ok(appSrc.includes("name: 'amount'"));
    assert.ok(appSrc.includes("name: 'type'"));
    assert.ok(appSrc.includes("name: 'account_id'"));
    assert.ok(appSrc.includes("name: 'date'"));
  });

  it('defaults to today date', () => {
    assert.ok(appSrc.includes('new Date().toISOString().slice(0, 10)'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — NLP Parser
// ════════════════════════════════════════════════════════════════

describe('app.js — NLP Quick Capture Parser', () => {
  it('defines parseQuickEntry function', () => {
    assert.ok(appSrc.includes('function parseQuickEntry(text)'));
  });

  it('extracts amount from text', () => {
    assert.ok(appSrc.includes('amountMatch'));
  });

  it('detects "income" keyword for type', () => {
    assert.ok(appSrc.includes('/\\bincome\\b/i'));
  });

  it('parses "today" to current date', () => {
    assert.ok(appSrc.includes('/\\btoday\\b/i'));
  });

  it('parses "yesterday" to previous day', () => {
    assert.ok(appSrc.includes('/\\byesterday\\b/i'));
    assert.ok(appSrc.includes('d.setDate(d.getDate() - 1)'));
  });

  it('parses ISO date format (YYYY-MM-DD)', () => {
    assert.ok(appSrc.includes('\\d{4}-\\d{2}-\\d{2}'));
  });

  it('extracts category keywords', () => {
    const keywords = ['food', 'transport', 'shopping', 'bills', 'entertainment', 'health', 'education', 'salary'];
    for (const kw of keywords) {
      assert.ok(appSrc.includes(`'${kw}'`), `Missing category keyword: ${kw}`);
    }
  });

  it('builds description from remaining words', () => {
    assert.ok(appSrc.includes('filter(p =>'));
    assert.ok(appSrc.includes(".join(' ')"));
  });

  it('returns empty result for falsy input', () => {
    assert.ok(appSrc.includes('if (!text) return result'));
  });

  it('defaults type to expense', () => {
    assert.ok(appSrc.includes("type: 'expense'"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Mobile Navigation
// ════════════════════════════════════════════════════════════════

describe('app.js — Mobile Navigation', () => {
  it('creates sidebar backdrop', () => {
    assert.ok(appSrc.includes("'sidebar-backdrop'"));
  });

  it('toggles sidebar open on menu click', () => {
    assert.ok(appSrc.includes("sidebar.classList.toggle('open')"));
  });

  it('clicks backdrop closes sidebar', () => {
    assert.ok(appSrc.includes('backdrop.addEventListener'));
  });

  it('bottom nav items with data-view', () => {
    assert.ok(appSrc.includes('.bottom-nav-item'));
    assert.ok(appSrc.includes('item.dataset.view'));
  });

  it('bottom sheet for "more" items', () => {
    assert.ok(appSrc.includes('toggleBottomSheet'));
  });

  it('bottom sheet populates 16 more views', () => {
    const moreItems = appSrc.match(/\{ view: '/g) || [];
    assert.ok(moreItems.length >= 16, `Only ${moreItems.length} bottom sheet items`);
  });

  it('bottom sheet closes on overlay click', () => {
    assert.ok(appSrc.includes('bottom-sheet-overlay'));
  });

  it('updates active bottom nav item', () => {
    assert.ok(appSrc.includes('function updateBottomNavActive'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Sidebar
// ════════════════════════════════════════════════════════════════

describe('app.js — Sidebar Collapse', () => {
  it('reads pfi_sidebar from localStorage', () => {
    assert.ok(appSrc.includes("localStorage.getItem('pfi_sidebar')"));
  });

  it('supports collapsed state class', () => {
    assert.ok(appSrc.includes("sidebar.classList.add('collapsed')"));
  });

  it('saves collapse state to localStorage', () => {
    assert.ok(appSrc.includes("localStorage.setItem('pfi_sidebar'"));
  });

  it('updates aria-expanded on collapse toggle', () => {
    assert.ok(appSrc.includes("collapseBtn.setAttribute('aria-expanded'"));
  });

  it('swaps icon chevron_left/chevron_right', () => {
    assert.ok(appSrc.includes("'chevron_left'"));
    assert.ok(appSrc.includes("'chevron_right'"));
  });

  it('home logo navigates to dashboard', () => {
    assert.ok(appSrc.includes("getElementById('sidebar-home')"));
    assert.ok(appSrc.includes("navigateTo('dashboard')"));
  });

  it('sidebar home supports keyboard (Enter/Space)', () => {
    assert.ok(appSrc.includes("e.key === 'Enter' || e.key === ' '"));
  });

  it('nav groups support collapse/expand', () => {
    assert.ok(appSrc.includes('.nav-group-header'));
    assert.ok(appSrc.includes("classList.toggle('collapsed')"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Branding
// ════════════════════════════════════════════════════════════════

describe('app.js — Branding', () => {
  it('fetches /api/branding', () => {
    assert.ok(appSrc.includes("fetch('/api/branding')"));
  });

  it('updates document.title with brand name', () => {
    assert.ok(appSrc.includes('document.title = brand.name'));
  });

  it('updates logo with brand name', () => {
    assert.ok(appSrc.includes("querySelector('.logo')"));
  });

  it('applies brand color to --accent CSS variable', () => {
    assert.ok(appSrc.includes("'--accent'"));
    assert.ok(appSrc.includes('brand.color'));
  });

  it('updates meta theme-color', () => {
    assert.ok(appSrc.includes("meta[name=\"theme-color\"]"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Demo Mode
// ════════════════════════════════════════════════════════════════

describe('app.js — Demo Mode', () => {
  it('checks /api/demo/status', () => {
    assert.ok(appSrc.includes("fetch('/api/demo/status')"));
  });

  it('shows demo banner when in demo mode', () => {
    assert.ok(appSrc.includes("getElementById('demo-banner')"));
    assert.ok(appSrc.includes("classList.remove('hidden')"));
  });

  it('has demo-reset-link for data reset', () => {
    assert.ok(appSrc.includes("getElementById('demo-reset-link')"));
  });

  it('calls Api.post /demo/reset', () => {
    assert.ok(appSrc.includes("Api.post('/demo/reset')"));
  });

  it('shows success toast and reloads on reset', () => {
    assert.ok(appSrc.includes("toast('Demo data reset!', 'success')"));
    assert.ok(appSrc.includes('location.reload()'));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Offline Indicator
// ════════════════════════════════════════════════════════════════

describe('app.js — Offline Indicator', () => {
  it('binds to offline-banner element', () => {
    assert.ok(appSrc.includes("getElementById('offline-banner')"));
  });

  it('pings /api/version for connectivity check', () => {
    assert.ok(appSrc.includes("fetch('/api/version'"));
  });

  it('uses no-store cache for probe', () => {
    assert.ok(appSrc.includes("cache: 'no-store'"));
  });

  it('hides banner on connectivity success', () => {
    assert.ok(appSrc.includes("offlineBanner.classList.add('hidden')"));
  });

  it('shows banner on connectivity failure', () => {
    assert.ok(appSrc.includes("offlineBanner.classList.remove('hidden')"));
  });

  it('listens for offline/online events', () => {
    assert.ok(appSrc.includes("window.addEventListener('offline'"));
    assert.ok(appSrc.includes("window.addEventListener('online'"));
  });

  it('shows toast on reconnection', () => {
    assert.ok(appSrc.includes("toast('Back online', 'success')"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Accessibility
// ════════════════════════════════════════════════════════════════

describe('app.js — Accessibility', () => {
  it('defines announceToScreenReader function', () => {
    assert.ok(appSrc.includes('function announceToScreenReader'));
  });

  it('uses a11y-announce live region', () => {
    assert.ok(appSrc.includes("getElementById('a11y-announce')"));
  });

  it('clears region before setting (for re-announce)', () => {
    assert.ok(appSrc.includes("region.textContent = ''"));
    assert.ok(appSrc.includes('setTimeout'));
  });

  it('defines focusMainHeading function', () => {
    assert.ok(appSrc.includes('function focusMainHeading'));
  });

  it('focuses h2 or h3 heading', () => {
    assert.ok(appSrc.includes("querySelector('h2, h3')"));
  });

  it('sets tabindex=-1 on heading for programmatic focus', () => {
    assert.ok(appSrc.includes("setAttribute('tabindex', '-1')"));
  });

  it('does not steal focus from search input', () => {
    assert.ok(appSrc.includes("document.activeElement.id === 'global-search'"));
  });

  it('text-size preference from pfi_text_size', () => {
    assert.ok(appSrc.includes("localStorage.getItem('pfi_text_size')"));
    assert.ok(appSrc.includes("data-text-size"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Logout
// ════════════════════════════════════════════════════════════════

describe('app.js — Logout', () => {
  it('binds to btn-logout', () => {
    assert.ok(appSrc.includes("document.getElementById('btn-logout')"));
  });

  it('calls /auth/logout api', () => {
    assert.ok(appSrc.includes('/auth/logout'));
  });

  it('clears token from localStorage and sessionStorage', () => {
    assert.ok(appSrc.includes("localStorage.removeItem('pfi_token')"));
    assert.ok(appSrc.includes("sessionStorage.removeItem('pfi_token')"));
  });

  it('redirects to login page', () => {
    assert.ok(appSrc.includes("window.location.href = '/login.html'"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Pending Sync (P25)
// ════════════════════════════════════════════════════════════════

describe('app.js — Pending Sync Indicator', () => {
  it('checks for serviceWorker support', () => {
    assert.ok(appSrc.includes("'serviceWorker' in navigator"));
  });

  it('listens for pending-sync messages', () => {
    assert.ok(appSrc.includes("event.data.type === 'pending-sync'"));
  });

  it('updates pending-sync indicator element', () => {
    assert.ok(appSrc.includes("getElementById('pending-sync')"));
  });

  it('shows/hides based on count', () => {
    assert.ok(appSrc.includes("count > 0 ? 'flex' : 'none'"));
  });

  it('pluralizes "changes" label', () => {
    assert.ok(appSrc.includes("count > 1 ? 's' : ''"));
  });
});

// ════════════════════════════════════════════════════════════════
// APP.JS — Shortcuts Help Modal
// ════════════════════════════════════════════════════════════════

describe('app.js — Shortcuts Help Modal', () => {
  it('defines showShortcutsHelp function', () => {
    assert.ok(appSrc.includes('function showShortcutsHelp()'));
  });

  it('lists all 10 shortcuts', () => {
    const shortcuts = ['?', 'N', 'D', 'T', 'B', 'G', '1-5', 'Ctrl+K', 'M', 'Esc'];
    for (const s of shortcuts) {
      assert.ok(appSrc.includes(s), `Missing shortcut listing: ${s}`);
    }
  });

  it('shows shortcuts in modal via openModal', () => {
    assert.ok(appSrc.includes('openModal(content)'));
  });

  it('has close button', () => {
    assert.ok(appSrc.includes("textContent: 'Close', onClick: closeModal"));
  });

  it('uses kbd element for key display', () => {
    assert.ok(appSrc.includes("'kbd'"));
  });
});

// ════════════════════════════════════════════════════════════════
// SERVICE WORKER — Cache Management
// ════════════════════════════════════════════════════════════════

describe('sw.js — Cache Management', () => {
  it('defines CACHE_NAME with version', () => {
    assert.ok(swSrc.includes('const CACHE_NAME ='));
    assert.ok(swSrc.match(/financeflow-v\d+\.\d+\.\d+/));
  });

  it('lists STATIC_ASSETS array', () => {
    assert.ok(swSrc.includes('const STATIC_ASSETS'));
  });

  it('caches root path /', () => {
    assert.ok(swSrc.includes("'/'"));
  });

  it('caches index.html', () => {
    assert.ok(swSrc.includes("'/index.html'"));
  });

  it('caches all core JS files', () => {
    const coreFiles = ['/js/app.js', '/js/utils.js', '/js/login.js', '/js/charts.js',
      '/js/notifications.js', '/js/ui-states.js', '/js/form-validator.js', '/js/pagination.js'];
    for (const f of coreFiles) {
      assert.ok(swSrc.includes(`'${f}'`), `Missing SW cache: ${f}`);
    }
  });

  it('caches all view files', () => {
    const viewFiles = ['dashboard', 'transactions', 'accounts', 'budgets', 'goals',
      'settings', 'search', 'reports', 'tags', 'categories', 'subscriptions',
      'groups', 'splits', 'recurring', 'insights', 'rules', 'export',
      'calendar', 'calculators', 'challenges', 'automation'];
    for (const v of viewFiles) {
      assert.ok(swSrc.includes(`/js/views/${v}.js`), `Missing view in SW cache: ${v}`);
    }
  });

  it('caches Chart.js vendor file', () => {
    assert.ok(swSrc.includes('/js/vendor/chart.min.js'));
  });

  it('caches manifest.json', () => {
    assert.ok(swSrc.includes("'/manifest.json'"));
  });

  it('caches CSS files', () => {
    assert.ok(swSrc.includes("'/styles.css'"));
    assert.ok(swSrc.includes("'/css/login.css'"));
    assert.ok(swSrc.includes("'/css/landing.css'"));
  });

  it('caches landing.html and login.html', () => {
    assert.ok(swSrc.includes("'/landing.html'"));
    assert.ok(swSrc.includes("'/login.html'"));
  });
});

// ════════════════════════════════════════════════════════════════
// SERVICE WORKER — Install + Activate
// ════════════════════════════════════════════════════════════════

describe('sw.js — Install & Activate', () => {
  it('listens for install event', () => {
    assert.ok(swSrc.includes("self.addEventListener('install'"));
  });

  it('caches all static assets on install', () => {
    assert.ok(swSrc.includes('cache.addAll(STATIC_ASSETS)'));
  });

  it('calls skipWaiting on install', () => {
    assert.ok(swSrc.includes('self.skipWaiting()'));
  });

  it('listens for activate event', () => {
    assert.ok(swSrc.includes("self.addEventListener('activate'"));
  });

  it('deletes old caches on activate', () => {
    assert.ok(swSrc.includes('caches.keys()'));
    assert.ok(swSrc.includes('caches.delete(k)'));
  });

  it('filters out current cache from deletion', () => {
    assert.ok(swSrc.includes('k !== CACHE_NAME'));
  });

  it('calls clients.claim on activate', () => {
    assert.ok(swSrc.includes('self.clients.claim()'));
  });
});

// ════════════════════════════════════════════════════════════════
// SERVICE WORKER — Fetch Strategy
// ════════════════════════════════════════════════════════════════

describe('sw.js — Fetch Strategy', () => {
  it('listens for fetch event', () => {
    assert.ok(swSrc.includes("self.addEventListener('fetch'"));
  });

  it('detects API routes via pathname', () => {
    assert.ok(swSrc.includes("url.pathname.startsWith('/api/')"));
  });

  it('network-first for API GET requests', () => {
    assert.ok(swSrc.includes("method === 'GET'"));
    assert.ok(swSrc.includes('fetch(event.request)'));
  });

  it('skips queuing for auth requests', () => {
    assert.ok(swSrc.includes("url.pathname.startsWith('/api/auth/')"));
  });

  it('cache-first for static assets', () => {
    assert.ok(swSrc.includes('caches.match(event.request)'));
  });

  it('network fallback for cache miss on static', () => {
    assert.ok(swSrc.includes('fetch(event.request).then'));
  });

  it('caches successful GET responses on the fly', () => {
    assert.ok(swSrc.includes("event.request.method === 'GET'"));
    assert.ok(swSrc.includes('cache.put(event.request, clone)'));
  });

  it('offline navigation fallback to index.html', () => {
    assert.ok(swSrc.includes("event.request.mode === 'navigate'"));
    assert.ok(swSrc.includes("caches.match('/index.html')"));
  });
});

// ════════════════════════════════════════════════════════════════
// SERVICE WORKER — Offline Queue (P25)
// ════════════════════════════════════════════════════════════════

describe('sw.js — Offline Mutation Queue', () => {
  it('defines DB_NAME constant', () => {
    assert.ok(swSrc.includes("const DB_NAME = 'financeflow-offline'"));
  });

  it('defines STORE_NAME constant', () => {
    assert.ok(swSrc.includes("const STORE_NAME = 'offlineQueue'"));
  });

  it('defines openOfflineDB function', () => {
    assert.ok(swSrc.includes('function openOfflineDB()'));
  });

  it('creates object store with auto-increment on upgrade', () => {
    assert.ok(swSrc.includes("keyPath: 'id', autoIncrement: true"));
  });

  it('defines queueMutation function', () => {
    assert.ok(swSrc.includes('async function queueMutation'));
  });

  it('queueMutation stores method, url, body, authToken, timestamp', () => {
    assert.ok(swSrc.includes('method, url, body, authToken'));
    assert.ok(swSrc.includes('timestamp: Date.now()'));
  });

  it('defines replayQueue function', () => {
    assert.ok(swSrc.includes('async function replayQueue()'));
  });

  it('replay sends original auth token in X-Session-Token', () => {
    assert.ok(swSrc.includes("'X-Session-Token'"));
  });

  it('replay deletes items on success', () => {
    assert.ok(swSrc.includes('.delete(item.id)'));
  });

  it('replay keeps items on failure (retry later)', () => {
    assert.ok(swSrc.includes('catch { /* keep in queue'));
  });

  it('notifyClients sends pending-sync message', () => {
    assert.ok(swSrc.includes('function notifyClients'));
    assert.ok(swSrc.includes("type: 'pending-sync'"));
  });

  it('handles sync event for replay-mutations tag', () => {
    assert.ok(swSrc.includes("self.addEventListener('sync'"));
    assert.ok(swSrc.includes("event.tag === 'replay-mutations'"));
  });

  it('mutations queued when fetch fails (202 response)', () => {
    assert.ok(swSrc.includes('status: 202'));
    assert.ok(swSrc.includes('queued: true'));
  });

  it('clones request before reading body', () => {
    assert.ok(swSrc.includes('event.request.clone()'));
  });
});

// ════════════════════════════════════════════════════════════════
// INDEX.HTML — SPA Shell
// ════════════════════════════════════════════════════════════════

describe('index.html — SPA Shell', () => {
  it('has doctype declaration', () => {
    assert.ok(indexHtml.toLowerCase().includes('<!doctype html>'));
  });

  it('has lang attribute', () => {
    assert.ok(indexHtml.includes('lang="en"'));
  });

  it('has viewport meta', () => {
    assert.ok(indexHtml.includes('viewport'));
  });

  it('has charset meta', () => {
    assert.ok(indexHtml.includes('charset') || indexHtml.includes('UTF-8'));
  });

  it('has theme-color meta', () => {
    assert.ok(indexHtml.includes('theme-color'));
  });

  it('has manifest link', () => {
    assert.ok(indexHtml.includes('manifest'));
  });

  it('has service worker registration', () => {
    // SW registration moved to external js/sw-register.js
    const swRegJs = fs.readFileSync(path.join(PUBLIC, 'js', 'sw-register.js'), 'utf8');
    assert.ok(indexHtml.includes('sw-register.js'), 'index.html must reference sw-register.js');
    assert.ok(swRegJs.includes('serviceWorker'), 'sw-register.js must check serviceWorker');
    assert.ok(swRegJs.includes("register('/sw.js')"), 'sw-register.js must register sw.js');
  });

  it('has view-container element', () => {
    assert.ok(indexHtml.includes('view-container'));
  });

  it('has sidebar element', () => {
    assert.ok(indexHtml.includes('id="sidebar"'));
  });

  it('has global-search input', () => {
    assert.ok(indexHtml.includes('id="global-search"'));
  });

  it('has modal-overlay element', () => {
    assert.ok(indexHtml.includes('id="modal-overlay"'));
  });

  it('has fab-add button', () => {
    assert.ok(indexHtml.includes('id="fab-add"'));
  });

  it('has offline-banner element', () => {
    assert.ok(indexHtml.includes('id="offline-banner"'));
  });

  it('has a11y-announce region', () => {
    assert.ok(indexHtml.includes('id="a11y-announce"'));
  });

  it('has breadcrumb element', () => {
    assert.ok(indexHtml.includes('id="breadcrumb"'));
  });

  it('has demo-banner element', () => {
    assert.ok(indexHtml.includes('id="demo-banner"'));
  });

  it('has bottom-nav for mobile', () => {
    assert.ok(indexHtml.includes('bottom-nav'));
  });

  it('has bottom-sheet and overlay', () => {
    assert.ok(indexHtml.includes('id="bottom-sheet"'));
    assert.ok(indexHtml.includes('id="bottom-sheet-overlay"'));
  });

  it('loads app.js as module', () => {
    assert.ok(indexHtml.includes('type="module"') && indexHtml.includes('app.js'));
  });

  it('loads styles.css', () => {
    assert.ok(indexHtml.includes('styles.css'));
  });

  it('has btn-logout element', () => {
    assert.ok(indexHtml.includes('id="btn-logout"'));
  });

  it('has theme-toggle element', () => {
    assert.ok(indexHtml.includes('id="theme-toggle"'));
  });

  it('has sidebar-collapse element', () => {
    assert.ok(indexHtml.includes('id="sidebar-collapse"'));
  });

  it('has sidebar-home element', () => {
    assert.ok(indexHtml.includes('id="sidebar-home"'));
  });

  it('has mobile-menu element', () => {
    assert.ok(indexHtml.includes('id="mobile-menu"'));
  });
});
