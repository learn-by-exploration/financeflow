// PersonalFi — Budgets View
import { Api, fmt, el, toast, openModal, closeModal, confirm } from '../utils.js';

let categories = [];
let onRefresh = null;

export async function renderBudgets(container) {
  container.innerHTML = '';
  const [budgetData, catData] = await Promise.all([Api.get('/budgets'), Api.get('/categories')]);
  categories = catData.categories.filter(c => c.type === 'expense');

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Budgets' }),
    el('button', { className: 'btn btn-primary', textContent: '+ New Budget', onClick: () => showBudgetForm() }),
  ]);
  container.appendChild(header);

  if (budgetData.budgets.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '📊' }),
      el('h3', { textContent: 'No budgets yet' }),
      el('p', { textContent: 'Create a budget to track your spending by category.' }),
      el('button', { className: 'btn btn-primary', textContent: '+ New Budget', onClick: () => showBudgetForm() }),
    ]));
    return;
  }

  const grid = el('div', { className: 'budgets-grid' });
  for (const budget of budgetData.budgets) {
    grid.appendChild(await budgetCard(budget));
  }
  container.appendChild(grid);

  onRefresh = () => renderBudgets(container);
}

async function budgetCard(budget) {
  let summary;
  try {
    summary = await Api.get(`/budgets/${budget.id}/summary`);
  } catch {
    summary = { categories: [], total_allocated: 0, total_spent: 0, total_remaining: 0 };
  }

  const pct = summary.total_allocated > 0 ? Math.round((summary.total_spent / summary.total_allocated) * 100) : 0;
  const barColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)';

  const card = el('div', { className: 'card budget-card' }, [
    el('div', { className: 'budget-card-header' }, [
      el('div', {}, [
        el('div', { className: 'budget-card-name', textContent: budget.name }),
        el('div', { className: 'budget-card-meta', textContent: `${budget.period} · ${budget.start_date || '—'} to ${budget.end_date || '—'}` }),
      ]),
      el('div', { className: 'account-card-actions' }, [
        el('button', { className: 'btn-icon', title: 'View Details', onClick: () => showBudgetDetail(budget) }, [
          el('span', { className: 'material-icons-round', textContent: 'visibility' }),
        ]),
        el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteBudget(budget) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]),
      ]),
    ]),
    el('div', { className: 'budget-progress' }, [
      el('div', { className: 'budget-progress-info' }, [
        el('span', { textContent: `${fmt(summary.total_spent)} of ${fmt(summary.total_allocated)}` }),
        el('span', { className: `budget-pct ${pct >= 100 ? 'over' : ''}`, textContent: `${pct}%` }),
      ]),
      progressBar(pct, barColor),
    ]),
  ]);

  return card;
}

function progressBar(pct, color) {
  const bar = el('div', { className: 'progress-bar' });
  const fill = el('div', { className: 'progress-fill' });
  fill.style.width = `${Math.min(pct, 100)}%`;
  fill.style.background = color;
  bar.appendChild(fill);
  return bar;
}

async function showBudgetDetail(budget) {
  const summary = await Api.get(`/budgets/${budget.id}/summary`);

  const rows = summary.categories.map(c => {
    const pct = c.allocated > 0 ? Math.round((c.spent / c.allocated) * 100) : 0;
    const barColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)';
    return el('div', { className: 'budget-detail-row' }, [
      el('div', { className: 'budget-detail-cat' }, [
        el('span', { textContent: `${c.category_icon || '📁'} ${c.category_name}` }),
        el('span', { className: 'budget-detail-amounts', textContent: `${fmt(c.spent)} / ${fmt(c.allocated)}` }),
      ]),
      progressBar(pct, barColor),
    ]);
  });

  const content = el('div', {}, [
    el('h3', { className: 'modal-title', textContent: budget.name }),
    el('p', { className: 'budget-card-meta', textContent: `${budget.period} · ${budget.start_date || '—'} to ${budget.end_date || '—'}` }),
    el('div', { className: 'budget-detail-summary' }, [
      el('span', { textContent: `Total: ${fmt(summary.total_spent)} of ${fmt(summary.total_allocated)}` }),
      el('span', { textContent: `Remaining: ${fmt(summary.total_remaining)}` }),
    ]),
    el('div', { className: 'budget-detail-rows' }, rows),
    el('div', { className: 'form-actions' }, [
      el('button', { className: 'btn btn-secondary', textContent: 'Close', onClick: closeModal }),
    ]),
  ]);

  openModal(content);
}

function showBudgetForm() {
  const today = new Date();
  const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Dynamic item list
  const itemsContainer = el('div', { className: 'budget-items-list' });

  const form = el('form', { className: 'modal-form', onSubmit: handleBudgetSubmit }, [
    el('h3', { className: 'modal-title', textContent: 'Create Budget' }),

    formGroup('Name', el('input', { type: 'text', name: 'name', required: 'true', placeholder: 'e.g. March 2026 Budget' })),

    formGroup('Period', (() => {
      const s = el('select', { name: 'period' });
      ['monthly', 'weekly', 'quarterly', 'yearly', 'custom'].forEach(p =>
        s.appendChild(el('option', { value: p, textContent: p.charAt(0).toUpperCase() + p.slice(1) }))
      );
      return s;
    })()),

    formGroup('Start Date', el('input', { type: 'date', name: 'start_date', value: startDate })),
    formGroup('End Date', el('input', { type: 'date', name: 'end_date', value: endDate })),

    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Category Allocations' }),
      itemsContainer,
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: '+ Add Category', onClick: () => addBudgetItem(itemsContainer) }),
    ]),

    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Create Budget' }),
    ]),
  ]);

  openModal(form);
}

function addBudgetItem(container) {
  const row = el('div', { className: 'budget-item-row' }, [
    (() => {
      const s = el('select', { name: 'item_category', className: 'budget-item-cat' });
      s.appendChild(el('option', { value: '', textContent: 'Category' }));
      categories.forEach(c => s.appendChild(el('option', { value: String(c.id), textContent: `${c.icon} ${c.name}` })));
      return s;
    })(),
    el('input', { type: 'number', name: 'item_amount', step: '0.01', min: '0', placeholder: 'Amount', className: 'budget-item-amt' }),
    el('button', { type: 'button', className: 'btn-icon danger', textContent: '✕', onClick: () => row.remove() }),
  ]);
  container.appendChild(row);
}

async function handleBudgetSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const itemRows = f.querySelectorAll('.budget-item-row');
  const items = [];
  itemRows.forEach(row => {
    const catId = parseInt(row.querySelector('[name="item_category"]').value, 10);
    const amount = parseFloat(row.querySelector('[name="item_amount"]').value);
    if (catId && amount > 0) items.push({ category_id: catId, amount });
  });

  try {
    await Api.post('/budgets', {
      name: f.name.value.trim(),
      period: f.period.value,
      start_date: f.start_date.value,
      end_date: f.end_date.value,
      items,
    });
    toast('Budget created', 'success');
    closeModal();
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteBudget(budget) {
  const yes = await confirm(`Delete budget "${budget.name}"?`);
  if (!yes) return;
  try {
    await Api.del(`/budgets/${budget.id}`);
    toast('Budget deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}
