// PersonalFi — Insights View
import { Api, el, fmt } from '../utils.js';

export async function renderInsights(container) {
  container.innerHTML = '';

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon insight', textContent: 'lightbulb' }),
      el('span', { textContent: 'Insights' }),
    ]),
  ]);
  container.appendChild(header);
  container.appendChild(el('div', { className: 'loading', textContent: 'Analyzing your finances...' }));

  const today = new Date().toISOString().slice(0, 10);
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const d365 = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

  try {
    const [trends, anomalies, velocity, categories, heatmapData, dayOfWeekData, payeesData, savingsVelData, categoryTrends, recurringData] = await Promise.all([
      Api.get('/insights/trends?months=6').catch(() => ({ months: [], direction: 'stable', average: 0 })),
      Api.get('/insights/anomalies?months=3').catch(() => ({ anomalies: [] })),
      Api.get('/insights/velocity').catch(() => ({ daily_rate: 0, current_total: 0, previous_total: 0, status: 'on_track' })),
      Api.get('/insights/categories').catch(() => ({ changes: [] })),
      Api.get(`/charts/spending-heatmap?from=${d365}&to=${today}`).catch(() => ({ days: [], max_total: 0 })),
      Api.get(`/charts/day-of-week?from=${d90}&to=${today}`).catch(() => ({ labels: [], datasets: [] })),
      Api.get(`/insights/payees?from=${d90}&to=${today}&limit=10`).catch(() => ({ payees: [] })),
      Api.get(`/charts/savings-velocity?from=${d365}&to=${today}`).catch(() => ({ labels: [], datasets: [] })),
      Api.get('/insights/category-trends?months=6').catch(() => ({ categories: [] })),
      Api.get('/charts/recurring-waterfall').catch(() => ({ labels: [], datasets: [] })),
    ]);

    container.innerHTML = '';
    container.appendChild(header);

    // Velocity / overview cards
    const statsGrid = el('div', { className: 'stats-grid' }, [
      insightStatCard('Daily Spend Rate', fmt(velocity.daily_rate || 0), 'accent'),
      insightStatCard('This Month', fmt(velocity.current_total || 0), 'accent'),
      insightStatCard('Last Month', fmt(velocity.previous_total || 0), 'accent'),
      insightStatCard('Spending Trend', formatTrend(trends.direction), trends.direction === 'increasing' ? 'red' : trends.direction === 'decreasing' ? 'green' : 'accent'),
    ]);
    container.appendChild(statsGrid);

    // Month comparison
    if (velocity.previous_same_day_total > 0) {
      const pct = ((velocity.current_total - velocity.previous_same_day_total) / velocity.previous_same_day_total) * 100;
      const isUp = pct > 0;
      const banner = el('div', { className: `card info-banner ${isUp ? 'red-border' : 'green-border'}` }, [
        el('span', { className: 'material-icons-round', textContent: isUp ? 'trending_up' : 'trending_down' }),
        el('span', { textContent: ` You're spending ${Math.abs(pct).toFixed(1)}% ${isUp ? 'more' : 'less'} than this time last month` }),
      ]);
      container.appendChild(banner);
    }

    // ─── Spending Heatmap (B1) ───
    if (heatmapData.days?.length > 0) {
      const heatmapCard = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '🗓️ Spending Heatmap (Past Year)' }),
        el('p', { className: 'text-muted', textContent: 'Darker = higher spending day' }),
      ]);
      const heatmapGrid = el('div', { className: 'spending-heatmap', role: 'img', 'aria-label': 'Spending heatmap showing daily spending intensity over the past year' });
      const dayMap = {};
      for (const d of heatmapData.days) dayMap[d.date] = d.total;
      const maxVal = heatmapData.max_total || 1;

      // Build 365 cells
      const startDate = new Date(d365);
      for (let i = 0; i < 365; i++) {
        const d = new Date(startDate.getTime() + i * 86400000);
        const dateStr = d.toISOString().slice(0, 10);
        const val = dayMap[dateStr] || 0;
        const intensity = maxVal > 0 ? Math.min(1, val / maxVal) : 0;
        const cell = el('div', {
          className: 'heatmap-cell',
          title: `${dateStr}: ${fmt(val)}`,
          'aria-label': `${dateStr}: ${fmt(val)}`,
        });
        cell.style.opacity = val > 0 ? 0.2 + intensity * 0.8 : 0.1;
        heatmapGrid.appendChild(cell);
      }
      heatmapCard.appendChild(heatmapGrid);
      container.appendChild(heatmapCard);
    }

    // ─── Day-of-Week Pattern (B4) ───
    if (dayOfWeekData.labels?.length === 7) {
      const weekdayAvgs = dayOfWeekData.datasets[0]?.data || [];
      const maxWeekday = Math.max(...weekdayAvgs, 1);
      const dayOfWeekCard = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '📅 Spending by Day of Week' }),
        el('div', { className: 'insights-weekday-chart' }, dayOfWeekData.labels.map((day, i) => {
          const val = weekdayAvgs[i] || 0;
          const pct = Math.round((val / maxWeekday) * 100);
          return el('div', { className: 'weekday-bar-row' }, [
            el('span', { className: 'weekday-label', textContent: day.slice(0, 3) }),
            el('div', { className: 'weekday-bar-container' }, [
              el('div', { className: 'weekday-bar', style: `width: ${pct}%` }),
            ]),
            el('span', { className: 'weekday-value', textContent: fmt(val) }),
          ]);
        })),
      ]);
      container.appendChild(dayOfWeekCard);
    }

    // ─── Top Payees (B5) ───
    if (payeesData.payees?.length > 0) {
      const maxPayee = payeesData.payees[0]?.total || 1;
      const payeeCard = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '🏪 Top Payees (90 days)' }),
        el('div', { className: 'insights-payees' }, payeesData.payees.slice(0, 10).map(p => {
          const pct = Math.round((p.total / maxPayee) * 100);
          return el('div', { className: 'payee-bar-row' }, [
            el('span', { className: 'payee-label', textContent: p.payee || 'Unknown' }),
            el('div', { className: 'payee-bar-container' }, [
              el('div', { className: 'payee-bar', style: `width: ${pct}%` }),
            ]),
            el('span', { className: 'payee-value', textContent: `${fmt(p.total)} (${p.count}×)` }),
          ]);
        })),
      ]);
      container.appendChild(payeeCard);
    }

    // ─── Savings Velocity (B3) ───
    if (savingsVelData.labels?.length > 0) {
      const savingsDs = savingsVelData.datasets.find(d => d.name === 'Savings')?.data || [];
      const cumulDs = savingsVelData.datasets.find(d => d.name === 'Cumulative')?.data || [];
      const maxSav = Math.max(...savingsDs.map(Math.abs), 1);
      const savingsCard = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '💰 Savings Velocity' }),
        el('p', { className: 'text-muted', textContent: cumulDs.length > 0 ? `Cumulative savings: ${fmt(cumulDs[cumulDs.length - 1])}` : '' }),
        el('div', { className: 'insights-savings-velocity' }, savingsVelData.labels.map((month, i) => {
          const val = savingsDs[i] || 0;
          const pct = Math.round((Math.abs(val) / maxSav) * 100);
          return el('div', { className: 'trend-bar-row' }, [
            el('span', { className: 'trend-label', textContent: month }),
            el('div', { className: 'trend-bar-container' }, [
              el('div', { className: `trend-bar ${val >= 0 ? 'positive' : 'negative'}`, style: `width: ${pct}%` }),
            ]),
            el('span', { className: `trend-value ${val >= 0 ? 'green' : 'red'}`, textContent: fmt(val) }),
          ]);
        })),
      ]);
      container.appendChild(savingsCard);
    }

    // ─── Category Trend Sparklines (C1) ───
    if (categoryTrends.categories?.length > 0) {
      const catTrendCard = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '📈 Category Trends (6 months)' }),
        el('p', { className: 'text-muted', textContent: 'Spending sparklines per category' }),
      ]);
      const catList = el('div', { className: 'category-trend-list' });
      for (const cat of categoryTrends.categories) {
        const vals = (cat.months || []).map(m => m.total);
        const maxVal = Math.max(...vals, 1);
        const sparkline = el('div', { className: 'sparkline-bars' }, vals.map(v => {
          const h = Math.max(2, Math.round((v / maxVal) * 32));
          const bar = el('div', { className: 'sparkline-bar' });
          bar.style.height = `${h}px`;
          return bar;
        }));
        const row = el('div', { className: 'category-trend-row' }, [
          el('span', { className: 'category-trend-icon', textContent: cat.icon || '📂' }),
          el('span', { className: 'category-trend-name', textContent: cat.name }),
          sparkline,
          el('span', { className: 'category-trend-total', textContent: fmt(vals.reduce((a, b) => a + b, 0)) }),
        ]);
        catList.appendChild(row);
      }
      catTrendCard.appendChild(catList);
      container.appendChild(catTrendCard);
    }

    // ─── Recurring Waterfall (C4) ───
    if (recurringData.labels?.length > 0) {
      const recurringCard = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '🔄 Recurring Income vs Expenses' }),
      ]);
      const incomeDs = recurringData.datasets.find(d => d.name === 'Income')?.data || [];
      const expenseDs = recurringData.datasets.find(d => d.name === 'Expense')?.data || [];
      const maxRecurring = Math.max(...incomeDs, ...expenseDs.map(Math.abs), 1);
      const recurringList = el('div', { className: 'recurring-waterfall' }, recurringData.labels.map((label, i) => {
        const inc = incomeDs[i] || 0;
        const exp = expenseDs[i] || 0;
        const net = inc - exp;
        return el('div', { className: 'recurring-item' }, [
          el('span', { className: 'recurring-label', textContent: label }),
          el('span', { className: `recurring-value ${net >= 0 ? 'green' : 'red'}`, textContent: fmt(net) }),
        ]);
      }));
      recurringCard.appendChild(recurringList);
      container.appendChild(recurringCard);
    }

    // ─── Spending Trends Section (existing) ───
    if (trends.months?.length) {
      const trendsSection = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '📊 Spending Trends' }),
        el('div', { className: 'insights-trends' }, trends.months.map(m =>
          el('div', { className: 'trend-bar-row' }, [
            el('span', { className: 'trend-label', textContent: m.month }),
            el('div', { className: 'trend-bar-container' }, [
              el('div', { className: 'trend-bar', style: `width: ${barWidth(m.total, trends.months)}` }),
            ]),
            el('span', { className: 'trend-value', textContent: fmt(m.total) }),
          ])
        )),
      ]);
      container.appendChild(trendsSection);
    }

    // Anomalies / unusual spending
    if (anomalies.anomalies?.length) {
      const anomalySection = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '⚠️ Unusual Spending' }),
        el('div', { className: 'insights-anomalies' }, anomalies.anomalies.map(a =>
          el('div', { className: 'anomaly-item' }, [
            el('div', { className: 'anomaly-info' }, [
              el('span', { className: 'anomaly-desc', textContent: a.description || 'Unknown' }),
              el('span', { className: 'anomaly-category', textContent: a.category_name || '' }),
            ]),
            el('div', { className: 'anomaly-amount red', textContent: fmt(a.amount) }),
          ])
        )),
      ]);
      container.appendChild(anomalySection);
    }

    // Category changes
    if (categories.changes?.length) {
      const catSection = el('div', { className: 'card insights-card' }, [
        el('h3', { textContent: '📂 Category Changes' }),
        el('div', { className: 'insights-categories' }, categories.changes.map(c =>
          el('div', { className: 'category-change-item' }, [
            el('span', { textContent: `${c.icon || ''} ${c.name}` }),
            el('span', { className: c.change_pct > 0 ? 'red' : 'green', textContent: `${c.change_pct > 0 ? '↑' : '↓'} ${Math.abs(c.change_pct).toFixed(1)}%` }),
          ])
        )),
      ]);
      container.appendChild(catSection);
    }

    // Empty state if nothing to show
    const hasData = (trends.months?.length) || (anomalies.anomalies?.length) || (categories.changes?.length) || (velocity.daily_rate > 0) || (heatmapData.days?.length > 0);
    if (!hasData) {
      container.appendChild(el('div', { className: 'empty-state' }, [
        el('span', { className: 'empty-icon', textContent: '💡' }),
        el('p', { textContent: 'Not enough data yet. Add some transactions to see your financial insights!' }),
      ]));
    }
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(el('div', { className: 'error-state' }, [
      el('p', { textContent: 'Error loading insights: ' + err.message }),
    ]));
  }
}

function insightStatCard(label, value, color) {
  return el('div', { className: `stat-card ${color}` }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
  ]);
}

function formatTrend(direction) {
  if (direction === 'increasing') return '📈 Increasing';
  if (direction === 'decreasing') return '📉 Decreasing';
  return '➡️ Stable';
}

function barWidth(total, months) {
  const max = Math.max(...months.map(m => m.total), 1);
  return `${Math.round((total / max) * 100)}%`;
}
