// PersonalFi — Auto-Categorization Rules View
import { Api, el, toast, openModal, closeModal, confirm } from '../utils.js';

let categories = [];
let onRefresh = null;

export async function renderRules(container) {
  container.innerHTML = '';
  const [rulesData, catData] = await Promise.all([Api.get('/rules'), Api.get('/categories')]);
  categories = catData.categories;

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Auto-Categorization Rules' }),
    el('button', { className: 'btn btn-primary', textContent: '+ Add Rule', onClick: () => showRuleForm(null) }),
  ]);
  container.appendChild(header);

  container.appendChild(el('div', { className: 'card', style: 'margin-bottom:1rem;' }, [
    el('p', { className: 'rules-info', textContent: 'Rules match transaction descriptions using pipe-separated patterns (e.g. "swiggy|zomato|uber eats"). When a transaction is created without a category, the first matching rule assigns the category automatically.' }),
  ]));

  if (rulesData.rules.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '🤖' }),
      el('h3', { textContent: 'No rules configured' }),
      el('p', { textContent: 'Add rules to auto-categorize your transactions.' }),
    ]));
    return;
  }

  const table = el('table', { className: 'data-table' });
  table.appendChild(el('thead', {}, [el('tr', {}, [
    el('th', { textContent: '#' }),
    el('th', { textContent: 'Pattern' }),
    el('th', { textContent: 'Category' }),
    el('th', { textContent: 'Type' }),
    el('th', { textContent: '' }),
  ])]));

  const tbody = el('tbody');
  rulesData.rules.forEach((r, i) => {
    const isSystem = r.is_system === 1;
    tbody.appendChild(el('tr', { className: isSystem ? 'system-row' : '' }, [
      el('td', { textContent: String(i + 1) }),
      el('td', {}, [
        el('code', { className: 'rule-pattern', textContent: r.pattern }),
      ]),
      el('td', { textContent: `${r.category_icon || '📁'} ${r.category_name || '—'}` }),
      el('td', {}, [
        el('span', { className: `badge ${isSystem ? 'badge-muted' : 'badge-accent'}`, textContent: isSystem ? 'system' : 'custom' }),
      ]),
      el('td', { className: 'row-actions' }, [
        !isSystem ? el('button', { className: 'btn-icon', title: 'Edit', onClick: () => showRuleForm(r) }, [
          el('span', { className: 'material-icons-round', textContent: 'edit' }),
        ]) : null,
        !isSystem ? el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteRule(r) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]) : null,
      ].filter(Boolean)),
    ]));
  });
  table.appendChild(tbody);
  container.appendChild(table);

  onRefresh = () => renderRules(container);
}

function showRuleForm(rule) {
  const isEdit = !!rule;
  const form = el('form', { className: 'modal-form', onSubmit: (e) => handleSubmit(e, rule) }, [
    el('h3', { className: 'modal-title', textContent: isEdit ? 'Edit Rule' : 'Add Rule' }),
    formGroup('Pattern', el('input', { type: 'text', name: 'pattern', required: 'true', value: rule?.pattern || '', placeholder: 'swiggy|zomato|uber eats' })),
    el('p', { className: 'form-hint', textContent: 'Pipe-separated keywords. Case-insensitive matching.' }),
    formGroup('Category', (() => {
      const s = el('select', { name: 'category_id', required: 'true' });
      s.appendChild(el('option', { value: '', textContent: 'Select category' }));
      categories.forEach(c => {
        const opt = el('option', { value: String(c.id), textContent: `${c.icon} ${c.name} (${c.type})` });
        if (rule?.category_id === c.id) opt.selected = true;
        s.appendChild(opt);
      });
      return s;
    })()),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'Save' : 'Add Rule' }),
    ]),
  ]);
  openModal(form);
}

async function handleSubmit(e, existing) {
  e.preventDefault();
  const f = e.target;
  const body = {
    pattern: f.pattern.value.trim(),
    category_id: parseInt(f.category_id.value, 10),
  };
  try {
    if (existing) {
      await Api.put(`/rules/${existing.id}`, body);
      toast('Rule updated', 'success');
    } else {
      await Api.post('/rules', body);
      toast('Rule added', 'success');
    }
    closeModal();
    if (onRefresh) onRefresh();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteRule(rule) {
  const yes = await confirm(`Delete this rule?`);
  if (!yes) return;
  try {
    await Api.del(`/rules/${rule.id}`);
    toast('Rule deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) { toast(err.message, 'error'); }
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}
