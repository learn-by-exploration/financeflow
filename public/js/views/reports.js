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

  // Ratios with benchmark bars and status indicators
  if (data.ratios && Array.isArray(data.ratios)) {
    const ratiosCard = el('div', { className: 'card' }, [
      el('h3', { textContent: 'Financial Ratios' }),
      ...data.ratios.map(r => {
        const pct = r.max > 0 ? Math.min(100, Math.round((r.score / r.max) * 100)) : 0;
        const statusIcon = r.score >= r.max ? 'check_circle' : r.score > 0 ? 'warning' : 'cancel';
        const statusClass = r.score >= r.max ? 'green' : r.score > 0 ? 'yellow' : 'red';
        return el('div', { className: 'ratio-card' }, [
          el('div', { className: 'ratio-header' }, [
            el('span', { className: `material-icons-round ratio-status ${statusClass}`, textContent: statusIcon }),
            el('span', { className: 'ratio-name', textContent: r.name }),
            el('span', { className: 'ratio-score', textContent: `${r.score}/${r.max}` }),
          ]),
          el('div', { className: 'progress-bar ratio-bar' }, [
            (() => { const fill = el('div', { className: 'progress-fill' }); fill.style.width = `${pct}%`; return fill; })(),
          ]),
          el('p', { className: 'ratio-tip text-muted', textContent: r.recommendation }),
        ]);
      }),
    ]);
    container.appendChild(ratiosCard);
  } else if (data.ratios) {
    // Fallback for flat object ratios
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

  // Expected Net Worth (Stanley formula: Age × Annual Income / 10)
  if (data.avg_monthly_income) {
    const expectedNWCard = el('div', { className: 'card' }, [
      el('h3', { textContent: 'Expected Net Worth' }),
      el('p', { className: 'text-muted', textContent: 'Based on "The Millionaire Next Door" formula: Age × Annual Income ÷ 10' }),
    ]);
    const ageInput = el('input', { type: 'number', className: 'form-input', placeholder: 'Your age', min: '18', max: '100', style: 'width:120px;margin-right:8px' });
    const calcBtn = el('button', { className: 'btn btn-primary btn-sm', textContent: 'Calculate' });
    const resultDiv = el('div', { className: 'enw-result' });
    const formRow = el('div', { className: 'form-inline', style: 'margin-top:8px' }, [ageInput, calcBtn]);
    expectedNWCard.appendChild(formRow);
    expectedNWCard.appendChild(resultDiv);
    calcBtn.addEventListener('click', () => {
      const age = parseInt(ageInput.value, 10);
      if (!age || age < 18) return;
      const annualIncome = data.avg_monthly_income * 12;
      const expectedNW = (age * annualIncome) / 10;
      const actualNW = data.net_worth || 0;
      const ratio = expectedNW > 0 ? ((actualNW / expectedNW) * 100).toFixed(0) : 0;
      const status = actualNW >= expectedNW ? 'Prodigious Accumulator' : actualNW >= expectedNW / 2 ? 'Average Accumulator' : 'Under Accumulator';
      resultDiv.innerHTML = '';
      resultDiv.appendChild(el('div', { className: 'stats-grid', style: 'margin-top:8px' }, [
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Expected' }), el('div', { className: 'stat-value', textContent: fmt(expectedNW) })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Actual' }), el('div', { className: 'stat-value', textContent: fmt(actualNW) })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Ratio' }), el('div', { className: 'stat-value', textContent: `${ratio}%` })]),
        el('div', { className: 'stat-card' }, [el('div', { className: 'stat-label', textContent: 'Status' }), el('div', { className: 'stat-value', textContent: status })]),
      ]));
    });
    container.appendChild(expectedNWCard);
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

  // ─── Planning Tools (calculators) ───
  renderPlanningTools(container);
}

function renderPlanningTools(container) {
  const section = el('div', { className: 'card planning-tools-section' }, [
    el('h3', { textContent: 'Planning Tools' }),
  ]);

  const calcs = [
    { id: 'sip', label: 'SIP Calculator', desc: 'Systematic Investment Plan returns', fields: [
      { name: 'monthly', label: 'Monthly Investment (₹)', val: '10000' },
      { name: 'return', label: 'Expected Return (%)', val: '12' },
      { name: 'years', label: 'Period (years)', val: '20' },
      { name: 'step_up', label: 'Annual Step-Up (%)', val: '10' },
    ], endpoint: '/stats/sip-calculator', resultKeys: ['total_invested', 'future_value', 'total_returns', 'return_multiple'] },
    { id: 'lumpsum', label: 'Lumpsum Calculator', desc: 'One-time investment growth', fields: [
      { name: 'principal', label: 'Investment Amount (₹)', val: '100000' },
      { name: 'return', label: 'Expected Return (%)', val: '12' },
      { name: 'years', label: 'Period (years)', val: '10' },
    ], endpoint: '/stats/lumpsum-calculator', resultKeys: ['principal', 'future_value', 'total_returns'] },
    { id: 'emi', label: 'EMI Calculator', desc: 'Loan EMI and amortization', fields: [
      { name: 'principal', label: 'Loan Amount (₹)', val: '1000000' },
      { name: 'rate', label: 'Annual Rate (%)', val: '8.5' },
      { name: 'tenure', label: 'Tenure (months)', val: '240' },
    ], endpoint: '/stats/emi-calculator', resultKeys: ['monthly_emi', 'total_payment', 'total_interest'] },
    { id: 'fire', label: 'FIRE Calculator', desc: 'Financial Independence, Retire Early', fields: [
      { name: 'annual_expense', label: 'Annual Expenses (₹)', val: '600000' },
      { name: 'safe_withdrawal_rate', label: 'Safe Withdrawal Rate (%)', val: '4' },
      { name: 'inflation', label: 'Inflation Rate (%)', val: '6' },
      { name: 'years', label: 'Years to Retirement', val: '20' },
    ], endpoint: '/stats/fire-calculator', resultKeys: ['fire_number', 'future_annual_expense', 'monthly_sip_needed'] },
  ];

  for (const calc of calcs) {
    const details = el('details', { className: 'calculator-card' });
    const summary = el('summary', { className: 'calculator-header' }, [
      el('span', { className: 'material-icons-round', textContent: 'calculate' }),
      el('span', { textContent: calc.label }),
    ]);
    details.appendChild(summary);

    const resultArea = el('div', { className: 'calculator-results' });
    const formDiv = el('div', { className: 'calculator-form' }, [
      el('p', { className: 'text-muted', textContent: calc.desc }),
      ...calc.fields.map(f =>
        el('div', { className: 'form-group' }, [
          el('label', { textContent: f.label, htmlFor: `calc-${calc.id}-${f.name}` }),
          el('input', { type: 'number', id: `calc-${calc.id}-${f.name}`, className: 'form-input', value: f.val }),
        ])
      ),
      el('button', {
        className: 'btn btn-primary',
        textContent: 'Calculate',
        onClick: async () => {
          const params = calc.fields.map(f => {
            const input = document.getElementById(`calc-${calc.id}-${f.name}`);
            return `${f.name}=${encodeURIComponent(input ? input.value : f.val)}`;
          }).join('&');
          try {
            const data = await Api.get(`${calc.endpoint}?${params}`);
            resultArea.innerHTML = '';
            resultArea.appendChild(el('div', { className: 'result-card card' }, [
              el('h4', { textContent: calc.label }),
              ...calc.resultKeys.map(k => {
                const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const val = typeof data[k] === 'number' && !k.includes('multiple') ? fmt.currency(data[k]) : String(data[k]);
                return el('div', { className: 'result-row' }, [
                  el('span', { className: 'result-label', textContent: label }),
                  el('span', { className: 'result-value', textContent: val }),
                ]);
              }),
            ]));
          } catch (err) {
            resultArea.innerHTML = '';
            resultArea.appendChild(el('p', { className: 'error', textContent: err.message }));
          }
        },
      }),
    ]);
    details.appendChild(formDiv);
    details.appendChild(resultArea);
    section.appendChild(details);
  }

  container.appendChild(section);
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

  // ─── Net Worth History ───
  try {
    const nwData = await Api.get('/net-worth/history?limit=12');
    if (nwData.snapshots && nwData.snapshots.length > 0) {
      const maxNW = Math.max(...nwData.snapshots.map(s => Math.abs(s.net_worth)), 1);
      const nwCard = el('div', { className: 'card' }, [
        el('h3', { textContent: 'Net Worth History' }),
        el('div', { className: 'trend-bars net-worth-chart' },
          nwData.snapshots.map(s => {
            const pct = (Math.abs(s.net_worth) / maxNW * 100).toFixed(1);
            const barClass = s.net_worth >= 0 ? 'income-bar' : 'expense-bar';
            return el('div', { className: 'trend-bar-group' }, [
              el('div', { className: 'trend-bar-pair' }, [
                (() => { const b = el('div', { className: `trend-bar ${barClass}` }); b.style.height = `${pct}%`; return b; })(),
              ]),
              el('span', { className: 'trend-bar-label', textContent: s.date.slice(5) }),
            ]);
          })
        ),
      ]);
      container.appendChild(nwCard);
    }
  } catch { /* net worth history not available */ }

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

  // ─── Cash Flow Forecast ───
  const cfCard = el('div', { className: 'card' }, [
    el('h3', { textContent: 'Cash Flow Forecast' }),
    el('p', { className: 'text-muted', textContent: 'Projected balance based on recurring rules and subscriptions.' }),
  ]);
  const cfBtns = el('div', { className: 'btn-group', style: 'margin-bottom:8px' });
  const cfResult = el('div', { className: 'cashflow-forecast-result' });

  for (const days of [30, 60, 90]) {
    const btn = el('button', { className: 'btn btn-sm', textContent: `${days} days` });
    btn.addEventListener('click', async () => {
      cfResult.textContent = 'Loading...';
      try {
        const data = await Api.get(`/reports/cashflow-forecast?days=${days}`);
        cfResult.innerHTML = '';
        if (!data.forecast || data.forecast.length === 0) {
          cfResult.appendChild(el('p', { textContent: 'No forecast data available.' }));
          return;
        }
        const maxBal = Math.max(...data.forecast.map(f => Math.abs(f.projected_balance)), 1);
        const chartDiv = el('div', { className: 'trend-bars cash-flow-chart' });
        // Show every Nth entry to avoid overcrowding
        const step = Math.max(1, Math.floor(data.forecast.length / 15));
        for (let i = 0; i < data.forecast.length; i += step) {
          const f = data.forecast[i];
          const pct = (Math.abs(f.projected_balance) / maxBal * 100).toFixed(1);
          const barClass = f.projected_balance >= 0 ? 'income-bar' : 'expense-bar';
          chartDiv.appendChild(el('div', { className: 'trend-bar-group' }, [
            el('div', { className: 'trend-bar-pair' }, [
              (() => { const b = el('div', { className: `trend-bar ${barClass}` }); b.style.height = `${pct}%`; return b; })(),
            ]),
            el('span', { className: 'trend-bar-label', textContent: f.date.slice(5) }),
          ]));
        }
        cfResult.appendChild(chartDiv);
        const last = data.forecast[data.forecast.length - 1];
        cfResult.appendChild(el('p', { textContent: `Projected balance on ${last.date}: ${fmt(last.projected_balance)}` }));
      } catch (err) {
        cfResult.textContent = '';
        cfResult.appendChild(el('p', { className: 'error', textContent: `Failed: ${err.message}` }));
      }
    });
    cfBtns.appendChild(btn);
  }
  cfCard.appendChild(cfBtns);
  cfCard.appendChild(cfResult);
  container.appendChild(cfCard);
}
