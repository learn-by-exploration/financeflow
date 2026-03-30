// PersonalFi — SPA Entry Point (ES module)
import { Api, closeModal, toast, getToken, openModal, el, fmt } from './utils.js';
import { startPolling } from './notifications.js';
import { showLoading, showError } from './ui-states.js';

// ─── Auth guard ───
if (!getToken()) { window.location.href = '/login.html'; }

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
};

function placeholder(title, desc) {
  return Promise.resolve((container) => {
    container.innerHTML = `<div class="view-header"><h2>${title}</h2></div><p class="placeholder">${desc}</p>`;
  });
}

// ─── Mobile sidebar toggle ───
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu');
let backdrop = document.createElement('div');
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
    currentView = el.dataset.view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
    render();
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
  localStorage.clear();
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
  const container = document.getElementById('view-container');
  const heading = container && container.querySelector('h2, h3');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }
}

// ─── Render dispatcher ───
async function render() {
  const container = document.getElementById('view-container');
  container.innerHTML = '';
  showLoading(container);
  try {
    // Onboarding check: if on dashboard and no accounts, show welcome
    if (currentView === 'dashboard') {
      const { accounts } = await Api.get('/accounts');
      if (accounts.length === 0) {
        container.innerHTML = '';
        renderOnboarding(container);
        return;
      }
    }

    const loader = views[currentView];
    if (!loader) { container.innerHTML = '<p>View not found</p>'; return; }
    const renderFn = await loader();
    container.innerHTML = '';
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

// ─── Keyboard shortcuts ───
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

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' || e.key === 'N') showQuickAdd();
  if (e.key === '?') showShortcutsHelp();
  if (e.key === 'd') navigateTo('dashboard');
  if (e.key === 't') navigateTo('transactions');
  if (e.key === 'b') navigateTo('budgets');
  if (e.key === 'g') navigateTo('groups');
  // Number keys for navigation
  const navMap = { '1': 'dashboard', '2': 'transactions', '3': 'accounts', '4': 'budgets', '5': 'goals' };
  if (navMap[e.key]) { navigateTo(navMap[e.key]); }
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
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
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
    } catch (err) { toast(err.message, 'error'); }
  }}, [
    el('h3', { className: 'modal-title', textContent: 'Quick Add Transaction' }),
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

function navigateTo(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (nav) nav.classList.add('active');
  render();
}

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

// ─── Init ───
render();
