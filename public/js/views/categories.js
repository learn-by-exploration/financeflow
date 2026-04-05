// PersonalFi — Categories View
import { Api, el, toast, openModal, closeModal, confirm, withLoading } from '../utils.js';

const CATEGORY_ICONS = ['🍕', '🛒', '🏠', '🚗', '💊', '🎬', '✈️', '📚', '👕', '💇', '🎁', '💰', '📱', '⚡', '💳', '🏦', '📁', '🎯', '🎮', '🎵'];

let onRefresh = null;

export async function renderCategories(container) {
  container.innerHTML = '';
  const { categories } = await Api.get('/categories');

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon category', textContent: 'category' }),
      el('span', { textContent: 'Categories' }),
    ]),
    el('button', { className: 'btn btn-primary', textContent: '+ Add Category', onClick: () => showCategoryForm(null) }),
  ]);
  container.appendChild(header);

  if (categories.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '📁' }),
      el('h3', { textContent: 'No categories' }),
      el('p', { textContent: 'Categories are seeded when you register. Something went wrong.' }),
    ]));
    return;
  }

  // Group by type
  const expenseCats = categories.filter(c => c.type === 'expense');
  const incomeCats = categories.filter(c => c.type === 'income');

  const grid = el('div', { className: 'categories-grid' }, [
    buildCategoryColumn('Expense Categories', expenseCats),
    buildCategoryColumn('Income Categories', incomeCats),
  ]);
  container.appendChild(grid);

  onRefresh = () => renderCategories(container);
}

function buildCategoryColumn(title, cats) {
  const items = cats.map(c => {
    const isSystem = c.is_system === 1;
    return el('div', { className: `category-item ${isSystem ? 'system' : ''}` }, [
      el('div', { className: 'category-item-left' }, [
        el('span', { className: 'category-item-icon', textContent: c.icon || '📁' }),
        el('div', {}, [
          el('span', { className: 'category-item-name', textContent: c.name }),
          isSystem ? el('span', { className: 'badge badge-muted', textContent: 'system' }) : null,
        ].filter(Boolean)),
      ]),
      el('div', { className: 'category-item-actions' }, [
        el('button', { className: 'btn-icon', title: 'Edit', onClick: () => showCategoryForm(c) }, [
          el('span', { className: 'material-icons-round', textContent: 'edit' }),
        ]),
        !isSystem ? el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteCategory(c) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]) : null,
      ].filter(Boolean)),
    ]);
  });

  return el('div', { className: 'card' }, [
    el('h3', { textContent: title }),
    el('div', { className: 'category-list-items' }, items),
  ]);
}

function showCategoryForm(cat) {
  const isEdit = !!cat;

  const form = el('form', { className: 'modal-form', onSubmit: (e) => handleSubmit(e, cat) }, [
    el('h3', { className: 'modal-title', textContent: isEdit ? 'Edit Category' : 'Add Category' }),

    formGroup('Name', el('input', { type: 'text', name: 'name', required: true, value: cat?.name || '', placeholder: 'e.g. Food & Dining', maxLength: '100', 'aria-label': 'Category name' })),

    !isEdit ? formGroup('Type', (() => {
      const select = el('select', { name: 'type' });
      [{ v: 'expense', l: 'Expense' }, { v: 'income', l: 'Income' }]
        .forEach(o => select.appendChild(el('option', { value: o.v, textContent: o.l })));
      return select;
    })()) : null,

    formGroup('Icon', (() => {
      const wrapper = el('div', { className: 'icon-picker' });
      for (const icon of CATEGORY_ICONS) {
        wrapper.appendChild(el('button', {
          type: 'button',
          className: `icon-btn ${(cat?.icon || '📁') === icon ? 'selected' : ''}`,
          textContent: icon,
          onClick: (e) => { wrapper.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected')); e.target.classList.add('selected'); },
        }));
      }
      return wrapper;
    })()),

    formGroup('Color', el('input', { type: 'color', name: 'color', value: cat?.color || '#8b5cf6', 'aria-label': 'Category color' })),

    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'Save' : 'Add Category' }),
    ]),
  ].filter(Boolean));

  openModal(form);
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}

async function handleSubmit(e, existing) {
  e.preventDefault();
  const f = e.target;
  const selectedIcon = f.querySelector('.icon-btn.selected');
  const body = {
    name: f.name.value.trim(),
    icon: selectedIcon?.textContent || '📁',
    color: f.color.value,
  };
  if (!existing) body.type = f.type.value;
  const submitBtn = f.querySelector('button[type="submit"]');
  try {
    await withLoading(submitBtn, async () => {
      if (existing) {
        await Api.put(`/categories/${existing.id}`, body);
        toast('Category updated', 'success');
      } else {
        await Api.post('/categories', body);
        toast('Category added', 'success');
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

async function deleteCategory(cat) {
  const yes = await confirm(`Delete "${cat.name}"? Transactions using this category will lose their category.`);
  if (!yes) return;
  try {
    await Api.del(`/categories/${cat.id}`);
    toast('Category deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}
