// PersonalFi — Recurring Transactions View
import { Api, fmt, el, toast, openModal, closeModal, confirm } from '../utils.js';

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export async function renderRecurring(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';

  const [rulesData, suggestionsData, acctData] = await Promise.all([
    Api.get('/recurring'),
    Api.get('/recurring/suggestions'),
    Api.get('/accounts'),
  ]);

  const rules = rulesData.rules || [];
  const suggestions = suggestionsData.suggestions || [];
  const accounts = acctData.accounts || [];

  container.innerHTML = '';

  // Header
  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon recurring', textContent: 'repeat' }),
      el('span', { textContent: 'Recurring Transactions' }),
    ]),
  ]);
  container.appendChild(header);

  // Stats
  const active = rules.filter(r => r.is_active);
  const monthlyTotal = active.reduce((sum, r) => {
    if (r.type === 'expense') {
      const mult = { daily: 30, weekly: 4.33, monthly: 1, quarterly: 1/3, yearly: 1/12 };
      return sum + r.amount * (mult[r.frequency] || 1);
    }
    return sum;
  }, 0);

  const stats = el('div', { className: 'stats-grid' }, [
    statCard('Active Rules', String(active.length), 'green'),
    statCard('Monthly Recurring', fmt(Math.round(monthlyTotal)), 'red'),
    statCard('Suggestions', String(suggestions.length), 'accent'),
  ]);
  container.appendChild(stats);

  // Suggestions section
  if (suggestions.length > 0) {
    container.appendChild(el('h3', { className: 'section-title', textContent: 'Detected Patterns' }));
    container.appendChild(el('p', { className: 'section-desc', textContent: 'We detected these recurring patterns in your transactions.' }));
    const sugGrid = el('div', { className: 'suggestions-grid' });
    for (const s of suggestions) {
      sugGrid.appendChild(suggestionCard(s, accounts, container));
    }
    container.appendChild(sugGrid);
  }

  // Active rules
  if (active.length > 0) {
    container.appendChild(el('h3', { className: 'section-title', textContent: 'Active Rules' }));
    const grid = el('div', { className: 'recurring-grid' });
    for (const r of active) {
      grid.appendChild(ruleCard(r, container));
    }
    container.appendChild(grid);
  }

  // Inactive rules
  const inactive = rules.filter(r => !r.is_active);
  if (inactive.length > 0) {
    container.appendChild(el('h3', { className: 'section-title', textContent: 'Inactive Rules' }));
    const grid = el('div', { className: 'recurring-grid' });
    for (const r of inactive) {
      grid.appendChild(ruleCard(r, container));
    }
    container.appendChild(grid);
  }

  if (rules.length === 0 && suggestions.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '🔄' }),
      el('h3', { textContent: 'No recurring transactions' }),
      el('p', { textContent: 'Add more transactions to detect recurring patterns automatically.' }),
    ]));
  }
}

function statCard(label, value, color) {
  return el('div', { className: `stat-card ${color}` }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
  ]);
}

function suggestionCard(suggestion, accounts, container) {
  const freqLabel = FREQUENCIES.find(f => f.value === suggestion.frequency)?.label || suggestion.frequency;
  const confidence = Math.round(suggestion.confidence * 100);

  const card = el('div', { className: 'card suggestion-card' }, [
    el('div', { className: 'suggestion-header' }, [
      el('div', { className: 'suggestion-info' }, [
        el('div', { className: 'suggestion-name', textContent: suggestion.description }),
        el('div', { className: 'suggestion-meta' }, [
          el('span', { className: `badge ${suggestion.type}`, textContent: suggestion.type }),
          el('span', { textContent: freqLabel }),
          el('span', { textContent: `${suggestion.occurrence_count} occurrences` }),
          el('span', { textContent: `${confidence}% confidence` }),
        ]),
      ]),
      el('div', { className: 'suggestion-amount', textContent: fmt(suggestion.amount) }),
    ]),
    el('div', { className: 'suggestion-actions' }, [
      el('button', { className: 'btn btn-primary btn-sm', textContent: 'Accept', onClick: async () => {
        try {
          // Compute next expected date
          const nextDate = computeNextDate(suggestion.last_date, suggestion.frequency);
          await Api.post('/recurring/suggestions/accept', {
            pattern_hash: suggestion.pattern_hash,
            description: suggestion.description,
            amount: suggestion.amount,
            account_id: suggestion.account_id,
            frequency: suggestion.frequency,
            type: suggestion.type,
            next_date: nextDate,
          });
          toast('Recurring rule created', 'success');
          renderRecurring(container);
        } catch (err) { toast(err.message, 'error'); }
      }}),
      el('button', { className: 'btn btn-secondary btn-sm', textContent: 'Dismiss', onClick: async () => {
        try {
          await Api.post('/recurring/suggestions/dismiss', { pattern_hash: suggestion.pattern_hash });
          toast('Suggestion dismissed', 'info');
          renderRecurring(container);
        } catch (err) { toast(err.message, 'error'); }
      }}),
    ]),
  ]);

  return card;
}

function ruleCard(rule, container) {
  const freqLabel = FREQUENCIES.find(f => f.value === rule.frequency)?.label || rule.frequency;
  const card = el('div', { className: `card recurring-card ${rule.is_active ? '' : 'inactive'}` }, [
    el('div', { className: 'recurring-card-header' }, [
      el('div', { className: 'recurring-card-info' }, [
        el('div', { className: 'recurring-card-name', textContent: rule.description }),
        el('div', { className: 'recurring-card-meta' }, [
          el('span', { className: `badge ${rule.type}`, textContent: rule.type }),
          el('span', { textContent: freqLabel }),
          rule.next_date ? el('span', { textContent: `Next: ${rule.next_date}` }) : null,
          rule.account_name ? el('span', { textContent: `${rule.account_icon || ''} ${rule.account_name}` }) : null,
        ].filter(Boolean)),
      ]),
      el('div', { className: 'recurring-card-amount' }, [
        el('span', { className: rule.type === 'expense' ? 'expense' : 'income', textContent: fmt(rule.amount) }),
      ]),
    ]),
    el('div', { className: 'recurring-card-actions' }, [
      el('button', { className: 'btn-icon', title: 'Skip next', onClick: async () => {
        try {
          await Api.post(`/recurring/${rule.id}/skip`);
          toast('Skipped to next occurrence', 'info');
          renderRecurring(container);
        } catch (err) { toast(err.message, 'error'); }
      }}, [el('span', { className: 'material-icons-round', textContent: 'skip_next' })]),
      el('button', { className: 'btn-icon', title: rule.is_active ? 'Pause' : 'Activate', onClick: async () => {
        try {
          await Api.put(`/recurring/${rule.id}`, { is_active: rule.is_active ? 0 : 1 });
          toast(rule.is_active ? 'Rule paused' : 'Rule activated', 'info');
          renderRecurring(container);
        } catch (err) { toast(err.message, 'error'); }
      }}, [el('span', { className: 'material-icons-round', textContent: rule.is_active ? 'pause' : 'play_arrow' })]),
      el('button', { className: 'btn-icon danger', title: 'Delete', onClick: async () => {
        if (await confirm('Delete this recurring rule?')) {
          try {
            await Api.del(`/recurring/${rule.id}`);
            toast('Rule deleted', 'success');
            renderRecurring(container);
          } catch (err) { toast(err.message, 'error'); }
        }
      }}, [el('span', { className: 'material-icons-round', textContent: 'delete' })]),
    ]),
  ]);
  return card;
}

function computeNextDate(lastDate, frequency) {
  const d = new Date(lastDate + 'T00:00:00Z');
  switch (frequency) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}
