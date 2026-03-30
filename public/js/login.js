let isLogin = true;
const form = document.getElementById('auth-form');
const btn = document.getElementById('auth-btn');
const subtitle = document.getElementById('auth-subtitle');
const toggleText = document.getElementById('toggle-text');
const toggleLink = document.getElementById('toggle-link');
const groupDisplay = document.getElementById('group-display');
const errorMsg = document.getElementById('error-msg');

toggleLink.addEventListener('click', (e) => {
  e.preventDefault();
  isLogin = !isLogin;
  btn.textContent = isLogin ? 'Sign In' : 'Register';
  subtitle.textContent = isLogin ? 'Sign in to manage your finances' : 'Create your account';
  toggleText.textContent = isLogin ? "Don't have an account?" : 'Already have an account?';
  toggleLink.textContent = isLogin ? 'Register' : 'Sign In';
  groupDisplay.style.display = isLogin ? 'none' : 'block';
  errorMsg.textContent = '';
  // Show/hide password requirements
  const reqBox = document.getElementById('password-requirements');
  if (reqBox) reqBox.style.display = isLogin ? 'none' : 'block';
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
    localStorage.setItem('pfi_token', data.token);
    localStorage.setItem('pfi_user', JSON.stringify(data.user));
    window.location.href = '/';
  } catch (err) {
    errorMsg.textContent = 'Network error';
  }
});

// Redirect if already logged in
if (localStorage.getItem('pfi_token')) window.location.href = '/';
