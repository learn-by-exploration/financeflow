// PersonalFi — Financial Calendar View
import { Api, fmt, el, toast } from '../utils.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

let currentYear, currentMonth;

export async function renderCalendar(container) {
  if (!currentYear) {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;
  }

  container.innerHTML = '<div class="loading">Loading...</div>';

  const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const data = await Api.get(`/calendar?month=${monthStr}`);

  container.innerHTML = '';

  // Header with navigation
  const header = el('div', { className: 'view-header calendar-header' }, [
    el('div', { className: 'calendar-nav' }, [
      el('button', { className: 'btn btn-secondary btn-icon', onClick: () => { prevMonth(); renderCalendar(container); } }, [
        el('span', { className: 'material-icons-round', textContent: 'chevron_left' }),
      ]),
      el('h2', { textContent: `${MONTH_NAMES[currentMonth - 1]} ${currentYear}` }),
      el('button', { className: 'btn btn-secondary btn-icon', onClick: () => { nextMonth(); renderCalendar(container); } }, [
        el('span', { className: 'material-icons-round', textContent: 'chevron_right' }),
      ]),
    ]),
    el('button', { className: 'btn btn-secondary', textContent: 'Today', onClick: () => {
      const now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth() + 1;
      renderCalendar(container);
    }}),
  ]);
  container.appendChild(header);

  // Summary stats
  let totalIncome = 0, totalExpense = 0, txCount = 0, recurringCount = 0;
  for (const [, dayData] of Object.entries(data.days)) {
    for (const tx of dayData.transactions) {
      if (tx.type === 'income') totalIncome += tx.amount;
      else totalExpense += tx.amount;
      txCount++;
    }
    recurringCount += dayData.recurring.length;
  }

  const stats = el('div', { className: 'stats-grid' }, [
    statCard('Transactions', String(txCount), 'accent'),
    statCard('Income', fmt(totalIncome), 'green'),
    statCard('Expenses', fmt(totalExpense), 'red'),
    statCard('Upcoming Recurring', String(recurringCount), 'accent'),
  ]);
  container.appendChild(stats);

  // Calendar grid
  const calGrid = el('div', { className: 'calendar-grid' });

  // Weekday headers
  for (const wd of WEEKDAYS) {
    calGrid.appendChild(el('div', { className: 'calendar-weekday', textContent: wd }));
  }

  // Calculate first day offset
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Empty cells for offset
  for (let i = 0; i < firstDayOfMonth; i++) {
    calGrid.appendChild(el('div', { className: 'calendar-day empty' }));
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayData = data.days[dateStr] || { transactions: [], recurring: [] };
    const txs = dayData.transactions || [];
    const recs = dayData.recurring || [];
    const isToday = dateStr === todayStr;
    const hasItems = txs.length > 0 || recs.length > 0;

    const dayCell = el('div', {
      className: `calendar-day${isToday ? ' today' : ''}${hasItems ? ' has-items' : ''}`,
      onClick: () => showDayDetail(container, dateStr, dayData),
    }, [
      el('div', { className: 'calendar-day-num', textContent: String(d) }),
      ...(txs.length > 0 ? [el('div', { className: 'calendar-dots' }, [
        el('span', { className: 'calendar-dot expense', title: `${txs.filter(t => t.type === 'expense').length} expenses` }),
        ...(txs.some(t => t.type === 'income') ? [el('span', { className: 'calendar-dot income', title: 'Income' })] : []),
      ])] : []),
      ...(recs.length > 0 ? [el('span', { className: 'calendar-dot recurring', title: `${recs.length} recurring` })] : []),
      ...(txs.length > 0 ? [el('div', { className: 'calendar-day-count', textContent: `${txs.length} txn${txs.length > 1 ? 's' : ''}` })] : []),
    ]);

    calGrid.appendChild(dayCell);
  }

  container.appendChild(calGrid);

  // Day detail panel
  const detailPanel = el('div', { className: 'calendar-detail', id: 'calendar-detail' });
  container.appendChild(detailPanel);
}

function showDayDetail(container, dateStr, dayData) {
  const panel = container.querySelector('#calendar-detail') || container.appendChild(el('div', { className: 'calendar-detail', id: 'calendar-detail' }));
  const txs = dayData.transactions || [];
  const recs = dayData.recurring || [];

  const dateLabel = new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

  panel.innerHTML = '';
  panel.appendChild(el('h3', { className: 'detail-date', textContent: dateLabel }));

  if (txs.length === 0 && recs.length === 0) {
    panel.appendChild(el('p', { className: 'detail-empty', textContent: 'No transactions on this day.' }));
    return;
  }

  if (txs.length > 0) {
    panel.appendChild(el('h4', { textContent: 'Transactions' }));
    const list = el('div', { className: 'detail-list' });
    for (const tx of txs) {
      list.appendChild(el('div', { className: `detail-item ${tx.type}` }, [
        el('div', { className: 'detail-item-info' }, [
          el('span', { className: 'detail-item-desc', textContent: tx.description }),
          el('span', { className: 'detail-item-meta', textContent: [tx.account_icon, tx.account_name, tx.category_name].filter(Boolean).join(' · ') }),
        ]),
        el('div', { className: `detail-item-amount ${tx.type}`, textContent: `${tx.type === 'expense' ? '-' : '+'}${fmt(tx.amount)}` }),
      ]));
    }
    panel.appendChild(list);
  }

  if (recs.length > 0) {
    panel.appendChild(el('h4', { textContent: 'Upcoming Recurring' }));
    const list = el('div', { className: 'detail-list' });
    for (const r of recs) {
      list.appendChild(el('div', { className: `detail-item recurring-item ${r.type}` }, [
        el('div', { className: 'detail-item-info' }, [
          el('span', { className: 'detail-item-desc', textContent: r.description }),
          el('span', { className: 'detail-item-meta', textContent: `🔄 ${r.frequency}` }),
        ]),
        el('div', { className: `detail-item-amount ${r.type}`, textContent: `${r.type === 'expense' ? '-' : '+'}${fmt(r.amount)}` }),
      ]));
    }
    panel.appendChild(list);
  }
}

function statCard(label, value, color) {
  return el('div', { className: `stat-card ${color}` }, [
    el('div', { className: 'stat-label', textContent: label }),
    el('div', { className: 'stat-value', textContent: value }),
  ]);
}

function prevMonth() {
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
}

function nextMonth() {
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
}
