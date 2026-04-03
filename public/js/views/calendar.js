// public/js/views/calendar.js — Calendar View
import { Api, fmt, el, toast } from '../utils.js';
import { showLoading, showError, hideStates } from '../ui-states.js';

export async function renderCalendar(container) {
  container.innerHTML = '';

  const header = el('div', { className: 'page-header' });
  const title = el('h1', {}, 'Calendar');
  header.appendChild(title);
  container.appendChild(header);

  const navRow = el('div', { className: 'calendar-nav', style: 'display:flex;align-items:center;gap:1rem;margin-bottom:1rem;' });
  const prevBtn = el('button', { className: 'btn btn-ghost', textContent: '◀' });
  const nextBtn = el('button', { className: 'btn btn-ghost', textContent: '▶' });
  const monthLabel = el('span', { style: 'font-size:1.1rem;font-weight:600;min-width:140px;text-align:center;' });
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
      const data = await Api.get(`/api/calendar?month=${key}`);
      hideStates(grid);
      renderGrid(grid, data, year, month);
    } catch (err) {
      showError(grid, 'Failed to load calendar');
    }
  }

  function renderGrid(target, data, yr, mo) {
    target.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const headerRow = el('div', { className: 'calendar-header', style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-weight:600;margin-bottom:4px;' });
    dayNames.forEach(d => headerRow.appendChild(el('div', { textContent: d, style: 'padding:0.25rem;' })));
    target.appendChild(headerRow);

    const firstDay = new Date(yr, mo - 1, 1).getDay();
    const lastDay = new Date(yr, mo, 0).getDate();
    const body = el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;' });

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      body.appendChild(el('div', { className: 'calendar-cell empty', style: 'min-height:60px;' }));
    }

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = data.days[dateStr] || { transactions: [], recurring: [] };
      const txCount = dayData.transactions.length;
      const recCount = dayData.recurring.length;
      const total = txCount + recCount;
      const isToday = dateStr === new Date().toISOString().slice(0, 10);

      const cell = el('div', {
        className: 'calendar-cell' + (isToday ? ' today' : '') + (total > 0 ? ' has-events' : ''),
        style: 'min-height:60px;padding:4px;border-radius:var(--radius-sm);border:1px solid var(--border-color);cursor:pointer;position:relative;',
      });

      const dayNum = el('div', { textContent: String(d), style: 'font-weight:600;font-size:0.85rem;' });
      cell.appendChild(dayNum);

      if (txCount > 0) {
        const expense = dayData.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const income = dayData.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        if (expense > 0) {
          cell.appendChild(el('div', { textContent: `-${fmt(expense)}`, style: 'font-size:0.65rem;color:var(--danger);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }));
        }
        if (income > 0) {
          cell.appendChild(el('div', { textContent: `+${fmt(income)}`, style: 'font-size:0.65rem;color:var(--success);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }));
        }
      }

      if (recCount > 0) {
        const dot = el('div', { style: 'position:absolute;top:4px;right:4px;width:6px;height:6px;background:var(--primary);border-radius:50%;', title: `${recCount} recurring` });
        cell.appendChild(dot);
      }

      cell.addEventListener('click', () => showDayDetail(dayData, dateStr));
      body.appendChild(cell);
    }
    target.appendChild(body);
  }

  function showDayDetail(dayData, dateStr) {
    const existing = container.querySelector('.calendar-detail');
    if (existing) existing.remove();

    const allItems = [
      ...dayData.transactions.map(t => ({ ...t, _kind: 'txn' })),
      ...dayData.recurring.map(r => ({ ...r, _kind: 'recurring' })),
    ];

    if (allItems.length === 0) return;

    const detail = el('div', { className: 'calendar-detail card', style: 'margin-top:1rem;padding:1rem;' });
    detail.appendChild(el('h3', { textContent: dateStr, style: 'margin-bottom:0.5rem;' }));

    const list = el('div', { className: 'transaction-list' });
    for (const item of allItems) {
      const row = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border-color);' });
      const left = el('div');
      left.appendChild(el('div', { textContent: item.description || 'Recurring', style: 'font-weight:500;' }));
      if (item._kind === 'recurring') {
        left.appendChild(el('div', { textContent: `↻ ${item.frequency}`, style: 'font-size:0.75rem;opacity:0.7;' }));
      }
      const right = el('div', {
        textContent: (item.type === 'expense' ? '-' : '+') + fmt(item.amount),
        style: `font-weight:600;color:var(--${item.type === 'expense' ? 'danger' : 'success'});`,
      });
      row.append(left, right);
      list.appendChild(row);
    }
    detail.appendChild(list);
    container.appendChild(detail);
  }

  await load();
}
