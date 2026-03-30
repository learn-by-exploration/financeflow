// PersonalFi — Insights View
import { Api, el, fmt } from '../utils.js';

export async function renderInsights(container) {
  container.innerHTML = '';

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: '💡 Insights' }),
  ]);
  container.appendChild(header);
  container.appendChild(el('div', { className: 'loading', textContent: 'Analyzing your finances...' }));

  try {
    const [trends, anomalies, velocity, categories] = await Promise.all([
      Api.get('/insights/trends?months=6').catch(() => ({ months: [], direction: 'stable', average: 0 })),
      Api.get('/insights/anomalies?months=3').catch(() => ({ anomalies: [] })),
      Api.get('/insights/velocity').catch(() => ({ daily_rate: 0, current_total: 0, previous_total: 0, status: 'on_track' })),
      Api.get('/insights/categories').catch(() => ({ changes: [] })),
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

    // Spending trends section
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
    const hasData = (trends.months?.length) || (anomalies.anomalies?.length) || (categories.changes?.length) || (velocity.daily_rate > 0);
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
