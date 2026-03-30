// PersonalFi — Shared utilities (ES module)

const token = () => localStorage.getItem('pfi_token');
const user = () => JSON.parse(localStorage.getItem('pfi_user') || '{}');

// ─── API helper ───
export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const t = token();
  if (t) headers['X-Session-Token'] = t;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.clear();
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
export function fmt(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount || 0);
}

// ─── Toast notifications ───
export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
  // A11y: announce to screen readers
  const announce = document.getElementById('a11y-announce');
  if (announce) {
    announce.textContent = '';
    setTimeout(() => { announce.textContent = message; }, 100);
  }
}

// ─── Modal ───
export function openModal(html) {
  const content = document.getElementById('modal-content');
  if (typeof html === 'string') {
    content.innerHTML = html;
  } else {
    content.innerHTML = '';
    content.appendChild(html);
  }
  document.getElementById('modal-overlay').classList.remove('hidden');
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
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
