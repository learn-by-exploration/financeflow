// PersonalFi — Accounts View (Full CRUD)
import { Api, fmt, el, toast, openModal, closeModal, confirm } from '../utils.js';
import { showLoading, showEmpty, showError, hideStates } from '../ui-states.js';
import { rules, attachValidation } from '../form-validator.js';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
  { value: 'loan', label: 'Loan' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
];

const ACCOUNT_ICONS = ['🏦', '💳', '💵', '📈', '🏠', '🚗', '💰', '🪙', '🏧', '👛'];

let onRefresh = null;

export async function renderAccounts(container) {
  container.innerHTML = '';
  showLoading(container);

  let accounts;
  try {
    const data = await Api.get('/accounts');
    accounts = data.accounts;
    hideStates(container);
  } catch (err) {
    container.innerHTML = '';
    showError(container, { message: 'Failed to load accounts: ' + err.message, retryHandler: () => renderAccounts(container) });
    return;
  }

  // Header with add button
  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Accounts' }),
    el('button', { className: 'btn btn-primary', textContent: '+ Add Account', onClick: () => showAccountForm(null) }),
  ]);
  container.appendChild(header);

  // Summary cards
  const assets = accounts.filter(a => !['credit_card', 'loan'].includes(a.type) && a.include_in_net_worth);
  const liabilities = accounts.filter(a => ['credit_card', 'loan'].includes(a.type) && a.include_in_net_worth);
  const totalAssets = assets.reduce((s, a) => s + (a.balance || 0), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Math.abs(a.balance || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const summary = el('div', { className: 'stats-grid' }, [
    statCard('Net Worth', fmt(netWorth), 'accent'),
    statCard('Assets', fmt(totalAssets), 'green'),
    statCard('Liabilities', fmt(totalLiabilities), 'red'),
    statCard('Total Accounts', String(accounts.length), 'accent'),
  ]);
  container.appendChild(summary);

  // Account list or empty state
  if (accounts.length === 0) {
    showEmpty(container, {
      icon: '🏦',
      title: 'No accounts yet',
      message: 'Add your first account to start tracking your finances.',
      actionText: '+ Add Account',
      actionHandler: () => showAccountForm(null),
    });
  } else {
    const grid = el('div', { className: 'accounts-grid' });
    for (const account of accounts) {
      grid.appendChild(accountCard(account));
    }
    container.appendChild(grid);
  }

  onRefresh = () => renderAccounts(container);
}

function statCard(label, value, color) {
  return el('div', { className: `stat-card ${color}` }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
  ]);
}

function emptyState() {
  return el('div', { className: 'empty-state' }, [
    el('span', { className: 'empty-icon', textContent: '🏦' }),
    el('h3', { textContent: 'No accounts yet' }),
    el('p', { textContent: 'Add your first account to start tracking your finances.' }),
    el('button', { className: 'btn btn-primary', textContent: '+ Add Account', onClick: () => showAccountForm(null) }),
  ]);
}

function accountCard(account) {
  const isLiability = ['credit_card', 'loan'].includes(account.type);
  const balanceClass = isLiability ? 'expense' : (account.balance >= 0 ? 'income' : 'expense');
  const typeLabel = ACCOUNT_TYPES.find(t => t.value === account.type)?.label || account.type;

  const card = el('div', { className: `card account-card ${account.is_active ? '' : 'inactive'}` }, [
    el('div', { className: 'account-card-header' }, [
      el('div', { className: 'account-card-icon', textContent: account.icon || '🏦' }),
      el('div', { className: 'account-card-info' }, [
        el('div', { className: 'account-card-name', textContent: account.name }),
        el('div', { className: 'account-card-meta', textContent: [typeLabel, account.institution].filter(Boolean).join(' · ') }),
      ]),
      el('div', { className: 'account-card-actions' }, [
        el('button', { className: 'btn-icon', title: 'Edit', onClick: () => showAccountForm(account) }, [
          el('span', { className: 'material-icons-round', textContent: 'edit' }),
        ]),
        el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteAccount(account) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]),
      ]),
    ]),
    el('div', { className: 'account-card-balance' }, [
      el('div', { className: 'stat-label', textContent: 'Balance' }),
      el('div', { className: `stat-value ${balanceClass}`, textContent: fmt(account.balance, account.currency || 'INR') }),
    ]),
    account.account_number_last4 ? el('div', { className: 'account-card-last4', textContent: `····${account.account_number_last4}` }) : null,
  ].filter(Boolean));

  if (account.color) {
    card.style.borderLeft = `4px solid ${account.color}`;
  }

  return card;
}

function showAccountForm(account) {
  const isEdit = !!account;
  const form = el('form', { className: 'modal-form', onSubmit: (e) => handleSubmit(e, account) }, [
    el('h3', { className: 'modal-title', textContent: isEdit ? 'Edit Account' : 'Add Account' }),

    formGroup('Name', el('input', { type: 'text', name: 'name', required: 'true', value: account?.name || '', placeholder: 'e.g. HDFC Savings' })),

    formGroup('Type', (() => {
      const select = el('select', { name: 'type' });
      for (const t of ACCOUNT_TYPES) {
        const opt = el('option', { value: t.value, textContent: t.label });
        if (account?.type === t.value) opt.selected = true;
        select.appendChild(opt);
      }
      return select;
    })()),

    formGroup('Currency', el('input', { type: 'text', name: 'currency', value: account?.currency || 'INR', placeholder: 'INR' })),

    formGroup('Balance', el('input', { type: 'number', name: 'balance', step: '0.01', value: String(account?.balance ?? 0) })),

    formGroup('Icon', (() => {
      const wrapper = el('div', { className: 'icon-picker' });
      for (const icon of ACCOUNT_ICONS) {
        const btn = el('button', {
          type: 'button',
          className: `icon-btn ${(account?.icon || '🏦') === icon ? 'selected' : ''}`,
          textContent: icon,
          onClick: (e) => {
            wrapper.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
          }
        });
        wrapper.appendChild(btn);
      }
      return wrapper;
    })()),

    formGroup('Institution', el('input', { type: 'text', name: 'institution', value: account?.institution || '', placeholder: 'e.g. HDFC Bank' })),

    formGroup('Last 4 digits', el('input', { type: 'text', name: 'account_number_last4', maxlength: '4', value: account?.account_number_last4 || '', placeholder: '1234' })),

    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'Save Changes' : 'Add Account' }),
    ]),
  ]);

  openModal(form);

  // Attach client-side validation
  attachValidation(form, {
    name: [rules.required('Account name is required'), rules.minLength(2, 'At least 2 characters')],
    currency: [rules.required('Currency is required'), rules.maxLength(5, 'Currency code too long')],
  });
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [
    el('label', { textContent: label }),
    input,
  ]);
}

async function handleSubmit(e, existing) {
  e.preventDefault();
  const form = e.target;
  const selectedIcon = form.querySelector('.icon-btn.selected');

  const body = {
    name: form.name.value.trim(),
    type: form.type.value,
    currency: form.currency.value.trim() || 'INR',
    balance: parseFloat(form.balance.value) || 0,
    icon: selectedIcon?.textContent || '🏦',
    institution: form.institution.value.trim() || null,
    account_number_last4: form.account_number_last4.value.trim() || null,
  };

  try {
    if (existing) {
      await Api.put(`/accounts/${existing.id}`, body);
      toast('Account updated', 'success');
    } else {
      await Api.post('/accounts', body);
      toast('Account added', 'success');
    }
    closeModal();
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteAccount(account) {
  const yes = await confirm(`Delete "${account.name}"? This cannot be undone.`);
  if (!yes) return;
  try {
    await Api.del(`/accounts/${account.id}`);
    toast('Account deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}
