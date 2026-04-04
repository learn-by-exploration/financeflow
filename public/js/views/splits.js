// PersonalFi — Splits / Shared Expenses View
import { Api, fmt, el, toast, openModal, closeModal, confirm } from '../utils.js';

let selectedGroupId = null;
let groups = [];
let members = [];
let onRefresh = null;

export async function renderSplits(container) {
  container.innerHTML = '';
  const groupData = await Api.get('/groups');
  groups = groupData.groups;

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon split', textContent: 'call_split' }),
      el('span', { textContent: 'Split Expenses' }),
    ]),
  ]);
  container.appendChild(header);

  if (groups.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '💸' }),
      el('h3', { textContent: 'No groups to split with' }),
      el('p', { textContent: 'Create a group first, then come back here to add shared expenses.' }),
    ]));
    return;
  }

  // Group selector
  const selector = el('div', { className: 'filter-bar' }, [
    (() => {
      const s = el('select', { className: 'filter-select', id: 'split-group-select' });
      s.appendChild(el('option', { value: '', textContent: 'Select a group' }));
      groups.forEach(g => s.appendChild(el('option', { value: String(g.id), textContent: `${g.icon || '👥'} ${g.name}` })));
      s.addEventListener('change', () => {
        selectedGroupId = parseInt(s.value, 10) || null;
        if (selectedGroupId) loadGroupExpenses(container);
        else {
          const area = document.getElementById('split-content');
          if (area) area.innerHTML = '<p class="placeholder">Select a group to manage expenses.</p>';
        }
      });
      return s;
    })(),
  ]);
  container.appendChild(selector);

  const contentArea = el('div', { id: 'split-content' });
  contentArea.innerHTML = '<p class="placeholder">Select a group to manage expenses.</p>';
  container.appendChild(contentArea);

  onRefresh = () => { if (selectedGroupId) loadGroupExpenses(container); };
}

async function loadGroupExpenses(container) {
  const area = document.getElementById('split-content');
  area.innerHTML = '<div class="loading">Loading...</div>';

  const [detail, expenseData, balanceData] = await Promise.all([
    Api.get(`/groups/${selectedGroupId}`),
    Api.get(`/splits/${selectedGroupId}/expenses`),
    Api.get(`/splits/${selectedGroupId}/balances`),
  ]);
  members = detail.members;

  area.innerHTML = '';

  // Actions bar
  area.appendChild(el('div', { className: 'split-actions' }, [
    el('button', { className: 'btn btn-primary', textContent: '+ Add Expense', onClick: () => showExpenseForm() }),
    el('button', { className: 'btn btn-secondary', textContent: 'Settle Up', onClick: () => showSettleForm(balanceData) }),
  ]));

  // Balances section
  if (balanceData.simplified_debts && balanceData.simplified_debts.length) {
    const debtsCard = el('div', { className: 'card' }, [
      el('h3', { textContent: 'Who Owes Whom' }),
      ...balanceData.simplified_debts.map(d => {
        const fromName = members.find(m => m.id === d.from)?.display_name || 'Unknown';
        const toName = members.find(m => m.id === d.to)?.display_name || 'Unknown';
        return el('div', { className: 'debt-row' }, [
          el('span', { textContent: `${fromName} owes ${toName}` }),
          el('span', { className: 'amount expense', textContent: fmt(d.amount) }),
        ]);
      }),
    ]);
    area.appendChild(debtsCard);
  }

  // Expenses list
  if (expenseData.expenses.length === 0) {
    area.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '📝' }),
      el('h3', { textContent: 'No shared expenses' }),
      el('p', { textContent: 'Add an expense to start splitting costs.' }),
    ]));
    return;
  }

  const table = el('table', { className: 'data-table' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { textContent: 'Date' }),
      el('th', { textContent: 'Description' }),
      el('th', { textContent: 'Paid By' }),
      el('th', { textContent: 'Split' }),
      el('th', { className: 'text-right', textContent: 'Amount' }),
      el('th', { textContent: '' }),
    ]),
  ]));

  const tbody = el('tbody');
  for (const exp of expenseData.expenses) {
    tbody.appendChild(el('tr', {}, [
      el('td', { textContent: exp.date, 'data-label': 'Date' }),
      el('td', { textContent: exp.description, 'data-label': 'Description' }),
      el('td', { textContent: exp.paid_by_name || '—', 'data-label': 'Paid By' }),
      el('td', { 'data-label': 'Split' }, [el('span', { className: 'badge badge-accent', textContent: exp.split_method || 'equal' })]),
      el('td', { className: 'text-right txn-amount expense', textContent: fmt(exp.amount), 'data-label': 'Amount' }),
      el('td', { className: 'row-actions' }, [
        el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteExpense(exp) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]),
      ]),
    ]));
  }
  table.appendChild(tbody);
  area.appendChild(table);
}

function showExpenseForm() {
  const today = new Date().toISOString().slice(0, 10);
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await Api.post(`/splits/${selectedGroupId}/expenses`, {
        paid_by: parseInt(f.paid_by.value, 10),
        amount: parseFloat(f.amount.value),
        description: f.description.value.trim(),
        date: f.date.value,
        split_method: f.split_method.value,
        note: f.note.value.trim() || null,
      });
      toast('Expense added', 'success');
      closeModal();
      if (onRefresh) onRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }}, [
    el('h3', { className: 'modal-title', textContent: 'Add Shared Expense' }),
    formGroup('Description', el('input', { type: 'text', name: 'description', required: 'true', placeholder: 'e.g. Dinner' })),
    formGroup('Amount', el('input', { type: 'number', name: 'amount', step: '0.01', min: '0.01', required: 'true' })),
    formGroup('Date', el('input', { type: 'date', name: 'date', value: today, required: 'true' })),
    formGroup('Paid By', (() => {
      const s = el('select', { name: 'paid_by', required: 'true' });
      members.forEach(m => s.appendChild(el('option', { value: String(m.id), textContent: m.display_name || m.username || 'Guest' })));
      return s;
    })()),
    formGroup('Split Method', (() => {
      const s = el('select', { name: 'split_method' });
      ['equal', 'exact', 'percentage', 'shares'].forEach(m =>
        s.appendChild(el('option', { value: m, textContent: m.charAt(0).toUpperCase() + m.slice(1) }))
      );
      return s;
    })()),
    formGroup('Note', el('textarea', { name: 'note', rows: '2', placeholder: 'Optional' })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Add Expense' }),
    ]),
  ]);
  openModal(form);
}

function showSettleForm(balanceData) {
  if (!balanceData.simplified_debts || !balanceData.simplified_debts.length) {
    toast('No debts to settle', 'info');
    return;
  }

  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await Api.post(`/splits/${selectedGroupId}/settle`, {
        from_member: parseInt(f.from_member.value, 10),
        to_member: parseInt(f.to_member.value, 10),
        amount: parseFloat(f.amount.value),
        note: f.note.value.trim() || null,
      });
      toast('Settlement recorded', 'success');
      closeModal();
      if (onRefresh) onRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }}, [
    el('h3', { className: 'modal-title', textContent: 'Settle Up' }),
    formGroup('From', (() => {
      const s = el('select', { name: 'from_member', required: 'true' });
      members.forEach(m => s.appendChild(el('option', { value: String(m.id), textContent: m.display_name || 'Guest' })));
      return s;
    })()),
    formGroup('To', (() => {
      const s = el('select', { name: 'to_member', required: 'true' });
      members.forEach(m => s.appendChild(el('option', { value: String(m.id), textContent: m.display_name || 'Guest' })));
      return s;
    })()),
    formGroup('Amount', el('input', { type: 'number', name: 'amount', step: '0.01', min: '0.01', required: 'true' })),
    formGroup('Note', el('input', { type: 'text', name: 'note', placeholder: 'Optional' })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Record Settlement' }),
    ]),
  ]);
  openModal(form);
}

async function deleteExpense(exp) {
  const yes = await confirm(`Delete "${exp.description}"?`);
  if (!yes) return;
  try {
    await Api.del(`/splits/${selectedGroupId}/expenses/${exp.id}`);
    toast('Expense deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) { toast(err.message, 'error'); }
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}
