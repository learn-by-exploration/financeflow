// public/js/views/calendar.js — Calendar View
import { Api, fmt, el, toast } from '../utils.js';
import { showLoading, showError, hideStates } from '../ui-states.js';

export async function renderCalendar(container) {
  container.innerHTML = '';

  const header = el('div', { className: 'view-header' });
  header.appendChild(el('h2', {}, [
    el('span', { className: 'material-icons-round entity-icon', textContent: 'calendar_month' }),
    el('span', { textContent: 'Calendar' }),
  ]));
  container.appendChild(header);

  const navRow = el('div', { className: 'calendar-nav' });
  const prevBtn = el('button', { className: 'btn btn-ghost', textContent: '◀', 'aria-label': 'Previous month' });
  const nextBtn = el('button', { className: 'btn btn-ghost', textContent: '▶', 'aria-label': 'Next month' });
  const monthLabel = el('h2', { className: 'calendar-month-label' });
  navRow.append(prevBtn, monthLabel, nextBtn);
  container.appendChild(navRow);

  const grid = el('div', { className: 'calendar-grid' });
  container.appendChild(grid);

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  prevBtn.addEventListener('click', () => { month--; if (month < 1) { month = 12; year--; } load(); });
  nextBtn.addEventListener('click', () => { month++; if (month > 12) { month = 1; year++; } load(); });

  async function load() {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    monthLabel.textContent = `${months[month - 1]} ${year}`;

    showLoading(grid);
    try {
      const data = await Api.get(`/calendar?month=${key}`);
      hideStates(grid);
      renderGrid(grid, data, year, month);
    } catch (err) {
      showError(grid, 'Failed to load calendar');
    }
  }

  function renderGrid(target, data, yr, mo) {
    target.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(d => target.appendChild(el('div', { className: 'calendar-weekday', textContent: d })));

    const firstDay = new Date(yr, mo - 1, 1).getDay();
    const lastDay = new Date(yr, mo, 0).getDate();

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      target.appendChild(el('div', { className: 'calendar-day empty' }));
    }

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = data.days[dateStr] || { transactions: [], recurring: [] };
      const txCount = dayData.transactions.length;
      const recCount = dayData.recurring.length;
      const total = txCount + recCount;
      const isToday = dateStr === new Date().toISOString().slice(0, 10);

      const cell = el('div', {
        className: 'calendar-day' + (isToday ? ' today' : '') + (total > 0 ? ' has-items' : ''),
        role: 'button',
        tabIndex: 0,
        'aria-label': `${dateStr}, ${total} item${total !== 1 ? 's' : ''}`,
      });

      cell.appendChild(el('div', { className: 'calendar-day-num', textContent: String(d) }));

      if (txCount > 0) {
        const expense = dayData.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const income = dayData.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const dots = el('div', { className: 'calendar-dots' });
        if (expense > 0) dots.appendChild(el('span', { className: 'calendar-dot expense', title: `-${fmt(expense)}` }));
        if (income > 0) dots.appendChild(el('span', { className: 'calendar-dot income', title: `+${fmt(income)}` }));
        cell.appendChild(dots);
      }

      if (recCount > 0) {
        cell.appendChild(el('span', { className: 'calendar-dot recurring', title: `${recCount} recurring` }));
      }

      if (total > 0) {
        cell.appendChild(el('div', { className: 'calendar-day-count', textContent: `${total} item${total !== 1 ? 's' : ''}` }));
      }

      cell.addEventListener('click', () => showDayDetail(dayData, dateStr));
      cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDayDetail(dayData, dateStr); } });
      target.appendChild(cell);
    }
  }

  function showDayDetail(dayData, dateStr) {
    const existing = container.querySelector('.calendar-detail');
    if (existing) existing.remove();

    const allItems = [
      ...dayData.transactions.map(t => ({ ...t, _kind: 'txn' })),
      ...dayData.recurring.map(r => ({ ...r, _kind: 'recurring' })),
    ];

    const detail = el('div', { className: 'calendar-detail' });
    detail.appendChild(el('h3', { className: 'detail-date', textContent: dateStr }));

    if (allItems.length === 0) {
      detail.appendChild(el('p', { className: 'detail-empty', textContent: 'No transactions on this day' }));
      container.appendChild(detail);
      return;
    }

    const list = el('div', { className: 'detail-list' });
    for (const item of allItems) {
      const row = el('div', { className: 'detail-item' });
      const left = el('div', { className: 'detail-item-info' });
      left.appendChild(el('div', { className: 'detail-item-desc', textContent: item.description || 'Recurring' }));
      if (item._kind === 'recurring') {
        left.appendChild(el('div', { className: 'detail-item-meta', textContent: `↻ ${item.frequency}` }));
      }
      const right = el('div', {
        className: `detail-item-amount ${item.type}`,
        textContent: (item.type === 'expense' ? '-' : '+') + fmt(item.amount),
      });
      row.append(left, right);
      list.appendChild(row);
    }
    detail.appendChild(list);
    container.appendChild(detail);
  }

  await load();
}
