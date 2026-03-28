// PersonalFi — API client
const API_BASE = '/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('pfi_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['X-Session-Token'] = token;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('pfi_token');
    localStorage.removeItem('pfi_user');
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
