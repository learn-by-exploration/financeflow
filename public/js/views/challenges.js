// public/js/views/challenges.js — Savings Challenges View (Gamification)
import { Api, fmt, el, toast, openModal, closeModal, confirm } from '../utils.js';
import { showLoading, showEmpty, showError, hideStates } from '../ui-states.js';

export async function renderChallenges(container) {
  container.innerHTML = '';
  showLoading(container);

  let challenges;
  try {
    const data = await Api.get('/stats/challenges');
    challenges = data.challenges;
    hideStates(container);
  } catch (err) {
    container.innerHTML = '';
    showError(container, { message: 'Failed to load challenges: ' + err.message, retryHandler: () => renderChallenges(container) });
    return;
  }

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon challenge', textContent: 'emoji_events' }),
      el('span', { textContent: 'Savings Challenges' }),
    ]),
    el('button', { className: 'btn btn-primary', textContent: '+ New Challenge', onClick: () => showChallengeForm(container) }),
  ]);
  container.appendChild(header);

  if (challenges.length === 0) {
    showEmpty(container, {
      icon: '🏆',
      title: 'No challenges yet',
      message: 'Create a savings challenge to gamify your finances!',
    });
    return;
  }

  // Active challenges
  const active = challenges.filter(c => c.is_active && !c.is_completed);
  const completed = challenges.filter(c => c.is_completed);
  const inactive = challenges.filter(c => !c.is_active && !c.is_completed);

  if (active.length > 0) {
    container.appendChild(el('h3', { textContent: `Active (${active.length})`, className: 'section-title' }));
    const grid = el('div', { className: 'card-grid' });
    active.forEach(ch => grid.appendChild(challengeCard(ch, container)));
    container.appendChild(grid);
  }

  if (completed.length > 0) {
    container.appendChild(el('h3', { textContent: `Completed (${completed.length})`, className: 'section-title' }));
    const grid = el('div', { className: 'card-grid' });
    completed.forEach(ch => grid.appendChild(challengeCard(ch, container)));
    container.appendChild(grid);
  }

  if (inactive.length > 0) {
    container.appendChild(el('h3', { textContent: `Inactive (${inactive.length})`, className: 'section-title' }));
    const grid = el('div', { className: 'card-grid' });
    inactive.forEach(ch => grid.appendChild(challengeCard(ch, container)));
    container.appendChild(grid);
  }
}

function challengeCard(ch, container) {
  const progress = ch.progress || 0;
  const isActive = ch.is_active && !ch.is_completed;
  const typeLabel = { no_spend: '🚫 No Spend', savings_target: '💰 Savings Target', reduce_category: '📉 Reduce Spending' };

  const card = el('div', { className: `card challenge-card ${ch.is_completed ? 'completed' : ''}` }, [
    el('div', { className: 'challenge-header' }, [
      el('h4', { textContent: ch.name }),
      el('span', { className: 'badge', textContent: typeLabel[ch.type] || ch.type }),
    ]),
    el('div', { className: 'challenge-dates text-muted' }, [
      el('span', { textContent: `${ch.start_date} → ${ch.end_date}` }),
    ]),
    el('div', { className: 'progress-bar-container' }, [
      el('div', { className: 'progress-bar', style: `width: ${Math.min(progress, 100)}%` }),
    ]),
    el('div', { className: 'challenge-progress' }, [
      el('span', { textContent: `${progress}% complete` }),
      ch.target_amount > 0 ? el('span', { textContent: fmt(ch.target_amount) + ' target' }) : null,
    ].filter(Boolean)),
    isActive ? el('button', {
      className: 'btn btn-sm btn-danger',
      textContent: 'Delete',
      onClick: async () => {
        if (await confirm('Delete this challenge?')) {
          try {
            await Api.del(`/stats/challenges/${ch.id}`);
            toast('Challenge deleted', 'success');
            renderChallenges(container);
          } catch (err) { toast(err.message, 'error'); }
        }
      },
    }) : null,
  ].filter(Boolean));

  return card;
}

function showChallengeForm(container) {
  const form = el('div', { className: 'modal-body' }, [
    el('h3', { textContent: 'New Savings Challenge' }),
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Name' }),
      el('input', { type: 'text', id: 'ch-name', className: 'form-input', placeholder: 'e.g. No Coffee Month' }),
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Type' }),
      el('select', { id: 'ch-type', className: 'form-input' }, [
        el('option', { value: 'savings_target', textContent: 'Savings Target' }),
        el('option', { value: 'no_spend', textContent: 'No Spend Challenge' }),
        el('option', { value: 'reduce_category', textContent: 'Reduce Category Spending' }),
      ]),
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Target Amount' }),
      el('input', { type: 'number', id: 'ch-target', className: 'form-input', placeholder: '5000' }),
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'Start Date' }),
      el('input', { type: 'date', id: 'ch-start', className: 'form-input', value: new Date().toISOString().slice(0, 10) }),
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { textContent: 'End Date' }),
      el('input', { type: 'date', id: 'ch-end', className: 'form-input' }),
    ]),
    el('button', {
      className: 'btn btn-primary',
      textContent: 'Create Challenge',
      onClick: async () => {
        const name = document.getElementById('ch-name').value;
        const type = document.getElementById('ch-type').value;
        const target_amount = Number(document.getElementById('ch-target').value) || 0;
        const start_date = document.getElementById('ch-start').value;
        const end_date = document.getElementById('ch-end').value;
        if (!name || !start_date || !end_date) {
          toast('Fill all required fields', 'error');
          return;
        }
        try {
          await Api.post('/stats/challenges', { name, type, target_amount, start_date, end_date });
          toast('Challenge created!', 'success');
          closeModal();
          renderChallenges(container);
        } catch (err) { toast(err.message, 'error'); }
      },
    }),
  ]);
  openModal(form);
}
