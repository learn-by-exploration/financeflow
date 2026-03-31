// PersonalFi — Financial Health & Reports View
import { Api, fmt, el } from '../utils.js';

export async function renderHealth(container) {
  container.innerHTML = '';
  const header = el('div', { className: 'view-header' }, [el('h2', { textContent: 'Financial Health' })]);
  container.appendChild(header);

  const data = await Api.get('/stats/financial-health');

  if (data.gated) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '📊' }),
      el('h3', { textContent: 'Not enough data yet' }),
      el('p', { textContent: data.message }),
    ]));
    return;
  }

  // Score card
  const scoreColor = data.score >= 80 ? 'green' : data.score >= 60 ? 'yellow' : 'red';
  const scoreCard = el('div', { className: 'card health-score-card' }, [
    el('div', { className: 'health-score-ring' }, [
      el('div', { className: `health-score-value ${scoreColor}`, textContent: String(data.score) }),
      el('div', { className: 'health-score-label', textContent: data.grade || 'Score' }),
    ]),
    el('div', { className: 'health-score-details' }, [
      el('p', { textContent: data.summary || 'Your financial health assessment' }),
    ]),
  ]);
  container.appendChild(scoreCard);

  // Ratios
  if (data.ratios) {
    const ratiosCard = el('div', { className: 'card' }, [
      el('h3', { textContent: 'Financial Ratios' }),
      ...Object.entries(data.ratios).map(([key, val]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const displayVal = typeof val === 'number' ? `${(val * 100).toFixed(1)}%` : String(val);
        return el('div', { className: 'settings-row' }, [
          el('span', { className: 'settings-label', textContent: label }),
          el('span', { className: 'settings-value', textContent: displayVal }),
        ]);
      }),
    ]);
    container.appendChild(ratiosCard);
  }

  // Recommendations
  if (data.recommendations && data.recommendations.length) {
    const recsCard = el('div', { className: 'card' }, [
      el('h3', { textContent: 'Recommendations' }),
      ...data.recommendations.map(r =>
        el('div', { className: 'rec-item' }, [
          el('span', { className: 'material-icons-round', textContent: 'lightbulb' }),
          el('span', { textContent: r }),
        ])
      ),
    ]);
    container.appendChild(recsCard);
  }
}

export async function renderReports(container) {
  container.innerHTML = '';
  const header = el('div', { className: 'view-header' }, [el('h2', { textContent: 'Reports' })]);
  container.appendChild(header);

  // Trends
  const { trends } = await Api.get('/stats/trends?months=12');

  if (trends.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '📈' }),
      el('h3', { textContent: 'No data for reports' }),
      el('p', { textContent: 'Add transactions to see trends and analytics.' }),
    ]));
    return;
  }

  // Monthly trend table
  const trendCard = el('div', { className: 'card' }, [
    el('h3', { textContent: 'Income vs Expenses (12 months)' }),
    (() => {
      const table = el('table', { className: 'data-table' });
      table.appendChild(el('thead', {}, [el('tr', {}, [
        el('th', { textContent: 'Month' }),
        el('th', { className: 'text-right', textContent: 'Income' }),
        el('th', { className: 'text-right', textContent: 'Expenses' }),
        el('th', { className: 'text-right', textContent: 'Net' }),
      ])]));
      const tbody = el('tbody');
      trends.forEach(t => {
        const net = t.income - t.expense;
        tbody.appendChild(el('tr', {}, [
          el('td', { textContent: t.month, 'data-label': 'Month' }),
          el('td', { className: 'text-right income', textContent: fmt(t.income), 'data-label': 'Income' }),
          el('td', { className: 'text-right expense', textContent: fmt(t.expense), 'data-label': 'Expenses' }),
          el('td', { className: `text-right ${net >= 0 ? 'income' : 'expense'}`, textContent: fmt(net), 'data-label': 'Net' }),
        ]));
      });
      table.appendChild(tbody);
      return table;
    })(),
  ]);
  container.appendChild(trendCard);

  // Visual bars
  if (trends.length > 0) {
    const maxVal = Math.max(...trends.map(t => Math.max(t.income, t.expense)), 1);
    const barsCard = el('div', { className: 'card' }, [
      el('h3', { textContent: 'Monthly Overview' }),
      el('div', { className: 'trend-bars' },
        trends.map(t => {
          const inPct = (t.income / maxVal * 100).toFixed(1);
          const exPct = (t.expense / maxVal * 100).toFixed(1);
          return el('div', { className: 'trend-bar-group' }, [
            el('div', { className: 'trend-bar-pair' }, [
              (() => { const b = el('div', { className: 'trend-bar income-bar' }); b.style.height = `${inPct}%`; return b; })(),
              (() => { const b = el('div', { className: 'trend-bar expense-bar' }); b.style.height = `${exPct}%`; return b; })(),
            ]),
            el('span', { className: 'trend-bar-label', textContent: t.month.slice(5) }),
          ]);
        })
      ),
    ]);
    container.appendChild(barsCard);
  }

  // Category breakdown
  const { breakdown } = await Api.get('/stats/category-breakdown');
  if (breakdown.length) {
    const total = breakdown.reduce((s, c) => s + c.total, 0);
    const catCard = el('div', { className: 'card' }, [
      el('h3', { textContent: 'Spending by Category' }),
      ...breakdown.map(c => {
        const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
        return el('div', { className: 'cat-breakdown-row' }, [
          el('div', { className: 'cat-breakdown-info' }, [
            el('span', { textContent: `${c.icon} ${c.name}` }),
            el('span', { className: 'cat-breakdown-pct', textContent: `${pct}%` }),
          ]),
          (() => {
            const bar = el('div', { className: 'progress-bar' });
            const fill = el('div', { className: 'progress-fill' });
            fill.style.width = `${pct}%`;
            fill.style.background = c.color || 'var(--accent)';
            bar.appendChild(fill);
            return bar;
          })(),
          el('div', { className: 'cat-breakdown-amt', textContent: `${fmt(c.total)} (${c.count} txns)` }),
        ]);
      }),
    ]);
    container.appendChild(catCard);
  }

  // ─── Year in Review Section ───
  const yirCard = el('div', { className: 'card' }, [
    el('h3', { textContent: 'Year in Review' }),
    el('p', { textContent: 'View your annual financial summary.' }),
  ]);
  const yirForm = el('form', { className: 'form-inline' });
  const yearInput = el('input', { type: 'number', className: 'form-input', placeholder: 'YYYY', value: String(new Date().getFullYear()), min: '2000', max: '2099', style: 'width:100px;margin-right:8px' });
  const yirBtn = el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'View' });
  yirForm.appendChild(yearInput);
  yirForm.appendChild(yirBtn);
  yirCard.appendChild(yirForm);

  const yirResult = el('div', { className: 'yir-result' });
  yirCard.appendChild(yirResult);

  yirForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    yirResult.innerHTML = '<p>Loading...</p>';
    try {
      const data = await Api.get(`/reports/year-in-review?year=${yearInput.value}`);
      yirResult.innerHTML = '';
      const statsGrid = el('div', { className: 'stats-grid' }, [
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Income' }), el('div', { className: 'stat-value income', textContent: fmt(data.total_income) })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Expenses' }), el('div', { className: 'stat-value expense', textContent: fmt(data.total_expenses) })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Net Savings' }), el('div', { className: 'stat-value', textContent: fmt(data.net_savings) })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Savings Rate' }), el('div', { className: 'stat-value', textContent: `${data.savings_rate}%` })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Transactions' }), el('div', { className: 'stat-value', textContent: String(data.transaction_count) })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Avg Daily Spending' }), el('div', { className: 'stat-value', textContent: fmt(data.average_daily_spending) })]),
      ]);
      yirResult.appendChild(statsGrid);

      if (data.biggest_expense) {
        yirResult.appendChild(el('p', { textContent: `Biggest expense: ${data.biggest_expense.description} — ${fmt(data.biggest_expense.amount)} on ${data.biggest_expense.date}` }));
      }
      if (data.most_frequent_merchant) {
        yirResult.appendChild(el('p', { textContent: `Most frequent: ${data.most_frequent_merchant.description} (${data.most_frequent_merchant.count} times)` }));
      }
    } catch (err) {
      yirResult.textContent = '';
      yirResult.appendChild(el('p', { className: 'error', textContent: `Failed to load: ${err.message}` }));
    }
  });

  container.appendChild(yirCard);
}
