// PersonalFi — Savings Goals View
import { Api, fmt, el, toast, openModal, closeModal, confirm, withLoading } from '../utils.js';
import { showLoading, showEmpty, showError, hideStates } from '../ui-states.js';

const GOAL_ICONS = ['🎯', '🏠', '🚗', '✈️', '💍', '📱', '🎓', '🏥', '💰', '🎁'];
let onRefresh = null;

export async function renderGoals(container) {
  container.innerHTML = '';
  showLoading(container);

  let goals;
  try {
    const data = await Api.get('/goals');
    goals = data.goals;
    hideStates(container);
  } catch (err) {
    container.innerHTML = '';
    showError(container, { message: 'Failed to load goals: ' + err.message, retryHandler: () => renderGoals(container) });
    return;
  }

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Savings Goals' }),
    el('button', { className: 'btn btn-primary', textContent: '+ New Goal', onClick: () => showGoalForm(null) }),
  ]);
  container.appendChild(header);

  if (goals.length === 0) {
    showEmpty(container, {
      icon: '🎯',
      title: 'No savings goals',
      message: 'Set a savings goal and track your progress toward it.',
      actionText: '+ New Goal',
      actionHandler: () => showGoalForm(null),
    });
    return;
  }

  const active = goals.filter(g => !g.is_completed);
  const completed = goals.filter(g => g.is_completed);

  if (active.length) {
    container.appendChild(el('h3', { className: 'section-title', textContent: 'Active Goals' }));
    const grid = el('div', { className: 'goals-grid' });
    active.forEach(g => grid.appendChild(goalCard(g)));
    container.appendChild(grid);
  }

  if (completed.length) {
    container.appendChild(el('h3', { className: 'section-title', textContent: 'Completed 🎉' }));
    const grid = el('div', { className: 'goals-grid' });
    completed.forEach(g => grid.appendChild(goalCard(g)));
    container.appendChild(grid);
  }

  onRefresh = () => renderGoals(container);
}

function goalCard(goal) {
  const pct = goal.target_amount > 0 ? Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100) : 0;
  const remaining = Math.max(goal.target_amount - goal.current_amount, 0);

  // Projected completion
  let projectedText = '';
  if (!goal.is_completed && goal.deadline) {
    const daysLeft = Math.ceil((new Date(goal.deadline) - new Date()) / 86400000);
    projectedText = daysLeft > 0 ? `${daysLeft} days left` : 'Past deadline';
  }

  const barColor = goal.is_completed ? 'var(--green)' : pct >= 80 ? 'var(--accent)' : 'var(--accent-light)';

  const card = el('div', { className: `card goal-card ${goal.is_completed ? 'completed' : ''}` }, [
    el('div', { className: 'goal-card-header' }, [
      el('span', { className: 'goal-icon', textContent: goal.icon || '🎯' }),
      el('div', { className: 'goal-info' }, [
        el('div', { className: 'goal-name', textContent: goal.name }),
        projectedText ? el('div', { className: 'goal-deadline', textContent: projectedText }) : null,
      ].filter(Boolean)),
      el('div', { className: 'account-card-actions' }, [
        !goal.is_completed ? el('button', { className: 'btn btn-secondary btn-sm', textContent: '+ Add', onClick: () => showContribute(goal) }) : null,
        el('button', { className: 'btn-icon', title: 'Edit', onClick: () => showGoalForm(goal) }, [
          el('span', { className: 'material-icons-round', textContent: 'edit' }),
        ]),
        el('button', { className: 'btn-icon danger', title: 'Delete', onClick: () => deleteGoal(goal) }, [
          el('span', { className: 'material-icons-round', textContent: 'delete' }),
        ]),
      ].filter(Boolean)),
    ]),
    el('div', { className: 'goal-progress' }, [
      el('div', { className: 'budget-progress-info' }, [
        el('span', { textContent: `${fmt(goal.current_amount)} of ${fmt(goal.target_amount)}` }),
        el('span', { className: 'budget-pct', textContent: `${pct}%` }),
      ]),
      (() => {
        const bar = el('div', {
          className: 'progress-bar',
          role: 'progressbar',
          'aria-valuenow': String(pct),
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-label': `${pct}% complete`,
        });
        const fill = el('div', { className: 'progress-fill' });
        fill.style.width = `${pct}%`;
        fill.style.background = barColor;
        bar.appendChild(fill);
        return bar;
      })(),
      remaining > 0 ? el('div', { className: 'goal-remaining', textContent: `${fmt(remaining)} to go` }) : null,
    ].filter(Boolean)),
  ]);

  if (goal.color) card.style.borderLeft = `4px solid ${goal.color}`;
  return card;
}

function showGoalForm(goal) {
  const isEdit = !!goal;
  const form = el('form', { className: 'modal-form', onSubmit: (e) => handleGoalSubmit(e, goal) }, [
    el('h3', { className: 'modal-title', textContent: isEdit ? 'Edit Goal' : 'New Savings Goal' }),
    formGroup('Name', el('input', { type: 'text', name: 'name', required: 'true', value: goal?.name || '', placeholder: 'e.g. Emergency Fund' })),
    formGroup('Target Amount', el('input', { type: 'number', name: 'target_amount', step: '0.01', min: '1', required: 'true', value: goal?.target_amount ? String(goal.target_amount) : '' })),
    isEdit ? formGroup('Current Amount', el('input', { type: 'number', name: 'current_amount', step: '0.01', min: '0', value: String(goal?.current_amount ?? 0) })) : null,
    formGroup('Deadline', el('input', { type: 'date', name: 'deadline', value: goal?.deadline || '' })),
    formGroup('Icon', (() => {
      const w = el('div', { className: 'icon-picker' });
      GOAL_ICONS.forEach(icon => w.appendChild(el('button', {
        type: 'button', className: `icon-btn ${(goal?.icon || '🎯') === icon ? 'selected' : ''}`,
        textContent: icon,
        onClick: (e) => { w.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected')); e.target.classList.add('selected'); },
      })));
      return w;
    })()),
    formGroup('Color', el('input', { type: 'color', name: 'color', value: goal?.color || '#10b981' })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'Save' : 'Create Goal' }),
    ]),
  ].filter(Boolean));
  openModal(form);
}

function showContribute(goal) {
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const amount = parseFloat(e.target.amount.value);
    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    await withLoading(btn, async () => {
      try {
        await Api.put(`/goals/${goal.id}`, { current_amount: goal.current_amount + amount });
        toast(`Added ${fmt(amount)} to ${goal.name}`, 'success');
        closeModal();
        if (onRefresh) onRefresh();
      } catch (err) {
        let errDiv = e.target.querySelector('.modal-error');
        if (!errDiv) { errDiv = el('div', { className: 'modal-error' }); e.target.prepend(errDiv); }
        errDiv.textContent = err.message;
      }
    });
  }}, [
    el('h3', { className: 'modal-title', textContent: `Add to "${goal.name}"` }),
    el('p', { textContent: `Current: ${fmt(goal.current_amount)} / ${fmt(goal.target_amount)}` }),
    formGroup('Amount', el('input', { type: 'number', name: 'amount', step: '0.01', min: '0.01', required: 'true', placeholder: '0.00' })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Add Funds' }),
    ]),
  ]);
  openModal(form);
}

async function handleGoalSubmit(e, existing) {
  e.preventDefault();
  const f = e.target;
  const selectedIcon = f.querySelector('.icon-btn.selected');
  const body = {
    name: f.name.value.trim(),
    target_amount: parseFloat(f.target_amount.value),
    icon: selectedIcon?.textContent || '🎯',
    color: f.color.value,
    deadline: f.deadline.value || null,
  };
  if (existing && f.current_amount) body.current_amount = parseFloat(f.current_amount.value);

  try {
    const submitBtn = f.querySelector('button[type="submit"]');
    await withLoading(submitBtn, async () => {
      if (existing) {
        await Api.put(`/goals/${existing.id}`, body);
        toast('Goal updated', 'success');
      } else {
        await Api.post('/goals', body);
        toast('Goal created', 'success');
      }
      closeModal();
      if (onRefresh) onRefresh();
    });
  } catch (err) {
    let errDiv = f.querySelector('.modal-error');
    if (!errDiv) {
      errDiv = el('div', { className: 'modal-error' });
      f.prepend(errDiv);
    }
    errDiv.textContent = err.message;
  }
}

async function deleteGoal(goal) {
  const yes = await confirm(`Delete "${goal.name}"?`);
  if (!yes) return;
  try {
    await Api.del(`/goals/${goal.id}`);
    toast('Goal deleted', 'success');
    if (onRefresh) onRefresh();
  } catch (err) { toast(err.message, 'error'); }
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}
