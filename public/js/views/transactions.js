// PersonalFi — Transactions View
import { Api, fmt, el, toast, openModal, closeModal, confirm, withLoading } from '../utils.js';
import { showLoading, showEmpty, showError, hideStates } from '../ui-states.js';
import { rules, attachValidation } from '../form-validator.js';
import { renderPagination as renderPaginationComponent } from '../pagination.js';

const PAGE_SIZE = 20;
const state = { transactions: [], total: 0, page: 0, filters: {} };
let accounts = [];
let categories = [];
let onRefresh = null;
let multiSelectMode = false;
const selectedIds = new Set();

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

  // Bulk action bar (P24)
  const bulkBar = el('div', { className: 'bulk-action-bar', style: 'display:none' }, [
    el('span', { className: 'bulk-count', textContent: '0 selected' }),
    el('button', { className: 'btn btn-danger', textContent: 'Delete Selected', onClick: () => bulkDelete() }),
    el('button', { className: 'btn btn-secondary', textContent: 'Cancel', onClick: () => exitMultiSelect() }),
  ]);
  container.appendChild(bulkBar);

  // Table container
  const tableWrap = el('div', { id: 'txn-table-wrap' });
  container.appendChild(tableWrap);

  // Multi-select event (P24) — use AbortController to prevent leaks
  if (window._multiSelectAbort) window._multiSelectAbort.abort();
  window._multiSelectAbort = new AbortController();
  document.addEventListener('toggle-multi-select', () => {
    multiSelectMode = !multiSelectMode;
    selectedIds.clear();
    renderTable();
    bulkBar.style.display = multiSelectMode ? 'flex' : 'none';
    if (!multiSelectMode) updateBulkCount();
  }, { signal: window._multiSelectAbort.signal });

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

  // Date range presets
  const presets = el('select', { className: 'filter-select', title: 'Date range presets' });
  [
    { value: '', label: 'Date Range' },
    { value: 'this-month', label: 'This Month' },
    { value: 'last-month', label: 'Last Month' },
    { value: 'last-90', label: 'Last 90 Days' },
    { value: 'this-year', label: 'This Year' },
    { value: 'custom', label: 'Custom...' },
  ].forEach(o => presets.appendChild(el('option', { value: o.value, textContent: o.label })));

  // Date range inputs
  const from = el('input', { type: 'date', className: 'filter-date', title: 'From date', style: 'display:none' });
  const to = el('input', { type: 'date', className: 'filter-date', title: 'To date', style: 'display:none' });

  presets.addEventListener('change', () => {
    const today = new Date();
    let fromDate, toDate;
    switch (presets.value) {
      case 'this-month':
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        toDate = today;
        break;
      case 'last-month':
        fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        toDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last-90':
        fromDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        toDate = today;
        break;
      case 'this-year':
        fromDate = new Date(today.getFullYear(), 0, 1);
        toDate = today;
        break;
      case 'custom':
        from.style.display = '';
        to.style.display = '';
        return;
      default:
        from.value = ''; to.value = '';
        state.filters.from = ''; state.filters.to = '';
        from.style.display = 'none'; to.style.display = 'none';
        loadPage(0);
        return;
    }
    from.style.display = 'none'; to.style.display = 'none';
    from.value = fromDate ? fromDate.toISOString().slice(0, 10) : '';
    to.value = toDate ? toDate.toISOString().slice(0, 10) : '';
    state.filters.from = from.value;
    state.filters.to = to.value;
    loadPage(0);
  });

  from.addEventListener('change', () => { state.filters.from = from.value; loadPage(0); });
  to.addEventListener('change', () => { state.filters.to = to.value; loadPage(0); });
  bar.appendChild(presets);
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
      ...(multiSelectMode ? [el('th', { scope: 'col' }, [
        el('input', { type: 'checkbox', 'aria-label': 'Select all', onChange: (e) => { state.transactions.forEach(t => { if (e.target.checked) selectedIds.add(t.id); else selectedIds.delete(t.id); }); renderTable(); updateBulkCount(); } }),
      ])] : []),
      el('th', { textContent: 'Date', scope: 'col' }),
      el('th', { textContent: 'Description', scope: 'col' }),
      el('th', { textContent: 'Category', scope: 'col' }),
      el('th', { textContent: 'Account', scope: 'col' }),
      el('th', { textContent: 'Type', scope: 'col' }),
      el('th', { className: 'text-right', textContent: 'Amount', scope: 'col' }),
      el('th', { textContent: '', scope: 'col' }),
    ]),
  ]);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  for (const t of state.transactions) {
    const typeClass = t.type === 'income' ? 'badge-green' : t.type === 'expense' ? 'badge-red' : 'badge-accent';
    const amtClass = t.type === 'income' ? 'income' : 'expense';
    const prefix = t.type === 'income' ? '+' : t.type === 'transfer' ? '\u2192' : '\u2212';

    const row = el('tr', {}, [
      ...(multiSelectMode ? [el('td', {}, [
        el('input', { type: 'checkbox', className: 'multi-select-check', 'aria-label': `Select ${t.description}`, checked: selectedIds.has(t.id), onChange: (e) => { if (e.target.checked) selectedIds.add(t.id); else selectedIds.delete(t.id); updateBulkCount(); } }),
      ])] : []),
      el('td', { textContent: t.date, 'data-label': 'Date' }),
      el('td', { className: 'txn-desc-cell', 'data-label': 'Description' }, [
        el('span', { textContent: t.description }),
        t.payee ? el('span', { className: 'txn-payee', textContent: t.payee }) : null,
      ].filter(Boolean)),
      el('td', { textContent: t.category_icon ? `${t.category_icon} ${t.category_name || ''}` : (t.category_name || '—'), 'data-label': 'Category' }),
      el('td', { textContent: t.account_name || '—', 'data-label': 'Account' }),
      el('td', { 'data-label': 'Type' }, [el('span', { className: `badge ${typeClass}`, textContent: t.type })]),
      el('td', { className: `text-right txn-amount ${amtClass}`, textContent: `${prefix}${fmt(t.amount)}`, 'data-label': 'Amount' }),
      el('td', { className: 'row-actions hover-actions' }, [
        el('button', { className: 'btn-icon', title: 'Edit', 'aria-label': `Edit ${t.description}`, onClick: () => showTxnForm(t) }, [
          el('span', { className: 'material-icons-round', textContent: 'edit' }),
        ]),
        el('button', { className: 'btn-icon danger', title: 'Delete', 'aria-label': `Delete ${t.description}`, onClick: () => deleteTxn(t) }, [
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
  const totalPages = Math.ceil(state.total / PAGE_SIZE);
  renderPaginationComponent(wrap, {
    currentPage: state.page + 1,
    totalPages,
    onPageChange: (page) => loadPage(page - 1),
  });
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

  // Attach client-side validation
  attachValidation(form, {
    description: [rules.required('Description is required'), rules.minLength(2, 'At least 2 characters')],
    amount: [rules.required('Amount is required'), rules.min(0.01, 'Amount must be greater than 0')],
    date: [rules.required('Date is required')],
    account_id: [rules.required('Account is required')],
  });
}

function updateFormVisibility(form) {
  const type = form.type.value;
  const transferField = form.querySelector('.transfer-field');
  if (transferField) {
    transferField.closest('.form-group').style.display = type === 'transfer' ? '' : 'none';
  }
}

function formGroup(label, input) {
  const id = 'txn-' + label.toLowerCase().replace(/\s+/g, '-');
  if (input.tagName) input.id = id;
  return el('div', { className: 'form-group' }, [el('label', { textContent: label, for: id }), input]);
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
    const submitBtn = f.querySelector('button[type="submit"]');
    await withLoading(submitBtn, async () => {
      if (existing) {
        await Api.put(`/transactions/${existing.id}`, body);
        toast('Transaction updated', 'success');
      } else {
        await Api.post('/transactions', body);
        toast('Transaction added', 'success');
      }
      closeModal();
      if (onRefresh) onRefresh();
    });
  } catch (err) {
    // Keep modal open, show error inline
    let errDiv = f.querySelector('.modal-error');
    if (!errDiv) {
      errDiv = el('div', { className: 'modal-error' });
      f.prepend(errDiv);
    }
    errDiv.textContent = err.message;
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

function updateBulkCount() {
  const el = document.querySelector('.bulk-count');
  if (el) el.textContent = `${selectedIds.size} selected`;
}

function exitMultiSelect() {
  multiSelectMode = false;
  selectedIds.clear();
  renderTable();
  const bar = document.querySelector('.bulk-action-bar');
  if (bar) bar.style.display = 'none';
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  const yes = await confirm(`Delete ${selectedIds.size} transaction(s)?`);
  if (!yes) return;
  try {
    for (const id of selectedIds) {
      await Api.del(`/transactions/${id}`);
    }
    toast(`${selectedIds.size} transactions deleted`, 'success');
    exitMultiSelect();
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}
