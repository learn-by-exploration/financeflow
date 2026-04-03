// public/js/views/calculators.js — Financial Calculators View
import { Api, fmt, el, toast } from '../utils.js';
import { showLoading, showEmpty, showError, hideStates } from '../ui-states.js';

export async function renderCalculators(container) {
  container.innerHTML = '';

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Financial Calculators' }),
  ]);
  container.appendChild(header);

  const tabs = el('div', { className: 'tabs' }, [
    createTab('SIP', 'sip', true),
    createTab('Lumpsum', 'lumpsum', false),
    createTab('EMI', 'emi', false),
    createTab('FIRE', 'fire', false),
  ]);
  container.appendChild(tabs);

  const resultArea = el('div', { className: 'calculator-results', id: 'calc-results' });
  container.appendChild(resultArea);

  // Show SIP by default
  renderSIPForm(container, resultArea);
}

function createTab(label, id, active) {
  const btn = el('button', {
    className: `tab-btn ${active ? 'active' : ''}`,
    textContent: label,
    dataset: { tab: id },
    onClick: (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const container = e.target.closest('.view-container') || e.target.parentElement.parentElement;
      const resultArea = document.getElementById('calc-results');
      if (resultArea) resultArea.innerHTML = '';
      const formArea = document.querySelector('.calculator-form');
      if (formArea) formArea.remove();
      switch (id) {
        case 'sip': renderSIPForm(container, resultArea); break;
        case 'lumpsum': renderLumpsumForm(container, resultArea); break;
        case 'emi': renderEMIForm(container, resultArea); break;
        case 'fire': renderFIREForm(container, resultArea); break;
      }
    },
  });
  return btn;
}

function renderSIPForm(container, resultArea) {
  const form = el('div', { className: 'calculator-form card' }, [
    el('h3', { textContent: 'SIP Calculator' }),
    el('p', { className: 'text-muted', textContent: 'Calculate returns on Systematic Investment Plan' }),
    createInput('monthly', 'Monthly Investment (₹)', '10000', 'number'),
    createInput('return', 'Expected Return (%)', '12', 'number'),
    createInput('years', 'Investment Period (years)', '20', 'number'),
    createInput('step_up', 'Annual Step-Up (%)', '10', 'number'),
    el('button', {
      className: 'btn btn-primary',
      textContent: 'Calculate',
      onClick: async () => {
        const params = getFormValues(['monthly', 'return', 'years', 'step_up']);
        try {
          const data = await Api.get(`/stats/sip-calculator?monthly=${params.monthly}&return=${params.return}&years=${params.years}&step_up=${params.step_up}`);
          resultArea.innerHTML = '';
          resultArea.appendChild(el('div', { className: 'result-card card' }, [
            el('h4', { textContent: 'SIP Projection' }),
            resultRow('Total Invested', fmt.currency(data.total_invested)),
            resultRow('Future Value', fmt.currency(data.future_value)),
            resultRow('Total Returns', fmt.currency(data.total_returns)),
            resultRow('Return Multiple', `${data.return_multiple}x`),
          ]));
        } catch (err) { toast(err.message, 'error'); }
      },
    }),
  ]);
  insertFormBefore(container, resultArea, form);
}

function renderLumpsumForm(container, resultArea) {
  const form = el('div', { className: 'calculator-form card' }, [
    el('h3', { textContent: 'Lumpsum Calculator' }),
    el('p', { className: 'text-muted', textContent: 'Calculate one-time investment growth' }),
    createInput('principal', 'Investment Amount (₹)', '100000', 'number'),
    createInput('return', 'Expected Return (%)', '12', 'number'),
    createInput('years', 'Period (years)', '10', 'number'),
    el('button', {
      className: 'btn btn-primary',
      textContent: 'Calculate',
      onClick: async () => {
        const params = getFormValues(['principal', 'return', 'years']);
        try {
          const data = await Api.get(`/stats/lumpsum-calculator?principal=${params.principal}&return=${params.return}&years=${params.years}`);
          resultArea.innerHTML = '';
          resultArea.appendChild(el('div', { className: 'result-card card' }, [
            el('h4', { textContent: 'Lumpsum Projection' }),
            resultRow('Principal', fmt.currency(data.principal)),
            resultRow('Future Value', fmt.currency(data.future_value)),
            resultRow('Total Returns', fmt.currency(data.total_returns)),
          ]));
        } catch (err) { toast(err.message, 'error'); }
      },
    }),
  ]);
  insertFormBefore(container, resultArea, form);
}

function renderEMIForm(container, resultArea) {
  const form = el('div', { className: 'calculator-form card' }, [
    el('h3', { textContent: 'EMI Calculator' }),
    el('p', { className: 'text-muted', textContent: 'Calculate loan EMI and amortization' }),
    createInput('principal', 'Loan Amount (₹)', '1000000', 'number'),
    createInput('rate', 'Annual Rate (%)', '8.5', 'number'),
    createInput('tenure', 'Tenure (months)', '240', 'number'),
    el('button', {
      className: 'btn btn-primary',
      textContent: 'Calculate',
      onClick: async () => {
        const params = getFormValues(['principal', 'rate', 'tenure']);
        try {
          const data = await Api.get(`/stats/emi-calculator?principal=${params.principal}&rate=${params.rate}&tenure=${params.tenure}`);
          resultArea.innerHTML = '';
          resultArea.appendChild(el('div', { className: 'result-card card' }, [
            el('h4', { textContent: 'EMI Breakdown' }),
            resultRow('Monthly EMI', fmt.currency(data.monthly_emi)),
            resultRow('Total Payment', fmt.currency(data.total_payment)),
            resultRow('Total Interest', fmt.currency(data.total_interest)),
          ]));
        } catch (err) { toast(err.message, 'error'); }
      },
    }),
  ]);
  insertFormBefore(container, resultArea, form);
}

function renderFIREForm(container, resultArea) {
  const form = el('div', { className: 'calculator-form card' }, [
    el('h3', { textContent: 'FIRE Calculator' }),
    el('p', { className: 'text-muted', textContent: 'Financial Independence, Retire Early' }),
    createInput('annual_expense', 'Annual Expenses (₹)', '600000', 'number'),
    createInput('safe_withdrawal_rate', 'Safe Withdrawal Rate (%)', '4', 'number'),
    createInput('inflation', 'Inflation Rate (%)', '6', 'number'),
    createInput('years', 'Years to Retirement', '20', 'number'),
    el('button', {
      className: 'btn btn-primary',
      textContent: 'Calculate',
      onClick: async () => {
        const params = getFormValues(['annual_expense', 'safe_withdrawal_rate', 'inflation', 'years']);
        try {
          const data = await Api.get(`/stats/fire-calculator?annual_expense=${params.annual_expense}&safe_withdrawal_rate=${params.safe_withdrawal_rate}&inflation_rate=${params.inflation}&years=${params.years}`);
          resultArea.innerHTML = '';
          resultArea.appendChild(el('div', { className: 'result-card card' }, [
            el('h4', { textContent: 'FIRE Number' }),
            resultRow('FIRE Number', fmt.currency(data.fire_number)),
            resultRow('Future Annual Expense', fmt.currency(data.future_annual_expense)),
            resultRow('Monthly SIP Needed', fmt.currency(data.monthly_sip_needed)),
          ]));
        } catch (err) { toast(err.message, 'error'); }
      },
    }),
  ]);
  insertFormBefore(container, resultArea, form);
}

// ─── Helpers ───

function createInput(name, label, placeholder, type) {
  return el('div', { className: 'form-group' }, [
    el('label', { textContent: label, htmlFor: `calc-${name}` }),
    el('input', { type, id: `calc-${name}`, name, placeholder, className: 'form-input', value: placeholder }),
  ]);
}

function getFormValues(fields) {
  const values = {};
  for (const f of fields) {
    const input = document.getElementById(`calc-${f}`);
    values[f] = input ? input.value : '';
  }
  return values;
}

function resultRow(label, value) {
  return el('div', { className: 'result-row' }, [
    el('span', { className: 'result-label', textContent: label }),
    el('span', { className: 'result-value', textContent: value }),
  ]);
}

function insertFormBefore(container, resultArea, form) {
  if (resultArea && resultArea.parentElement) {
    resultArea.parentElement.insertBefore(form, resultArea);
  } else {
    container.appendChild(form);
  }
}
