// PersonalFi — Subscriptions View
import { Api, fmt, el, toast, openModal, closeModal, confirm, withLoading } from '../utils.js';

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

let categories = [];
let onRefresh = null;

export async function renderSubscriptions(container) {
  container.innerHTML = '';
  const [subData, catData] = await Promise.all([Api.get('/subscriptions'), Api.get('/categories')]);
  categories = catData.categories.filter(c => c.type === 'expense');

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon subscription', textContent: 'autorenew' }),
      el('span', { textContent: 'Subscriptions' }),
    ]),
    el('button', { className: 'btn btn-primary', textContent: '+ Add Subscription', onClick: () => showSubForm(null) }),
  ]);
  container.appendChild(header);

  // Monthly burn rate card
  const summary = el('div', { className: 'stats-grid' }, [
    statCard('Monthly Burn Rate', fmt(subData.total_monthly), 'red'),
    statCard('Active', String(subData.subscriptions.filter(s => s.is_active).length), 'green'),
    statCard('Inactive', String(subData.subscriptions.filter(s => !s.is_active).length), 'accent'),
  ]);
  container.appendChild(summary);

  if (subData.subscriptions.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '🔄' }),
      el('h3', { textContent: 'No subscriptions tracked' }),
      el('p', { textContent: 'Add your subscriptions to see your monthly burn rate.' }),
    ]));
    return;
  }

  const active = subData.subscriptions.filter(s => s.is_active);
  const inactive = subData.subscriptions.filter(s => !s.is_active);

  if (active.length) {
    container.appendChild(el('h3', { className: 'section-title', textContent: 'Active' }));
    const grid = el('div', { className: 'subs-grid' });
    active.forEach(s => grid.appendChild(subCard(s)));
    container.appendChild(grid);
  }

  if (inactive.length) {
    container.appendChild(el('h3', { className: 'section-title', textContent: 'Inactive' }));
    const grid = el('div', { className: 'subs-grid' });
    inactive.forEach(s => grid.appendChild(subCard(s)));
    container.appendChild(grid);
  }

  onRefresh = () => renderSubscriptions(container);
}

function statCard(label, value, color) {
  return el('div', { className: `stat-card ${color}` }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
  ]);
}

function subCard(sub) {
  const freq = FREQUENCIES.find(f => f.value === sub.frequency);
  const monthlyNorm = normalizeToMonthly(sub.amount, sub.frequency);

  const card = el('div', { className: `card sub-card ${sub.is_active ? '' : 'inactive'}` }, [
    el('div', { className: 'sub-card-header' }, [
      el('div', { className: 'sub-card-info' }, [
        el('div', { className: 'sub-card-name', textContent: sub.name }),
        el('div', { className: 'sub-card-meta' }, [
          sub.provider ? el('span', { textContent: sub.provider }) : null,
          el('span', { textContent: freq?.label || sub.frequency }),
          sub.category_name ? el('span', { textContent: sub.category_name }) : null,
        ].filter(Boolean).reduce((acc, node, i) => { if (i > 0) acc.push(document.createTextNode(' · ')); acc.push(node); return acc; }, []).map(n => typeof n === 'string' ? document.createTextNode(n) : n)),
      ]),
      el('div', { className: 'account-card-actions' }, [
        el('button', { className: 'btn-icon', title: sub.is_active ? 'Pause' : 'Activate', onClick: () => toggleActive(sub) }, [
          el('span', { className: 'material-icons-round', textContent: sub.is_active ? 'pause' : 'play_arrow' }),
        ]),
        el('button', { className: 'btn-icon', title: 'Edit', onClick: () => showSubForm(sub) }, [
          el('span', { className: 'material-icons-round', textContent: 'edit' }),
        ]),
        el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteSub(sub) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]),
      ]),
    ]),
    el('div', { className: 'sub-card-amounts' }, [
      el('div', {}, [
        el('div', { className: 'stat-label', textContent: 'Amount' }),
        el('div', { className: 'stat-value expense', textContent: fmt(sub.amount) }),
      ]),
      el('div', {}, [
        el('div', { className: 'stat-label', textContent: 'Monthly' }),
        el('div', { className: 'stat-value', textContent: fmt(monthlyNorm) }),
      ]),
    ]),
    sub.next_billing_date ? el('div', { className: 'sub-card-billing', textContent: `Next billing: ${sub.next_billing_date}` }) : null,
  ].filter(Boolean));

  return card;
}

function normalizeToMonthly(amount, frequency) {
  const mult = { weekly: 4.33, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
  return Math.round(amount * (mult[frequency] || 1) * 100) / 100;
}

function showSubForm(sub) {
  const isEdit = !!sub;
  const form = el('form', { className: 'modal-form', onSubmit: (e) => handleSubmit(e, sub) }, [
    el('h3', { className: 'modal-title', textContent: isEdit ? 'Edit Subscription' : 'Add Subscription' }),
    formGroup('Name', el('input', { type: 'text', name: 'name', required: true, value: sub?.name || '', placeholder: 'e.g. Netflix', maxLength: '100', 'aria-label': 'Subscription name' })),
    formGroup('Amount', el('input', { type: 'number', name: 'amount', step: '0.01', min: '0.01', max: '9999999', required: true, value: sub?.amount ? String(sub.amount) : '', inputMode: 'decimal', 'aria-label': 'Subscription amount' })),
    formGroup('Frequency', (() => {
      const s = el('select', { name: 'frequency' });
      FREQUENCIES.forEach(f => {
        const opt = el('option', { value: f.value, textContent: f.label });
        if ((sub?.frequency || 'monthly') === f.value) opt.selected = true;
        s.appendChild(opt);
      });
      return s;
    })()),
    formGroup('Provider', el('input', { type: 'text', name: 'provider', value: sub?.provider || '', placeholder: 'e.g. Netflix Inc.', maxLength: '100', 'aria-label': 'Provider name' })),
    formGroup('Next Billing Date', el('input', { type: 'date', name: 'next_billing_date', value: sub?.next_billing_date || '' })),
    formGroup('Category', (() => {
      const s = el('select', { name: 'category_id' });
      s.appendChild(el('option', { value: '', textContent: 'None' }));
      categories.forEach(c => {
        const opt = el('option', { value: String(c.id), textContent: `${c.icon} ${c.name}` });
        if (sub?.category_id === c.id) opt.selected = true;
        s.appendChild(opt);
      });
      return s;
    })()),
    formGroup('Notes', el('textarea', { name: 'notes', rows: '2' }, [sub?.notes || ''])),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'Save' : 'Add' }),
    ]),
  ]);
  openModal(form);
}

async function handleSubmit(e, existing) {
  e.preventDefault();
  const f = e.target;
  const body = {
    name: f.name.value.trim(),
    amount: parseFloat(f.amount.value),
    frequency: f.frequency.value,
    provider: f.provider.value.trim() || null,
    next_billing_date: f.next_billing_date.value || null,
    category_id: parseInt(f.category_id.value, 10) || null,
    notes: f.notes.value.trim() || null,
  };
  const submitBtn = f.querySelector('button[type="submit"]');
  try {
    await withLoading(submitBtn, async () => {
      if (existing) {
        await Api.put(`/subscriptions/${existing.id}`, body);
        toast('Subscription updated', 'success');
      } else {
        await Api.post('/subscriptions', body);
        toast('Subscription added', 'success');
      }
      closeModal();
      if (onRefresh) onRefresh();
    });
  } catch (err) {
    let errDiv = f.querySelector('.modal-error');
    if (!errDiv) { errDiv = el('div', { className: 'modal-error' }); f.prepend(errDiv); }
    errDiv.textContent = err.message;
  }
}

async function toggleActive(sub) {
  try {
    await Api.put(`/subscriptions/${sub.id}`, { is_active: sub.is_active ? 0 : 1 });
    toast(`${sub.name} ${sub.is_active ? 'paused' : 'activated'}`, 'success');
    if (onRefresh) onRefresh();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteSub(sub) {
  const yes = await confirm(`Delete "${sub.name}"?`);
  if (!yes) return;
  try {
    await Api.del(`/subscriptions/${sub.id}`);
    toast('Subscription deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) { toast(err.message, 'error'); }
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}
