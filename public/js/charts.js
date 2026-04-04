// PersonalFi — Dashboard Chart Rendering (ES module)
import { Api, el, fmt } from './utils.js';

// ─── Theme & Defaults ───

function getCSSColor(prop, fallback) {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue(prop).trim() || fallback;
}

function getThemeColors() {
  return {
    accent: getCSSColor('--accent', '#6366f1'),
    accentLight: getCSSColor('--accent-light', '#818cf8'),
    green: getCSSColor('--green', '#10b981'),
    red: getCSSColor('--red', '#ef4444'),
    yellow: getCSSColor('--yellow', '#f59e0b'),
    cyan: '#06b6d4',
    pink: '#ec4899',
    orange: '#f97316',
    purple: '#a855f7',
    lime: '#84cc16',
    teal: '#14b8a6',
    rose: '#f43f5e',
  };
}

function getChartDefaults() {
  return {
    color: getCSSColor('--text-secondary', '#94a3b8'),
    borderColor: getCSSColor('--border', '#334155'),
    backgroundColor: 'transparent',
  };
}

const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const PIE_COLORS_KEYS = ['accent', 'green', 'red', 'yellow', 'cyan', 'pink', 'orange', 'purple', 'lime', 'teal', 'rose', 'accentLight'];

// ─── Date Helpers ───

function todayStr() { return new Date().toISOString().slice(0, 10); }

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n) {
  const d = new Date(); d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ─── Period Picker ───

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6mo', days: 180 },
  { label: '1y', days: 365 },
];

export function createPeriodPicker(defaultLabel, onChange) {
  const picker = el('div', { className: 'period-picker' });
  PERIODS.forEach(p => {
    const btn = el('button', {
      className: `period-btn${p.label === defaultLabel ? ' active' : ''}`,
      textContent: p.label,
      'aria-label': `Show ${p.label} period`,
      onClick: () => {
        picker.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const from = daysAgo(p.days);
        const to = todayStr();
        const interval = p.days <= 30 ? 'daily' : p.days <= 90 ? 'weekly' : 'monthly';
        onChange({ from, to, interval, label: p.label });
      },
    });
    picker.appendChild(btn);
  });
  return picker;
}

// ─── Chart Instance Registry ───

const charts = {};

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); charts[key] = null; }
}

function destroyCharts() {
  for (const key of Object.keys(charts)) destroyChart(key);
}

// ─── Canvas Helpers ───

function noDataMessage(canvas) {
  const wrapper = canvas.parentElement;
  canvas.style.display = 'none';
  let msg = wrapper.querySelector('.chart-no-data');
  if (!msg) {
    msg = document.createElement('div');
    msg.className = 'chart-no-data';
    msg.textContent = 'No data available';
    wrapper.appendChild(msg);
  }
}

function clearNoData(canvas) {
  canvas.style.display = '';
  const msg = canvas.parentElement?.querySelector('.chart-no-data');
  if (msg) msg.remove();
}

// ─── Summary Text Generator ───

function movingAverage(data, window) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    result.push(Math.round(slice.reduce((s, v) => s + v, 0) / slice.length * 100) / 100);
  }
  return result;
}

function summaryText(data, type) {
  if (!data || !data.datasets) return '';
  const ds = data.datasets;
  if (type === 'spending-pie') {
    const total = data.total || ds[0]?.data?.reduce((s, v) => s + v, 0) || 0;
    const top = data.labels?.[0] || 'Unknown';
    return total > 0 ? `${fmt(total)} spent · Top: ${top}` : 'No spending data';
  }
  if (type === 'income-expense') {
    const inc = ds[0]?.data?.reduce((s, v) => s + v, 0) || 0;
    const exp = ds[1]?.data?.reduce((s, v) => s + v, 0) || 0;
    const net = inc - exp;
    return `Income ${fmt(inc)} · Expense ${fmt(exp)} · Net ${net >= 0 ? '+' : ''}${fmt(net)}`;
  }
  if (type === 'spending-trend') {
    const vals = ds[0]?.data || [];
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return `Avg daily: ${fmt(Math.round(avg))}`;
  }
  if (type === 'cashflow') {
    const netDs = ds.find(d => d.name === 'Net');
    if (netDs && netDs.data.length) {
      const latest = netDs.data[netDs.data.length - 1];
      return `Latest net: ${latest >= 0 ? '+' : ''}${fmt(latest)}`;
    }
    return '';
  }
  if (type === 'net-worth') {
    const nwDs = ds.find(d => d.name === 'Net Worth');
    if (nwDs && nwDs.data.length) {
      const latest = nwDs.data[nwDs.data.length - 1];
      const first = nwDs.data[0];
      const diff = latest - first;
      const pct = first !== 0 ? ((diff / Math.abs(first)) * 100).toFixed(1) : 0;
      return `${fmt(latest)} · ${diff >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% over period`;
    }
    return '';
  }
  return '';
}

function setSummary(container, canvasId, text) {
  const card = container.querySelector(`#${canvasId}`)?.closest('.chart-card');
  if (!card) return;
  let sumEl = card.querySelector('.chart-summary');
  if (!sumEl) {
    sumEl = document.createElement('div');
    sumEl.className = 'chart-summary';
    const header = card.querySelector('.chart-card-header');
    if (header) header.appendChild(sumEl);
  }
  sumEl.textContent = text;
}

// ─── Main Init ───

export async function initDashboardCharts(container) {
  if (typeof Chart === 'undefined') return;

  destroyCharts();

  const defaults = getChartDefaults();
  Chart.defaults.color = defaults.color;
  Chart.defaults.borderColor = defaults.borderColor;

  await Promise.all([
    renderNetWorthTrend(container.querySelector('#chart-net-worth'), container),
    renderSpendingByCategory(container.querySelector('#chart-spending'), container),
    renderCashFlow(container.querySelector('#chart-cashflow'), container),
    renderIncomeVsExpense(container.querySelector('#chart-income-expense'), container),
    renderSpendingTrend(container.querySelector('#chart-trend'), container),
    renderBudgetBurnDown(container.querySelector('#chart-budget-burndown'), container),
    renderForecast(container.querySelector('#chart-forecast'), container),
  ]);
}

// ─── A3: Net Worth Trend (Hero) ───

export async function renderNetWorthTrend(canvas, container, from, to) {
  if (!canvas) return;
  destroyChart('netWorth');
  try {
    const f = from || monthsAgo(6);
    const t = to || todayStr();
    const data = await Api.get(`/charts/net-worth?from=${f}&to=${t}&interval=monthly`);

    if (!data.labels || data.labels.length === 0) { noDataMessage(canvas); return; }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    const nwData = data.datasets.find(d => d.name === 'Net Worth')?.data || [];
    const assetsData = data.datasets.find(d => d.name === 'Assets')?.data || [];
    const liabData = data.datasets.find(d => d.name === 'Liabilities')?.data || [];

    charts.netWorth = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Net Worth', data: nwData, borderColor: COLORS.accent, backgroundColor: COLORS.accent + '1a', fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, pointBackgroundColor: COLORS.accent },
          { label: 'Assets', data: assetsData, borderColor: COLORS.green, backgroundColor: 'transparent', tension: 0.3, pointRadius: 2, borderWidth: 1.5, borderDash: [4, 3] },
          { label: 'Liabilities', data: liabData, borderColor: COLORS.red, backgroundColor: 'transparent', tension: 0.3, pointRadius: 2, borderWidth: 1.5, borderDash: [4, 3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: !reducedMotion,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: false, ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } },
        },
      },
    });

    if (container) setSummary(container, 'chart-net-worth', summaryText(data, 'net-worth'));
  } catch (e) {
    console.warn('Net worth chart failed:', e);
    noDataMessage(canvas);
  }
}

// ─── Spending by Category (Doughnut) ───

async function renderSpendingByCategory(canvas, container, from, to) {
  if (!canvas) return;
  destroyChart('spending');
  try {
    const f = from || monthStart();
    const t = to || todayStr();
    const data = await Api.get(`/charts/spending-pie?from=${f}&to=${t}`);

    if (!data.labels || data.labels.length === 0) { noDataMessage(canvas); return; }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    const PIE_COLORS = PIE_COLORS_KEYS.map(k => COLORS[k]);

    charts.spending = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{ data: data.datasets[0].data, backgroundColor: PIE_COLORS.slice(0, data.labels.length), borderColor: getCSSColor('--bg-secondary', '#1e293b'), borderWidth: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: !reducedMotion, cutout: '60%',
        onClick: (_event, elements) => {
          if (elements.length > 0) {
            const category = data.labels[elements[0].index];
            const nav = document.querySelector('.nav-item[data-view="transactions"]');
            if (nav) {
              nav.click();
              setTimeout(() => {
                const search = document.querySelector('input[name="search"], .search-input');
                if (search) { search.value = category; search.dispatchEvent(new Event('input')); }
              }, 200);
            }
          }
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => { const pct = data.meta?.[ctx.dataIndex]?.percentage ?? 0; return `${ctx.label}: ₹${ctx.parsed.toLocaleString('en-IN')} (${pct}%)`; } } },
        },
      },
    });

    if (container) setSummary(container, 'chart-spending', summaryText(data, 'spending-pie'));
  } catch (e) {
    console.warn('Spending chart failed:', e);
    noDataMessage(canvas);
  }
}

// ─── A4: Cash Flow Chart ───

export async function renderCashFlow(canvas, container, from, to, interval) {
  if (!canvas) return;
  destroyChart('cashflow');
  try {
    const f = from || monthsAgo(6);
    const t = to || todayStr();
    const iv = interval || 'monthly';
    const data = await Api.get(`/charts/cashflow?from=${f}&to=${t}&interval=${iv}`);

    if (!data.labels || data.labels.length === 0) { noDataMessage(canvas); return; }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    const incData = data.datasets.find(d => d.name === 'Income')?.data || [];
    const expData = data.datasets.find(d => d.name === 'Expense')?.data || [];
    const netData = data.datasets.find(d => d.name === 'Net')?.data || [];

    charts.cashflow = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Income', data: incData, backgroundColor: COLORS.green + 'cc', borderColor: COLORS.green, borderWidth: 1, borderRadius: 4 },
          { label: 'Expense', data: expData, backgroundColor: COLORS.red + 'cc', borderColor: COLORS.red, borderWidth: 1, borderRadius: 4 },
          { label: 'Net', data: netData, type: 'line', borderColor: COLORS.accent, backgroundColor: 'transparent', tension: 0.3, pointRadius: 3, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: !reducedMotion,
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } },
        },
      },
    });

    if (container) setSummary(container, 'chart-cashflow', summaryText(data, 'cashflow'));
  } catch (e) {
    console.warn('Cash flow chart failed:', e);
    noDataMessage(canvas);
  }
}

// ─── Income vs Expense ───

async function renderIncomeVsExpense(canvas, container, from, to) {
  if (!canvas) return;
  destroyChart('incomeExpense');
  try {
    const f = from || monthsAgo(5);
    const t = to || todayStr();
    const data = await Api.get(`/charts/income-expense?from=${f}&to=${t}&interval=monthly`);

    if (!data.labels || data.labels.length === 0) { noDataMessage(canvas); return; }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    charts.incomeExpense = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Income', data: data.datasets[0].data, backgroundColor: COLORS.green + 'cc', borderColor: COLORS.green, borderWidth: 1, borderRadius: 4 },
          { label: 'Expense', data: data.datasets[1].data, backgroundColor: COLORS.red + 'cc', borderColor: COLORS.red, borderWidth: 1, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: !reducedMotion,
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') } } },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } },
        },
      },
    });

    if (container) setSummary(container, 'chart-income-expense', summaryText(data, 'income-expense'));
  } catch (e) {
    console.warn('Income/expense chart failed:', e);
    noDataMessage(canvas);
  }
}

// ─── Spending Trend ───

async function renderSpendingTrend(canvas, container, from, to) {
  if (!canvas) return;
  destroyChart('trend');
  try {
    const f = from || daysAgo(29);
    const t = to || todayStr();
    const data = await Api.get(`/charts/spending-trend?from=${f}&to=${t}&interval=daily`);

    if (!data.labels || data.labels.length === 0) { noDataMessage(canvas); return; }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    const rawData = data.datasets[0].data;
    const ma7 = movingAverage(rawData, 7);

    charts.trend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Daily Spending', data: rawData, borderColor: COLORS.accent, backgroundColor: COLORS.accent + '1a', fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: COLORS.accent },
          { label: '7-day Avg', data: ma7, borderColor: COLORS.yellow, backgroundColor: 'transparent', tension: 0.4, pointRadius: 0, borderWidth: 2, borderDash: [5, 3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: !reducedMotion,
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, callback: function (val) { const label = this.getLabelForValue(val); return label ? label.slice(5) : ''; } } },
          y: { beginAtZero: true, ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') } },
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Spending: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } } },
      },
    });

    if (container) setSummary(container, 'chart-trend', summaryText(data, 'spending-trend'));
  } catch (e) {
    console.warn('Trend chart failed:', e);
    noDataMessage(canvas);
  }
}

// ─── A5: Budget Burn-Down ───

export async function renderBudgetBurnDown(canvas, container) {
  if (!canvas) return;
  destroyChart('budgetBurnDown');
  try {
    // Find active budget
    const budgetData = await Api.get('/budgets?is_active=1').catch(() => ({ budgets: [] }));
    const budgets = budgetData.budgets || [];
    if (budgets.length === 0) { noDataMessage(canvas); return; }

    const budget = budgets[0];
    const data = await Api.get(`/charts/budget-utilization?budget_id=${budget.id}`);
    if (!data || !data.labels || data.labels.length === 0) { noDataMessage(canvas); return; }
    clearNoData(canvas);

    const allocated = data.datasets.find(d => d.name === 'Allocated')?.data || [];
    const spent = data.datasets.find(d => d.name === 'Spent')?.data || [];
    const totalAllocated = allocated.reduce((s, v) => s + v, 0);
    const totalSpent = spent.reduce((s, v) => s + v, 0);

    // Build burn-down: ideal line from totalAllocated to 0 over budget period
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const elapsed = Math.max(0, Math.min(totalDays, Math.round((new Date() - start) / 86400000)));

    const labels = [];
    const idealLine = [];
    const actualLine = [];
    const step = totalAllocated / totalDays;
    for (let d = 0; d <= totalDays; d += Math.max(1, Math.round(totalDays / 15))) {
      labels.push(`Day ${d}`);
      idealLine.push(Math.round((totalAllocated - step * d) * 100) / 100);
      if (d <= elapsed) {
        const pctElapsed = d / totalDays;
        actualLine.push(Math.round((totalAllocated - totalSpent * (pctElapsed / (elapsed / totalDays || 1))) * 100) / 100);
      }
    }

    const COLORS = getThemeColors();
    charts.budgetBurnDown = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Ideal Pace', data: idealLine, borderColor: COLORS.green, borderDash: [5, 5], tension: 0, pointRadius: 0, borderWidth: 2 },
          { label: 'Actual Remaining', data: actualLine, borderColor: totalSpent > totalAllocated * (elapsed / totalDays) ? COLORS.red : COLORS.accent, fill: false, tension: 0.2, pointRadius: 3, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: !reducedMotion,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } },
        },
      },
    });

    if (container) setSummary(container, 'chart-budget-burndown', `${fmt(totalSpent)} / ${fmt(totalAllocated)} spent`);
  } catch (e) {
    console.warn('Budget burn-down failed:', e);
    noDataMessage(canvas);
  }
}

// ─── A6: Cash Flow Forecast ───

export async function renderForecast(canvas, container) {
  if (!canvas) return;
  destroyChart('forecast');
  try {
    const data = await Api.get('/reports/cashflow-forecast?days=30');
    const forecast = data.forecast || data.days || data;

    if (!Array.isArray(forecast) || forecast.length === 0) { noDataMessage(canvas); return; }
    clearNoData(canvas);

    const labels = forecast.map(d => d.date || d.day);
    const balances = forecast.map(d => d.balance ?? d.projected_balance ?? 0);

    const COLORS = getThemeColors();
    const minBal = Math.min(...balances);

    charts.forecast = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Projected Balance', data: balances, borderColor: COLORS.cyan, backgroundColor: COLORS.cyan + '1a', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: !reducedMotion,
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, callback: function (val) { const l = this.getLabelForValue(val); return l ? l.slice(5) : ''; } } },
          y: { ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `Balance: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } },
        },
      },
    });

    if (container) {
      const summaryMsg = minBal < 0 ? `⚠️ Balance may dip to ${fmt(minBal)}` : `Lowest: ${fmt(minBal)}`;
      setSummary(container, 'chart-forecast', summaryMsg);
    }
  } catch (e) {
    console.warn('Forecast chart failed:', e);
    noDataMessage(canvas);
  }
}

export { destroyCharts };
