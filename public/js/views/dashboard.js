// PersonalFi — Dashboard View
import { Api, fmt, el, getUser } from '../utils.js';
import { initDashboardCharts, destroyCharts } from '../charts.js';
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
    el('h2', { textContent: 'Dashboard' }),
    el('span', { className: 'greeting', textContent: `Hello, ${user.display_name || user.username} 👋` }),
  ]);
  container.appendChild(header);

  // Stats grid
  const goTo = (view) => () => {
    const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (nav) nav.click();
  };
  const stats = el('div', { className: 'stats-grid' }, [
    statCard('Net Worth', fmt(data.net_worth), 'accent', goTo('accounts')),
    statCard('Income (this month)', fmt(data.month_income), 'green', goTo('transactions')),
    statCard('Expenses (this month)', fmt(data.month_expense), 'red', goTo('transactions')),
    statCard('Savings (this month)', fmt(data.month_savings), data.month_savings >= 0 ? 'green' : 'red', goTo('budgets')),
  ]);
  container.appendChild(stats);

  // Charts grid
  const chartsGrid = el('div', { className: 'charts-grid' }, [
    chartCard('Spending by Category', 'chart-spending', 'Doughnut chart showing spending breakdown by category this month'),
    chartCard('Income vs Expense', 'chart-income-expense', 'Bar chart comparing income and expenses over the last 6 months'),
    chartCard('Spending Trend (30 days)', 'chart-trend', 'Line chart showing daily spending over the last 30 days'),
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
  widgetGrid.appendChild(await buildNetWorthSparkline());
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

function chartCard(title, canvasId, ariaLabel) {
  const canvas = el('canvas', { id: canvasId, role: 'img', 'aria-label': ariaLabel || title });
  return el('div', { className: 'card chart-card' }, [
    el('h3', { textContent: title }),
    el('div', { className: 'chart-wrapper' }, [canvas]),
  ]);
}

function statCard(label, value, color, onClick) {
  const viewMap = { 'accounts': 'accounts', 'transactions': 'transactions', 'budgets': 'budgets' };
  const targetView = onClick ? Object.keys(viewMap).find(v => onClick.toString().includes(v)) || '' : '';
  const card = el('div', {
    className: `stat-card ${color} clickable`,
    tabindex: '0',
    role: 'button',
    'aria-expanded': 'false',
    'aria-label': `${label}: ${value}`,
    onClick: () => {
      const isExpanded = card.getAttribute('aria-expanded') === 'true';
      // Collapse all other cards (accordion)
      card.parentElement.querySelectorAll('.stat-card.expanded').forEach(c => {
        if (c !== card) { c.classList.remove('expanded'); c.setAttribute('aria-expanded', 'false'); }
      });
      card.classList.toggle('expanded');
      card.setAttribute('aria-expanded', String(!isExpanded));
    },
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } },
  }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
    el('div', { className: 'stat-detail' }, [
      el('a', { className: 'stat-detail-link', textContent: 'View all →', href: targetView ? `/#/${targetView}` : '#' }),
    ]),
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

async function buildNetWorthSparkline() {
  const card = el('div', { className: 'card net-worth-sparkline-widget' }, [
    el('h3', { textContent: 'Net Worth Trend' }),
  ]);
  try {
    const data = await Api.get('/net-worth/history?limit=6');
    const snapshots = data.snapshots || [];
    if (snapshots.length === 0) {
      card.appendChild(el('p', { className: 'text-muted', textContent: 'No net worth history yet.' }));
    } else {
      const maxVal = Math.max(...snapshots.map(s => Math.abs(s.net_worth)), 1);
      const sparkline = el('div', { className: 'sparkline-container' });
      for (const s of snapshots) {
        const pct = Math.abs(s.net_worth) / maxVal * 100;
        const bar = el('div', { className: `sparkline-bar ${s.net_worth >= 0 ? 'positive' : 'negative'}` });
        bar.style.height = `${pct}%`;
        bar.title = `${s.date}: ${fmt(s.net_worth)}`;
        sparkline.appendChild(bar);
      }
      card.appendChild(sparkline);
      const latest = snapshots[snapshots.length - 1];
      card.appendChild(el('p', { className: 'text-muted', textContent: `Latest: ${fmt(latest.net_worth)} (${latest.date})` }));
    }
  } catch {
    card.appendChild(el('p', { className: 'text-muted', textContent: 'Unable to load net worth history.' }));
  }
  return card;
}
