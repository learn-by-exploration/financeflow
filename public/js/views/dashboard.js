// PersonalFi — Dashboard View
import { Api, fmt, el, getUser } from '../utils.js';
import { initDashboardCharts, destroyCharts, createPeriodPicker, renderNetWorthTrend, renderCashFlow } from '../charts.js';
import { showLoadingSkeleton, showError, hideStates } from '../ui-states.js';

export async function renderDashboard(container) {
  destroyCharts();
  container.innerHTML = '';
  showLoadingSkeleton(container);

  let data;
  try {
    data = await Api.get('/stats/overview');
  } catch (err) {
    container.innerHTML = '';
    showError(container, { message: 'Failed to load dashboard: ' + err.message, retryHandler: () => renderDashboard(container) });
    return;
  }

  hideStates(container);
  const user = getUser();

  // Header
  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon dashboard', textContent: 'dashboard' }),
      el('span', { textContent: 'Dashboard' }),
    ]),
    el('span', { className: 'greeting', textContent: `Hello, ${user.display_name || user.username} 👋` }),
  ]);
  container.appendChild(header);

  // Stats grid
  const stats = el('div', { className: 'stats-grid' }, [
    statCard('Net Worth', fmt(data.net_worth), 'accent', 'accounts'),
    statCard('Income (this month)', fmt(data.month_income), 'green', 'transactions'),
    statCard('Expenses (this month)', fmt(data.month_expense), 'red', 'transactions'),
    statCard('Savings (this month)', fmt(data.month_savings), data.month_savings >= 0 ? 'green' : 'red', 'budgets'),
  ]);
  container.appendChild(stats);

  // Money-left / budget-remaining widget
  const budgetRemaining = data.month_income - data.month_expense;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const perDayLeft = daysLeft > 0 ? Math.round(budgetRemaining / daysLeft) : 0;
  if (data.month_income > 0) {
    const moneyLeftCard = el('div', { className: 'card budget-remaining money-left' }, [
      el('div', { className: 'money-left-amount' }, [
        el('span', { className: 'material-icons-round', textContent: budgetRemaining >= 0 ? 'account_balance_wallet' : 'warning' }),
        el('span', { className: `money-left-value ${budgetRemaining >= 0 ? 'green' : 'red'}`, textContent: fmt(Math.abs(budgetRemaining)) }),
      ]),
      el('p', { className: 'money-left-label', textContent: budgetRemaining >= 0 ? `remaining this month · ${fmt(perDayLeft)}/day for ${daysLeft} days` : 'over budget this month' }),
    ]);
    container.appendChild(moneyLeftCard);
  }

  // Charts grid — hero + main charts
  const chartsGrid = el('div', { className: 'charts-grid' }, [
    chartCardV2('Net Worth Trend', 'chart-net-worth', 'Line chart showing net worth with assets and liabilities over time', true),
    chartCardV2('Spending by Category', 'chart-spending', 'Doughnut chart showing spending breakdown by category this month'),
    chartCardV2('Cash Flow', 'chart-cashflow', 'Bar chart showing income, expense and net cash flow'),
    chartCardV2('Income vs Expense', 'chart-income-expense', 'Bar chart comparing income and expenses over the last 6 months'),
    chartCardV2('Spending Trend (30 days)', 'chart-trend', 'Line chart showing daily spending over the last 30 days'),
    chartCardV2('Budget Burn-Down', 'chart-budget-burndown', 'Line chart showing budget spending pace vs ideal', false),
    chartCardV2('Cash Flow Forecast', 'chart-forecast', 'Line chart showing projected balance for the next 30 days', false),
  ]);
  container.appendChild(chartsGrid);

  // Dashboard grid
  const grid = el('div', { className: 'dashboard-grid' }, [
    buildCategoriesCard(data.top_categories),
    buildRecentTxnCard(data.recent_transactions),
  ]);
  container.appendChild(grid);

  // Upcoming this week + Group Balances widgets
  const widgetGrid = el('div', { className: 'dashboard-grid' });
  widgetGrid.appendChild(await buildUpcomingWidget());
  widgetGrid.appendChild(await buildGroupBalancesWidget());
  container.appendChild(widgetGrid);

  // Subscription banner
  if (data.monthly_subscriptions > 0) {
    const banner = el('div', { className: 'card info-banner' }, [
      el('span', { className: 'material-icons-round', textContent: 'info' }),
      document.createTextNode(` You're spending ${fmt(data.monthly_subscriptions)}/month on subscriptions`),
    ]);
    container.appendChild(banner);
  }

  // Initialize charts after DOM is ready
  initDashboardCharts(container);
}

function chartCardV2(title, canvasId, ariaLabel, isHero) {
  const canvas = el('canvas', { id: canvasId, role: 'img', 'aria-label': ariaLabel || title });
  const header = el('div', { className: 'chart-card-header' }, [
    el('h3', { textContent: title }),
    el('div', { className: 'chart-summary', textContent: '' }),
  ]);
  const card = el('div', { className: `card chart-card${isHero ? ' chart-card-hero' : ''}` }, [
    header,
    el('div', { className: 'chart-wrapper' }, [canvas]),
  ]);
  return card;
}

function statCard(label, value, color, targetView) {
  const card = el('div', {
    className: `stat-card ${color} clickable`,
    tabindex: '0',
    role: 'link',
    'aria-label': `${label}: ${value}. Click to view all.`,
    onClick: () => {
      if (targetView) {
        const nav = document.querySelector(`.nav-item[data-view="${targetView}"]`);
        if (nav) nav.click();
      }
    },
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } },
  }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
    el('div', { className: 'stat-detail-link', textContent: 'View all →' }),
  ]);
  return card;
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

async function buildUpcomingWidget() {
  const card = el('div', { className: 'card upcoming-widget' }, [
    el('h3', { textContent: 'Upcoming This Week' }),
  ]);
  try {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const data = await Api.get(`/calendar?month=${monthStr}`);
    const today = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

    const upcoming = [];
    for (const [date, dayData] of Object.entries(data.days || {})) {
      if (date >= today && date <= weekEnd) {
        for (const r of (dayData.recurring || [])) {
          upcoming.push({ date, description: r.description, amount: r.amount, type: r.type, source: 'recurring' });
        }
      }
    }

    if (upcoming.length === 0) {
      card.appendChild(el('p', { className: 'text-muted', textContent: 'No upcoming items this week.' }));
    } else {
      for (const item of upcoming.slice(0, 5)) {
        card.appendChild(el('div', { className: 'txn-row' }, [
          el('span', { className: 'txn-icon', textContent: '🔄' }),
          el('div', { className: 'txn-info' }, [
            el('span', { className: 'txn-desc', textContent: item.description }),
            el('span', { className: 'txn-meta', textContent: item.date }),
          ]),
          el('span', { className: `txn-amount ${item.type}`, textContent: `${item.type === 'expense' ? '-' : '+'}${fmt(item.amount)}` }),
        ]));
      }
    }
  } catch {
    card.appendChild(el('p', { className: 'text-muted', textContent: 'Unable to load upcoming items.' }));
  }
  return card;
}

async function buildGroupBalancesWidget() {
  const card = el('div', { className: 'card group-balances-widget' }, [
    el('h3', { textContent: 'Group Balances' }),
  ]);
  try {
    const data = await Api.get('/groups');
    const groups = data.groups || [];
    if (groups.length === 0) {
      card.appendChild(el('p', { className: 'text-muted', textContent: 'No groups yet.' }));
    } else {
      for (const g of groups.slice(0, 5)) {
        const balanceText = g.user_balance > 0 ? `You are owed ${fmt(g.user_balance)}` :
          g.user_balance < 0 ? `You owe ${fmt(Math.abs(g.user_balance))}` : 'Settled up';
        const balanceClass = g.user_balance > 0 ? 'income' : g.user_balance < 0 ? 'expense' : '';
        card.appendChild(el('div', { className: 'settings-row' }, [
          el('span', { className: 'settings-label', textContent: g.name }),
          el('span', { className: `settings-value ${balanceClass}`, textContent: balanceText }),
        ]));
      }
    }
  } catch {
    card.appendChild(el('p', { className: 'text-muted', textContent: 'Unable to load group balances.' }));
  }
  return card;
}
