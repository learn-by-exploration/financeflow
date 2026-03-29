// PersonalFi — SPA Entry Point (ES module)
import { closeModal, toast, getToken } from './utils.js';

// ─── Auth guard ───
if (!getToken()) { window.location.href = '/login.html'; }

let currentView = 'dashboard';

// ─── View registry (lazy-loaded) ───
const views = {
  dashboard:     () => import('./views/dashboard.js').then(m => m.renderDashboard),
  accounts:      () => import('./views/accounts.js').then(m => m.renderAccounts),
  transactions:  () => import('./views/transactions.js').then(m => m.renderTransactions),
  categories:    () => import('./views/categories.js').then(m => m.renderCategories),
  budgets:       () => import('./views/budgets.js').then(m => m.renderBudgets),
  subscriptions: () => placeholder('Subscriptions', 'Subscription tracking — coming soon'),
  goals:         () => import('./views/goals.js').then(m => m.renderGoals),
  groups:        () => placeholder('Groups', 'Collaborative groups — coming soon'),
  splits:        () => placeholder('Split Expenses', 'Expense splitting — coming soon'),
  health:        () => placeholder('Financial Health', 'Financial health score — coming soon'),
  reports:       () => placeholder('Reports', 'Reports & analytics — coming soon'),
  settings:      () => placeholder('Settings', 'Settings — coming soon'),
};

function placeholder(title, desc) {
  return Promise.resolve((container) => {
    container.innerHTML = `<div class="view-header"><h2>${title}</h2></div><p class="placeholder">${desc}</p>`;
  });
}

// ─── Navigation ───
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
  el.addEventListener('click', () => {
    currentView = el.dataset.view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    render();
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

// ─── Render dispatcher ───
async function render() {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const loader = views[currentView];
    if (!loader) { container.innerHTML = '<p>View not found</p>'; return; }
    const renderFn = await loader();
    await renderFn(container);
  } catch (err) {
    container.innerHTML = '';
    const errDiv = document.createElement('div');
    errDiv.className = 'error-state';
    const p = document.createElement('p');
    p.textContent = 'Error loading view: ' + err.message;
    errDiv.appendChild(p);
    container.appendChild(errDiv);
  }
}

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') closeModal();
});

// ─── FAB ───
document.getElementById('fab-add').addEventListener('click', () => {
  toast('Quick add — coming soon', 'info');
});

// ─── Modal close on overlay click ───
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ─── Init ───
render();
