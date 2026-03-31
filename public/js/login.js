let isLogin = true;
const form = document.getElementById('auth-form');
const btn = document.getElementById('auth-btn');
const subtitle = document.getElementById('auth-subtitle');
const groupDisplay = document.getElementById('group-display');
const errorMsg = document.getElementById('error-msg');

// ─── Tab-based auth switching ───
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.mode;
    isLogin = mode === 'login';
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    btn.textContent = isLogin ? 'Sign In' : 'Register';
    subtitle.textContent = isLogin ? 'Your money. Your server. Your rules.' : 'Create your account';
    groupDisplay.style.display = isLogin ? 'none' : 'block';
    errorMsg.textContent = '';
    const reqBox = document.getElementById('password-requirements');
    if (reqBox) {
      reqBox.style.display = isLogin ? 'none' : 'block';
      if (!isLogin) reqBox.querySelectorAll('li').forEach(li => li.classList.remove('met'));
    }
    const pwInput = document.getElementById('password');
    pwInput.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
  });
});

// ─── Password visibility toggle ───
const pwToggle = document.querySelector('.password-toggle');
if (pwToggle) {
  pwToggle.addEventListener('click', () => {
    const pw = document.getElementById('password');
    const icon = pwToggle.querySelector('.material-icons-round');
    if (pw.type === 'password') {
      pw.type = 'text';
      icon.textContent = 'visibility_off';
      pwToggle.setAttribute('aria-label', 'Hide password');
    } else {
      pw.type = 'password';
      icon.textContent = 'visibility';
      pwToggle.setAttribute('aria-label', 'Show password');
    }
  });
}

// ─── Real-time password requirement checking ───
const pwInput = document.getElementById('password');
const rules = {
  length: /.{8,}/,
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /[0-9]/,
  special: /[^a-zA-Z0-9]/,
};
pwInput.addEventListener('input', () => {
  if (isLogin) return;
  const val = pwInput.value;
  for (const [rule, regex] of Object.entries(rules)) {
    const li = document.querySelector(`li[data-rule="${rule}"]`);
    if (li) li.classList.toggle('met', regex.test(val));
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  const body = {
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
  };
  if (!isLogin) body.display_name = document.getElementById('display_name').value;

  try {
    const res = await fetch(`/api/auth/${isLogin ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { errorMsg.textContent = data.error?.message || 'Error'; return; }
    const remember = document.getElementById('remember-me');
    const storage = (remember && remember.checked) ? localStorage : sessionStorage;
    storage.setItem('pfi_token', data.token);
    storage.setItem('pfi_user', JSON.stringify(data.user));
    window.location.href = '/app';
  } catch (err) {
    errorMsg.textContent = 'Network error';
  }
});

// Redirect if already logged in
if (localStorage.getItem('pfi_token')) window.location.href = '/app';

// ─── Ensure correct initial state (handles stale SW cache) ───
groupDisplay.style.display = 'none';
const reqBoxInit = document.getElementById('password-requirements');
if (reqBoxInit) reqBoxInit.style.display = 'none';
btn.textContent = 'Sign In';
document.querySelectorAll('.auth-tab').forEach(t => {
  t.classList.toggle('active', t.dataset.mode === 'login');
  t.setAttribute('aria-selected', t.dataset.mode === 'login' ? 'true' : 'false');
});

// Show session expiry message
if (sessionStorage.getItem('pfi_session_expired')) {
  sessionStorage.removeItem('pfi_session_expired');
  errorMsg.textContent = 'Your session expired. Please sign in again.';
  errorMsg.style.color = 'var(--yellow, #f59e0b)';
}

// ─── Demo quick-fill ───
const demoBtn = document.getElementById('demo-btn');
if (demoBtn) {
  demoBtn.addEventListener('click', () => {
    document.getElementById('username').value = 'demo';
    document.getElementById('password').value = 'demo123';
  });
}
