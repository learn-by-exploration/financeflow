// PersonalFi — Groups View
import { Api, el, toast, openModal, closeModal, confirm, withLoading } from '../utils.js';

let onRefresh = null;

export async function renderGroups(container) {
  container.innerHTML = '';
  const { groups } = await Api.get('/groups');

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon group', textContent: 'group' }),
      el('span', { textContent: 'Groups' }),
    ]),
    el('button', { className: 'btn btn-primary', textContent: '+ Create Group', onClick: () => showGroupForm() }),
  ]);
  container.appendChild(header);

  if (groups.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '👥' }),
      el('h3', { textContent: 'No groups yet' }),
      el('p', { textContent: 'Create a group to start splitting expenses with friends, family, or roommates.' }),
      el('button', { className: 'btn btn-primary', textContent: '+ Create Group', onClick: () => showGroupForm() }),
    ]));
    return;
  }

  const grid = el('div', { className: 'groups-grid' });
  for (const group of groups) {
    grid.appendChild(await groupCard(group));
  }
  container.appendChild(grid);

  onRefresh = () => renderGroups(container);
}

async function groupCard(group) {
  let members = [];
  try {
    const detail = await Api.get(`/groups/${group.id}`);
    members = detail.members;
  } catch { /* ignore */ }

  const card = el('div', { className: 'card group-card' }, [
    el('div', { className: 'group-card-header' }, [
      el('span', { className: 'group-icon', textContent: group.icon || '👥' }),
      el('div', { className: 'group-info' }, [
        el('div', { className: 'group-name', textContent: group.name }),
        el('div', { className: 'group-meta', textContent: `${members.length} members · ${group.role}` }),
      ]),
      el('div', { className: 'account-card-actions' }, [
        el('button', { className: 'btn-icon', title: 'Manage Members', onClick: () => showMembers(group, members) }, [
          el('span', { className: 'material-icons-round', textContent: 'group_add' }),
        ]),
        group.role === 'owner' ? el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteGroup(group) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]) : null,
      ].filter(Boolean)),
    ]),
    el('div', { className: 'group-members-preview' },
      members.slice(0, 5).map(m =>
        el('span', { className: 'member-chip', textContent: m.display_name || m.username || 'Guest' })
      )
    ),
  ]);

  if (group.color) card.style.borderLeft = `4px solid ${group.color}`;
  return card;
}

function showGroupForm() {
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    try {
      await withLoading(submitBtn, async () => {
        await Api.post('/groups', {
          name: e.target.name.value.trim(),
          icon: e.target.icon.value || '👥',
          color: e.target.color.value,
        });
        toast('Group created', 'success');
        closeModal();
        if (onRefresh) onRefresh();
      });
    } catch (err) {
      let errDiv = e.target.querySelector('.modal-error');
      if (!errDiv) { errDiv = el('div', { className: 'modal-error' }); e.target.prepend(errDiv); }
      errDiv.textContent = err.message;
    }
  }}, [
    el('h3', { className: 'modal-title', textContent: 'Create Group' }),
    formGroup('Name', el('input', { type: 'text', name: 'name', required: true, placeholder: 'e.g. Roommates', maxLength: '100', 'aria-label': 'Group name' })),
    formGroup('Icon', el('input', { type: 'text', name: 'icon', value: '👥', placeholder: 'Emoji', maxLength: '10', 'aria-label': 'Group icon' })),
    formGroup('Color', el('input', { type: 'color', name: 'color', value: '#f59e0b', 'aria-label': 'Group color' })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Create' }),
    ]),
  ]);
  openModal(form);
}

function showMembers(group, members) {
  const membersList = el('div', { className: 'members-list' });
  members.forEach(m => {
    membersList.appendChild(el('div', { className: 'member-row' }, [
      el('div', {}, [
        el('span', { className: 'member-name', textContent: m.display_name || m.username || 'Guest' }),
        el('span', { className: `badge ${m.role === 'owner' ? 'badge-accent' : 'badge-muted'}`, textContent: m.role }),
      ]),
      group.role === 'owner' && m.role !== 'owner' ? el('button', { className: 'btn-icon danger', onClick: async () => {
        try {
          await Api.del(`/groups/${group.id}/members/${m.id}`);
          toast('Member removed', 'success');
          closeModal();
          if (onRefresh) onRefresh();
        } catch (err) { toast(err.message, 'error'); }
      }}, [el('span', { className: 'material-icons-round', textContent: 'person_remove' })]) : null,
    ].filter(Boolean)));
  });

  // Add member form
  const addForm = el('div', { className: 'add-member-form' }, [
    el('input', { type: 'text', id: 'add-member-input', placeholder: 'Username or display name', className: 'filter-search' }),
    el('button', { className: 'btn btn-primary btn-sm', textContent: 'Add', onClick: async () => {
      const input = document.getElementById('add-member-input');
      const val = input.value.trim();
      if (!val) return;
      try {
        await Api.post(`/groups/${group.id}/members`, { username: val, display_name: val });
        toast('Member added', 'success');
        closeModal();
        if (onRefresh) onRefresh();
      } catch (err) { toast(err.message, 'error'); }
    }},
    ),
  ]);

  openModal(el('div', {}, [
    el('h3', { className: 'modal-title', textContent: `Members — ${group.name}` }),
    membersList,
    el('hr', {}),
    el('h4', { textContent: 'Add Member', style: 'margin: 0.75rem 0 0.5rem;font-size:0.875rem;' }),
    addForm,
    el('div', { className: 'form-actions', style: 'margin-top:1rem;' }, [
      el('button', { className: 'btn btn-secondary', textContent: 'Close', onClick: closeModal }),
    ]),
  ]));
}

async function deleteGroup(group) {
  const yes = await confirm(`Delete group "${group.name}"? All shared expenses will be lost.`);
  if (!yes) return;
  try {
    await Api.del(`/groups/${group.id}`);
    toast('Group deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) { toast(err.message, 'error'); }
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}
