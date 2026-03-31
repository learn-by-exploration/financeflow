// PersonalFi — Shared utilities (ES module)

let _token = localStorage.getItem('pfi_token') || sessionStorage.getItem('pfi_token');
const token = () => localStorage.getItem('pfi_token') || sessionStorage.getItem('pfi_token') || _token;
const user = () => JSON.parse(localStorage.getItem('pfi_user') || sessionStorage.getItem('pfi_user') || '{}');

// ─── API helper ───
export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const t = token();
  if (t) headers['X-Session-Token'] = t;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('pfi_token');
    localStorage.removeItem('pfi_user');
    // Store message for login page
    sessionStorage.setItem('pfi_session_expired', '1');
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'API error');
  return data;
}

export const Api = {
  get: (path) => api(path),
  post: (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => api(path, { method: 'DELETE' }),
};

// ─── Currency formatter ───
export function fmt(amount, currency = 'INR', locale = 'en-IN') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount || 0);
}

// ─── Date formatter ───
export function formatDate(dateStr, format = 'YYYY-MM-DD') {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  switch (format) {
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
    case 'DD-MM-YYYY': return `${dd}-${mm}-${yyyy}`;
    case 'DD.MM.YYYY': return `${dd}.${mm}.${yyyy}`;
    default: return `${yyyy}-${mm}-${dd}`;
  }
}

// ─── Toast notifications ───
export function toast(message, type = 'info', options = {}) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  if (options.undo) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', () => {
      options.undo();
      t.remove();
    });
    t.appendChild(undoBtn);
  }
  container.appendChild(t);
  const duration = type === 'error' ? 8000 : 5000;
  setTimeout(() => t.remove(), duration);
  // A11y: announce to screen readers
  const announce = document.getElementById('a11y-announce');
  if (announce) {
    announce.textContent = '';
    const msg = options.undo ? `${message}. Undo available` : message;
    setTimeout(() => { announce.textContent = msg; }, 100);
  }
}

// ─── Modal ───
let _modalTrigger = null;

export function openModal(html) {
  _modalTrigger = document.activeElement;
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = '';
  if (typeof html === 'string') {
    content.textContent = html;
  } else {
    content.appendChild(html);
  }
  // Set aria-labelledby if modal has a title
  const title = content.querySelector('.modal-title');
  if (title) {
    title.id = title.id || 'modal-title-auto';
    overlay.setAttribute('aria-labelledby', title.id);
  } else {
    overlay.removeAttribute('aria-labelledby');
  }
  // Add close (X) button if not already present
  if (!content.querySelector('.modal-close-btn')) {
    const closeBtn = el('button', {
      type: 'button',
      className: 'modal-close-btn',
      'aria-label': 'Close',
      onClick: closeModal,
    }, [el('span', { className: 'material-icons-round', textContent: 'close' })]);
    content.prepend(closeBtn);
  }
  document.getElementById('modal-overlay').classList.remove('hidden');
  // Focus first focusable element inside modal
  setTimeout(() => {
    const focusable = content.querySelector('input:not([type="hidden"]), select, textarea, button:not(.modal-close-btn)');
    if (focusable) focusable.focus();
  }, 50);
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
  // Restore focus to trigger element
  if (_modalTrigger && _modalTrigger.isConnected) {
    _modalTrigger.focus();
    _modalTrigger = null;
  }
}

// ─── Safe element creation ───
export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') e.appendChild(document.createTextNode(child));
    else if (child) e.appendChild(child);
  }
  return e;
}

// ─── Confirm dialog ───
export function confirm(message) {
  return new Promise((resolve) => {
    const fragment = document.createDocumentFragment();
    const wrapper = el('div', { className: 'confirm-dialog' }, [
      el('p', { className: 'confirm-msg', textContent: message }),
      el('div', { className: 'confirm-actions' }, [
        el('button', { className: 'btn btn-secondary', textContent: 'Cancel', onClick: () => { closeModal(); resolve(false); } }),
        el('button', { className: 'btn btn-danger', textContent: 'Delete', onClick: () => { closeModal(); resolve(true); } }),
      ]),
    ]);
    fragment.appendChild(wrapper);
    openModal(fragment);
  });
}

export function getUser() { return user(); }
export function getToken() { return token(); }

// ─── Color swatch picker ───
const PRESET_COLORS = ['#6366f1', '#10b981', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#f97316', '#a855f7', '#84cc16', '#14b8a6'];
export function renderColorPicker(selectedColor, onChange) {
  const picker = el('div', { className: 'color-picker', role: 'radiogroup', 'aria-label': 'Color picker' });
  PRESET_COLORS.forEach(color => {
    const swatch = el('button', {
      className: `color-swatch${selectedColor === color ? ' selected' : ''}`,
      style: `background: ${color}`,
      role: 'radio',
      'aria-checked': String(selectedColor === color),
      'aria-label': color,
      onClick: () => {
        picker.querySelectorAll('.color-swatch').forEach(s => { s.classList.remove('selected'); s.setAttribute('aria-checked', 'false'); });
        swatch.classList.add('selected');
        swatch.setAttribute('aria-checked', 'true');
        if (onChange) onChange(color);
      },
    });
    picker.appendChild(swatch);
  });
  return picker;
}

// ─── Button loading state (prevent double-submit) ───
export async function withLoading(button, asyncFn) {
  if (button.disabled) return;
  const original = button.textContent;
  button.disabled = true;
  button.classList.add('btn-loading');
  try {
    await asyncFn();
  } finally {
    button.disabled = false;
    button.classList.remove('btn-loading');
    button.textContent = original;
  }
}
