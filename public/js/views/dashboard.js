// PersonalFi — Dashboard View
import { Api, fmt, el, getUser } from '../utils.js';

export async function renderDashboard(container) {
  const data = await Api.get('/stats/overview');
  const user = getUser();

  container.innerHTML = '';

  // Header
  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Dashboard' }),
    el('span', { className: 'greeting', textContent: `Hello, ${user.display_name || user.username} 👋` }),
  ]);
  container.appendChild(header);

  // Stats grid
  const stats = el('div', { className: 'stats-grid' }, [
    statCard('Net Worth', fmt(data.net_worth), 'accent'),
    statCard('Income (this month)', fmt(data.month_income), 'green'),
    statCard('Expenses (this month)', fmt(data.month_expense), 'red'),
    statCard('Savings (this month)', fmt(data.month_savings), data.month_savings >= 0 ? 'green' : 'red'),
  ]);
  container.appendChild(stats);

  // Dashboard grid
  const grid = el('div', { className: 'dashboard-grid' }, [
    buildCategoriesCard(data.top_categories),
    buildRecentTxnCard(data.recent_transactions),
  ]);
  container.appendChild(grid);

  // Subscription banner
  if (data.monthly_subscriptions > 0) {
    const banner = el('div', { className: 'card info-banner' }, [
      el('span', { className: 'material-icons-round', textContent: 'info' }),
      document.createTextNode(` You're spending ${fmt(data.monthly_subscriptions)}/month on subscriptions`),
    ]);
    container.appendChild(banner);
  }
}

function statCard(label, value, color) {
  return el('div', { className: `stat-card ${color}` }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
  ]);
}

function buildCategoriesCard(categories) {
  const rows = categories.length
    ? categories.map(c => el('div', { className: 'category-row' }, [
        el('span', { textContent: `${c.icon} ${c.name}` }),
        el('span', { className: 'amount', textContent: fmt(c.total) }),
      ]))
    : [el('p', { className: 'empty', textContent: 'No expenses this month' })];

  return el('div', { className: 'card' }, [
    el('h3', { textContent: 'Top Spending Categories' }),
    el('div', { className: 'category-list' }, rows),
  ]);
}

function buildRecentTxnCard(transactions) {
  const rows = transactions.length
    ? transactions.slice(0, 7).map(t => {
        const amountClass = t.type === 'income' ? 'income' : 'expense';
        const prefix = t.type === 'income' ? '+' : '-';
        return el('div', { className: 'txn-row' }, [
          el('span', { className: 'txn-icon', textContent: t.category_icon || '📦' }),
          el('div', { className: 'txn-info' }, [
            el('span', { className: 'txn-desc', textContent: t.description }),
            el('span', { className: 'txn-meta', textContent: `${t.date} · ${t.account_name || ''}` }),
          ]),
          el('span', { className: `txn-amount ${amountClass}`, textContent: `${prefix}${fmt(t.amount)}` }),
        ]);
      })
    : [el('p', { className: 'empty', textContent: 'No transactions yet' })];

  return el('div', { className: 'card' }, [
    el('h3', { textContent: 'Recent Transactions' }),
    el('div', { className: 'transaction-list' }, rows),
  ]);
}
