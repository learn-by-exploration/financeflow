// public/js/views/tags.js — Tag Management View
import { Api, el, toast, openModal, closeModal, confirm, withLoading } from '../utils.js';

const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6'];

let onRefresh = null;

export async function renderTags(container) {
  container.innerHTML = '';
  const { tags } = await Api.get('/tags');

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon tag', textContent: 'sell' }),
      el('span', { textContent: 'Tags' }),
    ]),
    el('button', { className: 'btn btn-primary', textContent: '+ Add Tag', onClick: () => showTagForm(null) }),
  ]);
  container.appendChild(header);

  if (tags.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '🏷️' }),
      el('h3', { textContent: 'No tags yet' }),
      el('p', { textContent: 'Tags help you organize and filter your transactions. Add your first tag to get started.' }),
    ]));
    return;
  }

  const list = el('div', { className: 'tags-list' });
  for (const tag of tags) {
    const item = el('div', { className: 'card tag-item' }, [
      el('div', { className: 'tag-item-left' }, [
        el('span', {
          className: 'tag-color-dot',
          style: `background-color: ${tag.color || '#6b7280'}; width: 12px; height: 12px; border-radius: 50%; display: inline-block;`,
        }),
        el('span', { className: 'tag-item-name', textContent: tag.name }),
      ]),
      el('div', { className: 'tag-item-actions' }, [
        el('button', {
          className: 'btn btn-sm btn-ghost',
          textContent: 'Edit',
          'aria-label': `Edit tag ${tag.name}`,
          onClick: () => showTagForm(tag),
        }),
        el('button', {
          className: 'btn btn-sm btn-danger-ghost',
          textContent: 'Delete',
          'aria-label': `Delete tag ${tag.name}`,
          onClick: () => deleteTag(tag),
        }),
      ]),
    ]);
    list.appendChild(item);
  }
  container.appendChild(list);
  onRefresh = () => renderTags(container);
}

function showTagForm(existingTag) {
  const isEdit = !!existingTag;
  const title = isEdit ? 'Edit Tag' : 'New Tag';

  const nameInput = el('input', {
    type: 'text',
    className: 'form-input',
    placeholder: 'Tag name',
    value: existingTag ? existingTag.name : '',
    maxLength: 50,
    'aria-label': 'Tag name',
  });

  const colorInput = el('input', {
    type: 'color',
    className: 'form-input',
    value: existingTag ? (existingTag.color || '#6b7280') : TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
    'aria-label': 'Tag color',
  });

  const colorPresets = el('div', { className: 'color-presets', style: 'display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap;' });
  for (const c of TAG_COLORS) {
    const swatch = el('button', {
      type: 'button',
      className: 'color-swatch',
      style: `background-color: ${c}; width: 24px; height: 24px; border-radius: 4px; border: 2px solid transparent; cursor: pointer;`,
      'aria-label': `Select color ${c}`,
      onClick: () => { colorInput.value = c; },
    });
    colorPresets.appendChild(swatch);
  }

  const form = el('form', { className: 'form-stack', onSubmit: async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const submitBtn = e.target.querySelector('button[type="submit"]');
    try {
      await withLoading(submitBtn, async () => {
        if (isEdit) {
          await Api.put(`/tags/${existingTag.id}`, { name, color: colorInput.value });
          toast('Tag updated');
        } else {
          await Api.post('/tags', { name, color: colorInput.value });
          toast('Tag created');
        }
        closeModal();
        if (onRefresh) onRefresh();
      });
    } catch (err) {
      let errDiv = e.target.querySelector('.modal-error');
      if (!errDiv) { errDiv = el('div', { className: 'modal-error' }); e.target.prepend(errDiv); }
      errDiv.textContent = err.message || 'Failed to save tag';
    }
  }}, [
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Name' }),
      nameInput,
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Color' }),
      colorInput,
      colorPresets,
    ]),
    el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'Save' : 'Create' }),
  ]);

  const wrapper = el('div', {}, [
    el('h3', { className: 'modal-title', textContent: title }),
    form,
  ]);
  openModal(wrapper);
}

async function deleteTag(tag) {
  const confirmed = await confirm(`Delete tag "${tag.name}"?`, 'This will remove the tag from all transactions.');
  if (!confirmed) return;
  try {
    await Api.del(`/tags/${tag.id}`);
    toast('Tag deleted');
    if (onRefresh) onRefresh();
  } catch (err) {
    toast(err.message || 'Failed to delete tag', 'error');
  }
}
