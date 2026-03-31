// PersonalFi — Dashboard Chart Rendering (ES module)
import { Api } from './utils.js';

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

let spendingChart = null;
let incomeExpenseChart = null;
let trendChart = null;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function sixMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

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
  const msg = canvas.parentElement.querySelector('.chart-no-data');
  if (msg) msg.remove();
}

function destroyCharts() {
  if (spendingChart) { spendingChart.destroy(); spendingChart = null; }
  if (incomeExpenseChart) { incomeExpenseChart.destroy(); incomeExpenseChart = null; }
  if (trendChart) { trendChart.destroy(); trendChart = null; }
}

export async function initDashboardCharts(container) {
  if (typeof Chart === 'undefined') return;

  destroyCharts();

  const defaults = getChartDefaults();
  Chart.defaults.color = defaults.color;
  Chart.defaults.borderColor = defaults.borderColor;

  const grid = container.querySelector('.charts-grid');
  if (!grid) return;

  await Promise.all([
    renderSpendingByCategory(grid.querySelector('#chart-spending')),
    renderIncomeVsExpense(grid.querySelector('#chart-income-expense')),
    renderSpendingTrend(grid.querySelector('#chart-trend')),
  ]);
}

async function renderSpendingByCategory(canvas) {
  if (!canvas) return;
  try {
    const from = monthStart();
    const to = todayStr();
    const data = await Api.get(`/charts/spending-pie?from=${from}&to=${to}`);

    if (!data.labels || data.labels.length === 0) {
      noDataMessage(canvas);
      return;
    }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    const PIE_COLORS = [
      COLORS.accent, COLORS.green, COLORS.red, COLORS.yellow,
      COLORS.cyan, COLORS.pink, COLORS.orange, COLORS.purple,
      COLORS.lime, COLORS.teal, COLORS.rose, COLORS.accentLight,
    ];

    spendingChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.datasets[0].data,
          backgroundColor: PIE_COLORS.slice(0, data.labels.length),
          borderColor: getCSSColor('--bg-secondary', '#1e293b'),
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: !reducedMotion,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pct = data.meta?.[ctx.dataIndex]?.percentage ?? 0;
                return `${ctx.label}: ₹${ctx.parsed.toLocaleString('en-IN')} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  } catch {
    noDataMessage(canvas);
  }
}

async function renderIncomeVsExpense(canvas) {
  if (!canvas) return;
  try {
    const from = sixMonthsAgo();
    const to = todayStr();
    const data = await Api.get(`/charts/income-expense?from=${from}&to=${to}&interval=monthly`);

    if (!data.labels || data.labels.length === 0) {
      noDataMessage(canvas);
      return;
    }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    incomeExpenseChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Income',
            data: data.datasets[0].data,
            backgroundColor: COLORS.green + 'cc',
            borderColor: COLORS.green,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Expense',
            data: data.datasets[1].data,
            backgroundColor: COLORS.red + 'cc',
            borderColor: COLORS.red,
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: !reducedMotion,
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` },
          },
        },
      },
    });
  } catch {
    noDataMessage(canvas);
  }
}

async function renderSpendingTrend(canvas) {
  if (!canvas) return;
  try {
    const from = thirtyDaysAgo();
    const to = todayStr();
    const data = await Api.get(`/charts/spending-trend?from=${from}&to=${to}&interval=daily`);

    if (!data.labels || data.labels.length === 0) {
      noDataMessage(canvas);
      return;
    }
    clearNoData(canvas);

    const COLORS = getThemeColors();
    trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Daily Spending',
          data: data.datasets[0].data,
          borderColor: COLORS.accent,
          backgroundColor: COLORS.accent + '1a',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: COLORS.accent,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: !reducedMotion,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 10,
              callback: function (val, i) {
                const label = this.getLabelForValue(val);
                return label ? label.slice(5) : '';
              },
            },
          },
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => '₹' + v.toLocaleString('en-IN') },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => `Spending: ₹${ctx.parsed.y.toLocaleString('en-IN')}` },
          },
        },
      },
    });
  } catch {
    noDataMessage(canvas);
  }
}

export { destroyCharts };
