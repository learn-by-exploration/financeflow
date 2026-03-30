// PersonalFi — Transactions View
import { Api, fmt, el, toast, openModal, closeModal, confirm } from '../utils.js';
import { showLoading, showEmpty, showError, hideStates } from '../ui-states.js';

const PAGE_SIZE = 20;
let state = { transactions: [], total: 0, page: 0, filters: {} };
let accounts = [];
let categories = [];
let onRefresh = null;

export async function renderTransactions(container) {
  container.innerHTML = '';
  showLoading(container);

  try {
    // Load reference data
    const [acctData, catData] = await Promise.all([Api.get('/accounts'), Api.get('/categories')]);
    accounts = acctData.accounts;
    categories = catData.categories;
    hideStates(container);
  } catch (err) {
    container.innerHTML = '';
    showError(container, { message: 'Failed to load transactions: ' + err.message, retryHandler: () => renderTransactions(container) });
    return;
  }

  // Header
  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Transactions' }),
    el('button', { className: 'btn btn-primary', textContent: '+ Add Transaction', onClick: () => showTxnForm(null) }),
  ]);
  container.appendChild(header);

  // Filter bar
  container.appendChild(buildFilterBar());

  // Table container
  const tableWrap = el('div', { id: 'txn-table-wrap' });
  container.appendChild(tableWrap);

  // Pagination
  const pagWrap = el('div', { id: 'txn-pagination', className: 'pagination' });
  container.appendChild(pagWrap);

  onRefresh = () => loadPage(0);
  await loadPage(0);
}

function buildFilterBar() {
  const bar = el('div', { className: 'filter-bar' });

  // Search
  const search = el('input', { type: 'text', placeholder: 'Search transactions...', className: 'filter-search' });
  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.filters.search = search.value; loadPage(0); }, 300);
  });
  bar.appendChild(search);

  // Type filter
  const typeSelect = el('select', { className: 'filter-select' });
  [{ value: '', label: 'All Types' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'transfer', label: 'Transfer' }]
    .forEach(o => typeSelect.appendChild(el('option', { value: o.value, textContent: o.label })));
  typeSelect.addEventListener('change', () => { state.filters.type = typeSelect.value; loadPage(0); });
  bar.appendChild(typeSelect);

  // Account filter
  const acctSelect = el('select', { className: 'filter-select' });
  acctSelect.appendChild(el('option', { value: '', textContent: 'All Accounts' }));
  accounts.forEach(a => acctSelect.appendChild(el('option', { value: String(a.id), textContent: a.name })));
  acctSelect.addEventListener('change', () => { state.filters.account_id = acctSelect.value; loadPage(0); });
  bar.appendChild(acctSelect);

  // Category filter
  const catSelect = el('select', { className: 'filter-select' });
  catSelect.appendChild(el('option', { value: '', textContent: 'All Categories' }));
  categories.forEach(c => catSelect.appendChild(el('option', { value: String(c.id), textContent: `${c.icon} ${c.name}` })));
  catSelect.addEventListener('change', () => { state.filters.category_id = catSelect.value; loadPage(0); });
  bar.appendChild(catSelect);

  // Date range
  const from = el('input', { type: 'date', className: 'filter-date', title: 'From date' });
  const to = el('input', { type: 'date', className: 'filter-date', title: 'To date' });
  from.addEventListener('change', () => { state.filters.from = from.value; loadPage(0); });
  to.addEventListener('change', () => { state.filters.to = to.value; loadPage(0); });
  bar.appendChild(from);
  bar.appendChild(to);

  return bar;
}

async function loadPage(page) {
  state.page = page;
  const params = new URLSearchParams();
  params.set('limit', PAGE_SIZE);
  params.set('offset', page * PAGE_SIZE);
  Object.entries(state.filters).forEach(([k, v]) => { if (v) params.set(k, v); });

  try {
    const data = await Api.get(`/transactions?${params}`);
    state.transactions = data.transactions;
    state.total = data.total;

    renderTable();
    renderPagination();
  } catch (err) {
    const wrap = document.getElementById('txn-table-wrap');
    if (wrap) {
      wrap.innerHTML = '';
      showError(wrap, { message: 'Failed to load transactions: ' + err.message, retryHandler: () => loadPage(page) });
    }
  }
}

function renderTable() {
  const wrap = document.getElementById('txn-table-wrap');
  wrap.innerHTML = '';

  if (state.transactions.length === 0) {
    showEmpty(wrap, {
      icon: '📭',
      title: 'No transactions found',
      message: 'Add your first transaction or adjust your filters.',
      actionText: '+ Add Transaction',
      actionHandler: () => showTxnForm(null),
    });
    return;
  }

  const table = el('table', { className: 'data-table' });

  // Header
  const thead = el('thead', {}, [
    el('tr', {}, [
      el('th', { textContent: 'Date' }),
      el('th', { textContent: 'Description' }),
      el('th', { textContent: 'Category' }),
      el('th', { textContent: 'Account' }),
      el('th', { textContent: 'Type' }),
      el('th', { className: 'text-right', textContent: 'Amount' }),
      el('th', { textContent: '' }),
    ]),
  ]);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  for (const t of state.transactions) {
    const typeClass = t.type === 'income' ? 'badge-green' : t.type === 'expense' ? 'badge-red' : 'badge-accent';
    const amtClass = t.type === 'income' ? 'income' : 'expense';
    const prefix = t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '-';

    const row = el('tr', {}, [
      el('td', { textContent: t.date, 'data-label': 'Date' }),
      el('td', { className: 'txn-desc-cell', 'data-label': 'Description' }, [
        el('span', { textContent: t.description }),
        t.payee ? el('span', { className: 'txn-payee', textContent: t.payee }) : null,
      ].filter(Boolean)),
      el('td', { textContent: t.category_icon ? `${t.category_icon} ${t.category_name || ''}` : (t.category_name || '—'), 'data-label': 'Category' }),
      el('td', { textContent: t.account_name || '—', 'data-label': 'Account' }),
      el('td', { 'data-label': 'Type' }, [el('span', { className: `badge ${typeClass}`, textContent: t.type })]),
      el('td', { className: `text-right txn-amount ${amtClass}`, textContent: `${prefix}${fmt(t.amount)}`, 'data-label': 'Amount' }),
      el('td', { className: 'row-actions' }, [
        el('button', { className: 'btn-icon', title: 'Edit', onClick: () => showTxnForm(t) }, [
          el('span', { className: 'material-icons-round', textContent: 'edit' }),
        ]),
        el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteTxn(t) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]),
      ]),
    ]);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function renderPagination() {
  const wrap = document.getElementById('txn-pagination');
  wrap.innerHTML = '';
  const totalPages = Math.ceil(state.total / PAGE_SIZE);
  if (totalPages <= 1) return;

  const info = el('span', { className: 'page-info', textContent: `Page ${state.page + 1} of ${totalPages} (${state.total} total)` });
  const prev = el('button', { className: 'btn btn-secondary', textContent: '← Prev', disabled: state.page === 0 ? 'true' : undefined, onClick: () => loadPage(state.page - 1) });
  const next = el('button', { className: 'btn btn-secondary', textContent: 'Next →', disabled: state.page >= totalPages - 1 ? 'true' : undefined, onClick: () => loadPage(state.page + 1) });

  wrap.appendChild(prev);
  wrap.appendChild(info);
  wrap.appendChild(next);
}

function showTxnForm(txn) {
  const isEdit = !!txn;
  const today = new Date().toISOString().slice(0, 10);

  const form = el('form', { className: 'modal-form', onSubmit: (e) => handleSubmit(e, txn) }, [
    el('h3', { className: 'modal-title', textContent: isEdit ? 'Edit Transaction' : 'Add Transaction' }),

    formGroup('Type', (() => {
      const select = el('select', { name: 'type' });
      [{ v: 'expense', l: 'Expense' }, { v: 'income', l: 'Income' }, { v: 'transfer', l: 'Transfer' }]
        .forEach(o => {
          const opt = el('option', { value: o.v, textContent: o.l });
          if ((txn?.type || 'expense') === o.v) opt.selected = true;
          select.appendChild(opt);
        });
      select.addEventListener('change', () => updateFormVisibility(form));
      return select;
    })()),

    formGroup('Description', el('input', { type: 'text', name: 'description', required: 'true', value: txn?.description || '', placeholder: 'What did you spend on?' })),

    formGroup('Amount', el('input', { type: 'number', name: 'amount', step: '0.01', min: '0.01', required: 'true', value: txn?.amount ? String(txn.amount) : '' })),

    formGroup('Date', el('input', { type: 'date', name: 'date', required: 'true', value: txn?.date || today })),

    formGroup('Account', (() => {
      const select = el('select', { name: 'account_id', required: 'true' });
      select.appendChild(el('option', { value: '', textContent: 'Select account' }));
      accounts.forEach(a => {
        const opt = el('option', { value: String(a.id), textContent: `${a.icon} ${a.name}` });
        if (txn?.account_id === a.id) opt.selected = true;
        select.appendChild(opt);
      });
      return select;
    })()),

    formGroup('Transfer To', (() => {
      const select = el('select', { name: 'transfer_to_account_id', className: 'transfer-field' });
      select.appendChild(el('option', { value: '', textContent: 'Select destination' }));
      accounts.forEach(a => {
        const opt = el('option', { value: String(a.id), textContent: `${a.icon} ${a.name}` });
        if (txn?.transfer_to_account_id === a.id) opt.selected = true;
        select.appendChild(opt);
      });
      return select;
    })()),

    formGroup('Category', (() => {
      const select = el('select', { name: 'category_id' });
      select.appendChild(el('option', { value: '', textContent: 'Auto-detect' }));
      categories.forEach(c => {
        const opt = el('option', { value: String(c.id), textContent: `${c.icon} ${c.name}` });
        if (txn?.category_id === c.id) opt.selected = true;
        select.appendChild(opt);
      });
      return select;
    })()),

    formGroup('Payee', el('input', { type: 'text', name: 'payee', value: txn?.payee || '', placeholder: 'Optional' })),

    formGroup('Note', el('textarea', { name: 'note', rows: '2', value: '', placeholder: 'Optional note' }, [txn?.note || ''])),

    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'Save' : 'Add Transaction' }),
    ]),
  ]);

  openModal(form);
  updateFormVisibility(form);
}

function updateFormVisibility(form) {
  const type = form.type.value;
  const transferField = form.querySelector('.transfer-field');
  if (transferField) {
    transferField.closest('.form-group').style.display = type === 'transfer' ? '' : 'none';
  }
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}

async function handleSubmit(e, existing) {
  e.preventDefault();
  const f = e.target;
  const body = {
    type: f.type.value,
    description: f.description.value.trim(),
    amount: parseFloat(f.amount.value),
    date: f.date.value,
    account_id: parseInt(f.account_id.value, 10) || undefined,
    category_id: parseInt(f.category_id.value, 10) || undefined,
    payee: f.payee.value.trim() || undefined,
    note: f.note.value.trim() || undefined,
  };
  if (body.type === 'transfer') {
    body.transfer_to_account_id = parseInt(f.transfer_to_account_id.value, 10) || undefined;
  }

  try {
    if (existing) {
      await Api.put(`/transactions/${existing.id}`, body);
      toast('Transaction updated', 'success');
    } else {
      await Api.post('/transactions', body);
      toast('Transaction added', 'success');
    }
    closeModal();
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteTxn(txn) {
  const yes = await confirm(`Delete "${txn.description}"?`);
  if (!yes) return;
  try {
    await Api.del(`/transactions/${txn.id}`);
    toast('Transaction deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}
