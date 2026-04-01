// PersonalFi — SPA Entry Point (ES module)
import { Api, closeModal, toast, getToken, openModal, el, fmt, withLoading } from './utils.js';
import { startPolling } from './notifications.js';
import { showLoading, showError } from './ui-states.js';

// ─── Auth guard ───
if (!getToken()) { window.location.href = '/login.html'; }

// ─── Theme toggle ───
function initTheme() {
  const saved = localStorage.getItem('pfi_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
  updateThemeButton();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pfi_theme', next);
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const icon = btn.querySelector('.material-icons-round');
  const label = btn.querySelector('.nav-label');
  if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

initTheme();
const themeBtn = document.getElementById('theme-toggle');
if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

// ─── Demo mode detection ───
(async function detectDemoMode() {
  try {
    const res = await fetch('/api/demo/status');
    const data = await res.json();
    if (data.demoMode) {
      const banner = document.getElementById('demo-banner');
      if (banner) {
        banner.style.display = 'flex';
        const resetLink = document.getElementById('demo-reset-link');
        if (resetLink) {
          resetLink.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
              await Api.post('/demo/reset');
              toast('Demo data reset!', 'success');
              location.reload();
            } catch (err) {
              toast('Reset failed: ' + err.message, 'error');
            }
          });
        }
      }
    }
  } catch (_) { /* not in demo mode */ }
})();

// ─── Branding ───
(async function applyBranding() {
  try {
    const res = await fetch('/api/branding');
    const brand = await res.json();
    if (brand.name) {
      document.title = brand.name;
      const logo = document.querySelector('.logo');
      if (logo) logo.textContent = '💰 ' + brand.name;
    }
    if (brand.color) {
      document.documentElement.style.setProperty('--accent', brand.color);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', brand.color);
    }
  } catch (_) { /* use defaults */ }
})();

// ─── Start notification polling ───
startPolling();

let currentView = 'dashboard';

// ─── View registry (lazy-loaded) ───
const views = {
  dashboard:     () => import('./views/dashboard.js').then(m => m.renderDashboard),
  accounts:      () => import('./views/accounts.js').then(m => m.renderAccounts),
  transactions:  () => import('./views/transactions.js').then(m => m.renderTransactions),
  categories:    () => import('./views/categories.js').then(m => m.renderCategories),
  budgets:       () => import('./views/budgets.js').then(m => m.renderBudgets),
  subscriptions: () => import('./views/subscriptions.js').then(m => m.renderSubscriptions),
  goals:         () => import('./views/goals.js').then(m => m.renderGoals),
  groups:        () => import('./views/groups.js').then(m => m.renderGroups),
  splits:        () => import('./views/splits.js').then(m => m.renderSplits),
  health:        () => import('./views/reports.js').then(m => m.renderHealth),
  reports:       () => import('./views/reports.js').then(m => m.renderReports),
  rules:         () => import('./views/rules.js').then(m => m.renderRules),
  settings:      () => import('./views/settings.js').then(m => m.renderSettings),
  search:        () => import('./views/search.js').then(m => m.renderSearch),
  insights:      () => import('./views/insights.js').then(m => m.renderInsights),
  recurring:     () => import('./views/recurring.js').then(m => m.renderRecurring),
  calendar:      () => import('./views/calendar.js').then(m => m.renderCalendar),
  export:        () => import('./views/export.js').then(m => m.renderExport),
  'whats-new':   () => import('./views/whats-new.js').then(m => m.renderWhatsNew),
  calculators:   () => import('./views/calculators.js').then(m => m.renderCalculators),
  challenges:    () => import('./views/challenges.js').then(m => m.renderChallenges),
  tags:          () => import('./views/tags.js').then(m => m.renderTags),
};

function placeholder(title, desc) {
  return Promise.resolve((container) => {
    container.textContent = '';
    const header = document.createElement('div');
    header.className = 'view-header';
    const h2 = document.createElement('h2');
    h2.textContent = title;
    header.appendChild(h2);
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = desc;
    container.appendChild(header);
    container.appendChild(p);
  });
}

// ─── Mobile sidebar toggle ───
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu');
const backdrop = document.createElement('div');
backdrop.className = 'sidebar-backdrop';
document.getElementById('app').appendChild(backdrop);
mobileMenuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('active');
});
backdrop.addEventListener('click', () => {
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
});

// ─── Sidebar collapse ───
const collapseBtn = document.getElementById('sidebar-collapse');
function initSidebarCollapse() {
  const collapsed = localStorage.getItem('pfi_sidebar') === 'collapsed';
  if (collapsed) {
    sidebar.classList.add('collapsed');
    if (collapseBtn) collapseBtn.setAttribute('aria-expanded', 'false');
  }
}
initSidebarCollapse();
if (collapseBtn) {
  collapseBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const isExpanded = !sidebar.classList.contains('collapsed');
    collapseBtn.setAttribute('aria-expanded', String(isExpanded));
    localStorage.setItem('pfi_sidebar', isExpanded ? 'expanded' : 'collapsed');
    const icon = collapseBtn.querySelector('.material-icons-round');
    if (icon) icon.textContent = isExpanded ? 'chevron_left' : 'chevron_right';
  });
}

// ─── Mobile bottom navigation ───
document.querySelectorAll('.bottom-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    if (view === 'more') {
      toggleBottomSheet();
    } else {
      navigateTo(view);
      updateBottomNavActive(view);
    }
  });
});

function updateBottomNavActive(view) {
  document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
  const active = document.querySelector(`.bottom-nav-item[data-view="${view}"]`);
  if (active) active.classList.add('active');
}

function toggleBottomSheet() {
  const overlay = document.getElementById('bottom-sheet-overlay');
  const sheet = document.getElementById('bottom-sheet');
  const grid = document.getElementById('bottom-sheet-grid');
  if (sheet.classList.contains('active')) {
    sheet.classList.remove('active');
    overlay.classList.remove('active');
    return;
  }
  // Populate more items
  const moreViews = [
    { view: 'goals', icon: 'flag', label: 'Goals' },
    { view: 'subscriptions', icon: 'autorenew', label: 'Subs' },
    { view: 'recurring', icon: 'repeat', label: 'Recurring' },
    { view: 'groups', icon: 'group', label: 'Groups' },
    { view: 'splits', icon: 'call_split', label: 'Splits' },
    { view: 'categories', icon: 'category', label: 'Categories' },
    { view: 'tags', icon: 'label', label: 'Tags' },
    { view: 'reports', icon: 'analytics', label: 'Reports' },
    { view: 'insights', icon: 'lightbulb', label: 'Insights' },
    { view: 'calendar', icon: 'calendar_month', label: 'Calendar' },
    { view: 'rules', icon: 'auto_fix_high', label: 'Rules' },
    { view: 'export', icon: 'file_download', label: 'Export' },
    { view: 'settings', icon: 'settings', label: 'Settings' },
  ];
  grid.innerHTML = '';
  moreViews.forEach(({ view, icon, label }) => {
    const btn = el('button', { className: 'bottom-sheet-item', 'data-view': view, onClick: () => {
      navigateTo(view);
      sheet.classList.remove('active');
      overlay.classList.remove('active');
      updateBottomNavActive('');
    }}, [
      el('span', { className: 'material-icons-round', textContent: icon }),
      el('span', { textContent: label }),
    ]);
    grid.appendChild(btn);
  });
  sheet.classList.add('active');
  overlay.classList.add('active');
}

const bottomSheetOverlay = document.getElementById('bottom-sheet-overlay');
if (bottomSheetOverlay) {
  bottomSheetOverlay.addEventListener('click', () => {
    document.getElementById('bottom-sheet').classList.remove('active');
    bottomSheetOverlay.classList.remove('active');
  });
}

// ─── Nav group collapse/expand ───
document.querySelectorAll('.nav-group-header').forEach(header => {
  header.addEventListener('click', () => {
    header.parentElement.classList.toggle('collapsed');
    const expanded = !header.parentElement.classList.contains('collapsed');
    header.setAttribute('aria-expanded', String(expanded));
  });
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
  });
});

// ─── Navigation ───
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
  el.addEventListener('click', () => {
    navigateTo(el.dataset.view);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
    }
  });
});

// ─── Logout ───
document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    const { api } = await import('./utils.js');
    await api('/auth/logout', { method: 'POST' });
  } catch (_) { /* ignore */ }
  localStorage.removeItem('pfi_token');
  sessionStorage.removeItem('pfi_token');
  window.location.href = '/login.html';
});

let currentSearchQuery = '';

// ─── A11y: Announce to screen readers ───
function announceToScreenReader(message) {
  const region = document.getElementById('a11y-announce');
  if (region) {
    region.textContent = '';
    setTimeout(() => { region.textContent = message; }, 100);
  }
}

// ─── A11y: Focus management on view change ───
function focusMainHeading() {
  // Don't steal focus from search input
  if (document.activeElement && document.activeElement.id === 'global-search') return;
  const container = document.getElementById('view-container');
  const heading = container && container.querySelector('h2, h3');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }
}

// ─── Render dispatcher ───
let _renderGen = 0;
async function render() {
  const thisRender = ++_renderGen;
  const container = document.getElementById('view-container');
  container.innerHTML = '';
  showLoading(container);
  try {
    // First-run onboarding wizard
    if (currentView === 'dashboard' && !localStorage.getItem('pfi_onboarding_done')) {
      showOnboardingWizard(container);
      return;
    }

    // Onboarding check: if on dashboard and no accounts, show welcome
    if (currentView === 'dashboard') {
      const { accounts } = await Api.get('/accounts');
      if (thisRender !== _renderGen) return; // stale render
      if (accounts.length === 0) {
        container.innerHTML = '';
        renderOnboarding(container);
        return;
      }
    }

    const loader = views[currentView];
    if (!loader) { container.innerHTML = '<p>View not found</p>'; return; }
    const renderFn = await loader();
    if (thisRender !== _renderGen) return; // stale render
    container.innerHTML = '';
    // Re-trigger fade-in animation on view switch (skip if reduced motion)
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.style.animation = 'none';
      container.offsetHeight; // force reflow
      container.style.animation = '';
    }
    if (currentView === 'search') {
      await renderFn(container, currentSearchQuery);
    } else {
      await renderFn(container);
    }
    // A11y: announce view change and focus heading
    const viewName = currentView.charAt(0).toUpperCase() + currentView.slice(1);
    announceToScreenReader(`${viewName} view loaded`);
    focusMainHeading();
  } catch (err) {
    container.innerHTML = '';
    showError(container, {
      message: 'Error loading view: ' + err.message,
      retryHandler: () => render(),
      dashboardHandler: () => navigateTo('dashboard'),
    });
  }
}

function renderOnboarding(container) {
  const user = JSON.parse(localStorage.getItem('pfi_user') || '{}');
  container.innerHTML = '';
  container.appendChild(el('div', { className: 'onboarding' }, [
    el('div', { className: 'onboarding-hero' }, [
      el('span', { className: 'onboarding-emoji', textContent: '👋' }),
      el('h2', { textContent: `Welcome, ${user.display_name || user.username}!` }),
      el('p', { textContent: 'Let\'s set up your personal finance dashboard in 3 easy steps.' }),
    ]),
    el('div', { className: 'onboarding-steps' }, [
      onboardingStep('1', '🏦', 'Add an Account', 'Start by adding your bank account, credit card, or wallet.', 'accounts'),
      onboardingStep('2', '📊', 'Create a Budget', 'Set monthly spending limits by category.', 'budgets'),
      onboardingStep('3', '🎯', 'Set a Goal', 'Define a savings target to work toward.', 'goals'),
    ]),
  ]));
}

function onboardingStep(num, emoji, title, desc, view) {
  return el('div', { className: 'onboarding-step', onClick: () => navigateTo(view) }, [
    el('div', { className: 'onboarding-step-num', textContent: num }),
    el('div', { className: 'onboarding-step-content' }, [
      el('div', { className: 'onboarding-step-title' }, [
        el('span', { textContent: `${emoji} ${title}` }),
      ]),
      el('p', { textContent: desc }),
    ]),
    el('span', { className: 'material-icons-round', textContent: 'arrow_forward' }),
  ]);
}

function showOnboardingWizard(container) {
  container.innerHTML = '';
  const user = JSON.parse(localStorage.getItem('pfi_user') || sessionStorage.getItem('pfi_user') || '{}');
  container.appendChild(el('div', { className: 'onboarding-wizard' }, [
    el('div', { className: 'wizard-dots' }, [
      el('span', { className: 'wizard-dot active' }),
      el('span', { className: 'wizard-dot' }),
      el('span', { className: 'wizard-dot' }),
    ]),
    el('h2', { textContent: `Welcome, ${user.display_name || user.username || 'there'}!` }),
    el('p', { textContent: 'Let\'s set up your personal finance dashboard.' }),
    el('div', { className: 'wizard-steps' }, [
      onboardingStep('1', '🏦', 'Add an Account', 'Start by adding your bank account, credit card, or wallet.', 'accounts'),
      onboardingStep('2', '📊', 'Create a Budget', 'Set monthly spending limits by category.', 'budgets'),
      onboardingStep('3', '🎯', 'Set a Goal', 'Define a savings target to work toward.', 'goals'),
    ]),
    el('button', { className: 'btn btn-secondary', textContent: 'Skip', onClick: () => {
      localStorage.setItem('pfi_onboarding_done', '1');
      render();
    }}),
  ]));
}

// ─── Keyboard shortcuts ───
// ─── Keyboard shortcuts (configurable P26) ───
const defaultShortcuts = { dashboard: 'd', transactions: 't', budgets: 'b', groups: 'g' };
const shortcutMap = JSON.parse(localStorage.getItem('pfi_shortcuts') || 'null') || defaultShortcuts;

document.addEventListener('keydown', (e) => {
  // A11y: Tab trap in modal
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Tab') {
      const focusable = modalOverlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
  }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' || e.key === 'N') showQuickAdd();
  if (e.key === '?') showShortcutsHelp();
  // Configurable shortcuts
  for (const [action, key] of Object.entries(shortcutMap)) {
    if (e.key === key) { navigateTo(action); return; }
  }
  // Ctrl+K or / to focus search
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || e.key === '/') {
    e.preventDefault();
    const si = document.getElementById('global-search');
    if (si) si.focus();
  }
  // Number keys for navigation
  const navMap = { '1': 'dashboard', '2': 'transactions', '3': 'accounts', '4': 'budgets', '5': 'goals' };
  if (navMap[e.key]) { navigateTo(navMap[e.key]); }
  // Multi-select mode toggle (P24)
  if (e.key === 'm' && currentView === 'transactions') {
    document.dispatchEvent(new CustomEvent('toggle-multi-select'));
  }
  // Vim navigation (P27)
  if (localStorage.getItem('pfi_vim') === '1') {
    if (e.key === 'j') { moveFocusInList(1); e.preventDefault(); }
    if (e.key === 'k') { moveFocusInList(-1); e.preventDefault(); }
  }
});

// ─── Shortcuts help modal ───
function showShortcutsHelp() {
  const shortcuts = [
    { key: '?', desc: 'Show this help' },
    { key: 'N', desc: 'Quick add transaction' },
    { key: 'D', desc: 'Dashboard' },
    { key: 'T', desc: 'Transactions' },
    { key: 'B', desc: 'Budgets' },
    { key: 'G', desc: 'Groups' },
    { key: '1-5', desc: 'Navigate (Dashboard, Transactions, Accounts, Budgets, Goals)' },
    { key: 'Ctrl+K or /', desc: 'Focus search bar' },
    { key: 'Esc', desc: 'Close modal' },
  ];
  const list = el('div', { className: 'shortcuts-list' },
    shortcuts.map(s => el('div', { className: 'shortcut-row', style: 'display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border)' }, [
      el('kbd', { textContent: s.key, style: 'background:var(--bg-tertiary);padding:0.2rem 0.5rem;border-radius:4px;font-family:monospace;font-size:0.875rem' }),
      el('span', { textContent: s.desc, style: 'color:var(--text-secondary)' }),
    ]))
  );
  const content = el('div', { className: 'modal-form' }, [
    el('h3', { className: 'modal-title', textContent: 'Keyboard Shortcuts' }),
    list,
    el('div', { className: 'form-actions', style: 'margin-top:1rem' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Close', onClick: closeModal }),
    ]),
  ]);
  openModal(content);
}

// ─── FAB: Quick-add transaction ───
document.getElementById('fab-add').addEventListener('click', showQuickAdd);

async function showQuickAdd() {
  let accounts = [];
  try {
    const data = await Api.get('/accounts');
    accounts = data.accounts;
  } catch { /* ignore */ }

  if (accounts.length === 0) {
    toast('Add an account first', 'info');
    navigateTo('accounts');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const quickCaptureInput = el('input', {
    type: 'text',
    className: 'quick-capture-input',
    placeholder: 'e.g. "Coffee 150 today food"',
    'aria-label': 'Quick capture',
  });
  quickCaptureInput.addEventListener('input', () => {
    const parsed = parseQuickEntry(quickCaptureInput.value);
    const f = form;
    if (parsed.description && f.description) f.description.value = parsed.description;
    if (parsed.amount && f.amount) f.amount.value = parsed.amount;
    if (parsed.date && f.date) f.date.value = parsed.date;
    if (parsed.type && f.type) f.type.value = parsed.type;
  });
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const f = e.target;
    const submitBtn = f.querySelector('button[type="submit"]');
    try {
      await withLoading(submitBtn, async () => {
        await Api.post('/transactions', {
          account_id: parseInt(f.account_id.value, 10),
          type: f.type.value,
          amount: parseFloat(f.amount.value),
          description: f.description.value.trim(),
          date: f.date.value,
        });
        toast('Transaction added', 'success');
        closeModal();
        if (currentView === 'dashboard' || currentView === 'transactions') render();
      });
    } catch (err) {
      let errDiv = f.querySelector('.modal-error');
      if (!errDiv) {
        errDiv = el('div', { className: 'modal-error' });
        f.prepend(errDiv);
      }
      errDiv.textContent = err.message;
    }
  }}, [
    el('h3', { className: 'modal-title', textContent: 'Quick Add Transaction' }),
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Quick Capture' }),
      quickCaptureInput,
    ]),
    formGroup('Description', el('input', { type: 'text', name: 'description', required: 'true', placeholder: 'What did you spend on?', autofocus: 'true' })),
    formGroup('Amount', el('input', { type: 'number', name: 'amount', step: '0.01', min: '0.01', required: 'true' })),
    el('div', { className: 'form-row' }, [
      formGroup('Type', (() => {
        const s = el('select', { name: 'type' });
        [{ v: 'expense', l: 'Expense' }, { v: 'income', l: 'Income' }].forEach(o => s.appendChild(el('option', { value: o.v, textContent: o.l })));
        return s;
      })()),
      formGroup('Account', (() => {
        const s = el('select', { name: 'account_id' });
        accounts.forEach(a => s.appendChild(el('option', { value: String(a.id), textContent: `${a.icon} ${a.name}` })));
        return s;
      })()),
    ]),
    formGroup('Date', el('input', { type: 'date', name: 'date', value: today })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Add' }),
    ]),
  ]);
  openModal(form);
}

function formGroup(label, input) {
  const id = 'qa-' + label.toLowerCase().replace(/\s+/g, '-');
  if (input.tagName) input.id = id;
  return el('div', { className: 'form-group' }, [el('label', { textContent: label, for: id }), input]);
}

function navigateTo(view, pushHistory = true) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (nav) nav.classList.add('active');
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
  if (pushHistory) history.pushState({ view }, '', `/#/${view}`);
  // Update breadcrumb (P23)
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) {
    const viewName = view.charAt(0).toUpperCase() + view.slice(1).replace(/-/g, ' ');
    breadcrumb.textContent = '';
    const ol = document.createElement('ol');
    const li1 = document.createElement('li');
    const a = document.createElement('a');
    a.href = '/#/dashboard';
    a.textContent = 'Home';
    li1.appendChild(a);
    ol.appendChild(li1);
    const li2 = document.createElement('li');
    const span = document.createElement('span');
    span.setAttribute('aria-current', 'page');
    span.textContent = viewName;
    li2.appendChild(span);
    ol.appendChild(li2);
    breadcrumb.appendChild(ol);
  }
  updateBottomNavActive(view);
  render();
}

// ─── Vim list navigation (P27) ───
function moveFocusInList(direction) {
  const container = document.getElementById('view-container');
  if (!container) return;
  const items = container.querySelectorAll('tr[tabindex], .card[tabindex], .stat-card, .nav-item, li[tabindex]');
  if (!items.length) return;
  const current = document.activeElement;
  let idx = Array.from(items).indexOf(current);
  idx = idx < 0 ? 0 : idx + direction;
  if (idx >= 0 && idx < items.length) items[idx].focus();
}

// ─── NLP Quick Capture Parser (P28) ───
function parseQuickEntry(text) {
  const result = { description: '', amount: 0, date: '', category: '', type: 'expense' };
  if (!text) return result;
  const parts = text.trim().split(/\s+/);
  const amountMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (amountMatch) result.amount = parseFloat(amountMatch[1]);
  if (/\bincome\b/i.test(text)) result.type = 'income';
  if (/\btoday\b/i.test(text)) result.date = new Date().toISOString().slice(0, 10);
  else if (/\byesterday\b/i.test(text)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    result.date = d.toISOString().slice(0, 10);
  }
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) result.date = dateMatch[1];
  // Category keywords
  const catKeywords = ['food', 'transport', 'shopping', 'bills', 'entertainment', 'health', 'education', 'salary'];
  for (const kw of catKeywords) {
    if (text.toLowerCase().includes(kw)) { result.category = kw; break; }
  }
  // Description = non-matched words
  const skipWords = [String(result.amount), result.date, result.category, 'today', 'yesterday', 'income', 'expense'].filter(Boolean);
  result.description = parts.filter(p => !skipWords.some(s => p.toLowerCase() === s.toLowerCase())).join(' ');
  return result;
}

// ─── Browser back/forward support ───
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.view) navigateTo(e.state.view, false);
});

// ─── Modal close on overlay click ───
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ─── Global search bar ───
const searchInput = document.getElementById('global-search');
if (searchInput) {
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = searchInput.value.trim();
      if (q.length > 0) {
        currentSearchQuery = q;
        currentView = 'search';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        render();
      }
    }, 300);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      const q = searchInput.value.trim();
      if (q.length > 0) {
        currentSearchQuery = q;
        currentView = 'search';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        render();
      }
    }
  });
}

// ─── Offline/online indicator ───
const offlineBanner = document.getElementById('offline-banner');
if (offlineBanner) {
  const checkConnectivity = () => {
    fetch('/api/version', { method: 'HEAD', cache: 'no-store' })
      .then(() => { offlineBanner.style.display = 'none'; })
      .catch(() => { offlineBanner.style.display = 'flex'; });
  };
  window.addEventListener('offline', checkConnectivity);
  window.addEventListener('online', () => { offlineBanner.style.display = 'none'; toast('Back online', 'success'); });
  checkConnectivity();
}

// ─── Initial route from hash ───
const hashView = location.hash.replace('#/', '');
if (hashView && views[hashView]) {
  currentView = hashView;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-view="${hashView}"]`);
  if (nav) nav.classList.add('active');
}
history.replaceState({ view: currentView }, '', `/#/${currentView}`);

// ─── Init ───
render();

// ─── Privacy banner ───
if (!localStorage.getItem('pfi_privacy_accepted')) {
  const privBanner = document.getElementById('privacy-banner');
  if (privBanner) {
    privBanner.style.display = 'flex';
    document.getElementById('privacy-dismiss').addEventListener('click', () => {
      localStorage.setItem('pfi_privacy_accepted', '1');
      privBanner.style.display = 'none';
    });
  }
}

// ─── Pending sync indicator (P25) ───
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'pending-sync') {
      const count = event.data.count || 0;
      const indicator = document.getElementById('pending-sync');
      if (indicator) {
        indicator.style.display = count > 0 ? 'flex' : 'none';
        indicator.textContent = `${count} change${count > 1 ? 's' : ''} pending sync`;
      }
    }
  });
}
