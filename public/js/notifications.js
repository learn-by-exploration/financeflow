// PersonalFi — Notification UI module (ES module)
import { Api } from './utils.js';

let pollTimer = null;
let panelOpen = false;

// ─── DOM refs ───
const bell = document.getElementById('notif-bell');
const badge = document.getElementById('notif-badge');
const panel = document.getElementById('notif-panel');
const backdrop = document.getElementById('notif-backdrop');
const listEl = document.getElementById('notif-list');
const markAllBtn = document.getElementById('notif-mark-all');

// ─── Time ago helper ───
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Update badge ───
function updateBadge(count) {
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ─── Fetch unread count ───
async function fetchUnreadCount() {
  try {
    const data = await Api.get('/notifications?limit=1&offset=0');
    updateBadge(data.unread_count);
  } catch { /* ignore auth errors etc */ }
}

// ─── Render notification list ───
function renderNotifications(notifications) {
  if (!notifications.length) {
    listEl.innerHTML = '<div class="notif-empty">No notifications</div>';
    return;
  }
  listEl.innerHTML = '';
  notifications.forEach(n => {
    const item = document.createElement('div');
    item.className = 'notif-item' + (n.is_read ? ' read' : '');
    item.dataset.id = n.id;

    const icon = document.createElement('span');
    icon.className = 'material-icons-round notif-item-icon';
    icon.textContent = getNotifIcon(n.type);

    const body = document.createElement('div');
    body.className = 'notif-item-body';

    const msg = document.createElement('div');
    msg.className = 'notif-item-msg';
    msg.textContent = n.message || n.title;

    const time = document.createElement('div');
    time.className = 'notif-item-time';
    time.textContent = timeAgo(n.created_at);

    body.appendChild(msg);
    body.appendChild(time);
    item.appendChild(icon);
    item.appendChild(body);

    if (!n.is_read) {
      const dot = document.createElement('span');
      dot.className = 'notif-unread-dot';
      item.appendChild(dot);
    }

    item.addEventListener('click', () => markRead(n.id, item));
    listEl.appendChild(item);
  });
}

function getNotifIcon(type) {
  const icons = {
    large_transaction: 'warning',
    goal_completed: 'emoji_events',
    budget_exceeded: 'trending_up',
    bill_reminder: 'event',
    system: 'info',
  };
  return icons[type] || 'notifications';
}

// ─── Fetch and render all notifications ───
async function fetchNotifications() {
  try {
    const data = await Api.get('/notifications?limit=50&offset=0');
    renderNotifications(data.notifications);
    updateBadge(data.unread_count);
  } catch { /* ignore */ }
}

// ─── Mark single as read ───
async function markRead(id, itemEl) {
  try {
    await Api.put(`/notifications/${id}/read`, {});
    itemEl.classList.add('read');
    const dot = itemEl.querySelector('.notif-unread-dot');
    if (dot) dot.remove();
    await fetchUnreadCount();
  } catch { /* ignore */ }
}

// ─── Mark all as read ───
async function markAllRead() {
  try {
    await Api.post('/notifications/read-all', {});
    listEl.querySelectorAll('.notif-item').forEach(el => {
      el.classList.add('read');
      const dot = el.querySelector('.notif-unread-dot');
      if (dot) dot.remove();
    });
    updateBadge(0);
  } catch { /* ignore */ }
}

// ─── Toggle panel ───
function togglePanel() {
  panelOpen = !panelOpen;
  bell.setAttribute('aria-expanded', String(panelOpen));
  if (panelOpen) {
    panel.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    fetchNotifications();
  } else {
    panel.classList.add('hidden');
    backdrop.classList.add('hidden');
  }
}

function closePanel() {
  panelOpen = false;
  bell.setAttribute('aria-expanded', 'false');
  panel.classList.add('hidden');
  backdrop.classList.add('hidden');
}

// ─── Polling ───
export function startPolling() {
  fetchUnreadCount();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchUnreadCount, 30000);
}

export function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ─── Event listeners ───
bell.addEventListener('click', togglePanel);
backdrop.addEventListener('click', closePanel);
markAllBtn.addEventListener('click', markAllRead);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panelOpen) closePanel();
});
