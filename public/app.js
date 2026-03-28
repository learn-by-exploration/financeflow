// PersonalFi — SPA Entry Point
// Vanilla JS, no framework, no build step

(function () {
  'use strict';

  // ─── Auth guard ───
  const token = localStorage.getItem('pfi_token');
  if (!token) { window.location.href = '/login.html'; return; }

  const user = JSON.parse(localStorage.getItem('pfi_user') || '{}');
  let currentView = 'dashboard';

  // ─── API helper ───
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    headers['X-Session-Token'] = token;
    const res = await fetch(`/api${path}`, { ...options, headers });
    if (res.status === 401) { localStorage.clear(); window.location.href = '/login.html'; return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error');
    return data;
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

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.clear();
    window.location.href = '/login.html';
  });

  // ─── Toast ───
  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ─── Currency formatter ───
  function fmt(amount, currency = 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
  }

  // ─── Modal ───
  function openModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  }
  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // ─── Render dispatcher ───
  async function render() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Loading...</div>';
    try {
      switch (currentView) {
        case 'dashboard': await renderDashboard(container); break;
        case 'transactions': await renderTransactions(container); break;
        case 'accounts': await renderAccounts(container); break;
        case 'budgets': await renderBudgets(container); break;
        case 'subscriptions': await renderSubscriptions(container); break;
        case 'goals': await renderGoals(container); break;
        case 'groups': await renderGroups(container); break;
        case 'splits': await renderSplits(container); break;
        case 'health': await renderHealth(container); break;
        case 'reports': await renderReports(container); break;
        case 'settings': await renderSettings(container); break;
        default: container.innerHTML = '<p>View not found</p>';
      }
    } catch (err) {
      container.innerHTML = `<div class="error-state"><p>Error loading view: ${err.message}</p></div>`;
    }
  }

  // ─── Dashboard ───
  async function renderDashboard(el) {
    const data = await api('/stats/overview');
    el.innerHTML = `
      <div class="view-header"><h2>Dashboard</h2><span class="greeting">Hello, ${user.display_name || user.username} 👋</span></div>
      <div class="stats-grid">
        <div class="stat-card accent"><div class="stat-label">Net Worth</div><div class="stat-value">${fmt(data.net_worth)}</div></div>
        <div class="stat-card green"><div class="stat-label">Income (this month)</div><div class="stat-value">${fmt(data.month_income)}</div></div>
        <div class="stat-card red"><div class="stat-label">Expenses (this month)</div><div class="stat-value">${fmt(data.month_expense)}</div></div>
        <div class="stat-card ${data.month_savings >= 0 ? 'green' : 'red'}"><div class="stat-label">Savings (this month)</div><div class="stat-value">${fmt(data.month_savings)}</div></div>
      </div>
      <div class="dashboard-grid">
        <div class="card">
          <h3>Top Spending Categories</h3>
          <div class="category-list">
            ${data.top_categories.length ? data.top_categories.map(c => `
              <div class="category-row"><span>${c.icon} ${c.name}</span><span class="amount">${fmt(c.total)}</span></div>
            `).join('') : '<p class="empty">No expenses this month</p>'}
          </div>
        </div>
        <div class="card">
          <h3>Recent Transactions</h3>
          <div class="transaction-list">
            ${data.recent_transactions.length ? data.recent_transactions.slice(0, 7).map(t => `
              <div class="txn-row">
                <span class="txn-icon">${t.category_icon || '📦'}</span>
                <div class="txn-info"><span class="txn-desc">${t.description}</span><span class="txn-meta">${t.date} · ${t.account_name || ''}</span></div>
                <span class="txn-amount ${t.type === 'income' ? 'income' : 'expense'}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</span>
              </div>
            `).join('') : '<p class="empty">No transactions yet</p>'}
          </div>
        </div>
      </div>
      ${data.monthly_subscriptions > 0 ? `<div class="card info-banner"><span class="material-icons-round">info</span> You're spending ${fmt(data.monthly_subscriptions)}/month on subscriptions</div>` : ''}
    `;
  }

  // ─── Placeholder views ───
  async function renderTransactions(el) { el.innerHTML = '<div class="view-header"><h2>Transactions</h2></div><p class="placeholder">Transaction management — coming soon</p>'; }
  async function renderAccounts(el) { el.innerHTML = '<div class="view-header"><h2>Accounts</h2></div><p class="placeholder">Account management — coming soon</p>'; }
  async function renderBudgets(el) { el.innerHTML = '<div class="view-header"><h2>Budgets</h2></div><p class="placeholder">Budget management — coming soon</p>'; }
  async function renderSubscriptions(el) { el.innerHTML = '<div class="view-header"><h2>Subscriptions</h2></div><p class="placeholder">Subscription tracking — coming soon</p>'; }
  async function renderGoals(el) { el.innerHTML = '<div class="view-header"><h2>Savings Goals</h2></div><p class="placeholder">Savings goals — coming soon</p>'; }
  async function renderGroups(el) { el.innerHTML = '<div class="view-header"><h2>Groups</h2></div><p class="placeholder">Collaborative groups — coming soon</p>'; }
  async function renderSplits(el) { el.innerHTML = '<div class="view-header"><h2>Split Expenses</h2></div><p class="placeholder">Expense splitting — coming soon</p>'; }
  async function renderHealth(el) { el.innerHTML = '<div class="view-header"><h2>Financial Health</h2></div><p class="placeholder">Financial health score — coming soon</p>'; }
  async function renderReports(el) { el.innerHTML = '<div class="view-header"><h2>Reports</h2></div><p class="placeholder">Reports & analytics — coming soon</p>'; }
  async function renderSettings(el) { el.innerHTML = '<div class="view-header"><h2>Settings</h2></div><p class="placeholder">Settings — coming soon</p>'; }

  // ─── Keyboard shortcuts ───
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') closeModal();
  });

  // ─── FAB ───
  document.getElementById('fab-add').addEventListener('click', () => {
    toast('Quick add — coming soon', 'info');
  });

  // ─── Init ───
  render();
})();
