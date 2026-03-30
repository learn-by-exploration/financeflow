// PersonalFi — Client-side Form Validator
// Provides real-time validation on blur/input with inline error messages.

export const rules = {
  required: (msg) => (v) => (!v || !String(v).trim()) ? (msg || 'This field is required') : null,
  minLength: (n, msg) => (v) => v && String(v).trim().length < n ? (msg || `Must be at least ${n} characters`) : null,
  maxLength: (n, msg) => (v) => v && String(v).trim().length > n ? (msg || `Must be at most ${n} characters`) : null,
  min: (n, msg) => (v) => v !== '' && Number(v) < n ? (msg || `Must be at least ${n}`) : null,
  max: (n, msg) => (v) => v !== '' && Number(v) > n ? (msg || `Must be at most ${n}`) : null,
  pattern: (re, msg) => (v) => v && !re.test(String(v)) ? (msg || 'Invalid format') : null,
  email: (msg) => (v) => v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? (msg || 'Invalid email address') : null,
};

/**
 * Validate a single field value against an array of rule functions.
 * @param {string} value
 * @param {Function[]} fieldRules
 * @returns {string|null} first error message or null
 */
export function validateField(value, fieldRules) {
  for (const rule of fieldRules) {
    const err = rule(value);
    if (err) return err;
  }
  return null;
}

/**
 * Validate all fields described by rulesMap against a form.
 * @param {HTMLFormElement} form
 * @param {Object<string, Function[]>} rulesMap  — field name → array of rule fns
 * @returns {Object<string, string>} errors keyed by field name (empty if valid)
 */
export function validateForm(form, rulesMap) {
  const errors = {};
  for (const [name, fieldRules] of Object.entries(rulesMap)) {
    const input = form.elements[name];
    if (!input) continue;
    const value = input.value;
    const err = validateField(value, fieldRules);
    if (err) errors[name] = err;
  }
  return errors;
}

// ─── DOM helpers ───

function getOrCreateError(input) {
  let errEl = input.parentElement && input.parentElement.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'field-error';
    errEl.setAttribute('role', 'alert');
    input.parentElement.appendChild(errEl);
  }
  return errEl;
}

function showFieldError(input, message) {
  input.classList.add('input-invalid');
  input.classList.remove('input-valid');
  const errEl = getOrCreateError(input);
  errEl.textContent = message;
  errEl.style.display = '';
}

function clearFieldError(input) {
  input.classList.remove('input-invalid');
  input.classList.add('input-valid');
  const errEl = input.parentElement && input.parentElement.querySelector('.field-error');
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
}

/**
 * Attach real-time validation to a form.
 * Validates on blur and input events, shows inline errors.
 * @param {HTMLFormElement} form
 * @param {Object<string, Function[]>} rulesMap
 */
export function attachValidation(form, rulesMap) {
  for (const [name, fieldRules] of Object.entries(rulesMap)) {
    const input = form.elements[name];
    if (!input) continue;

    const check = () => {
      const err = validateField(input.value, fieldRules);
      if (err) { showFieldError(input, err); } else { clearFieldError(input); }
    };

    input.addEventListener('blur', check);
    input.addEventListener('input', check);
  }

  // Intercept submit: validate everything first
  form.addEventListener('submit', (e) => {
    const errors = validateForm(form, rulesMap);
    const names = Object.keys(errors);
    if (names.length > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Show all errors
      for (const [n, msg] of Object.entries(errors)) {
        const inp = form.elements[n];
        if (inp) showFieldError(inp, msg);
      }
      // Focus the first invalid field
      const first = form.elements[names[0]];
      if (first) first.focus();
    }
  }, true); // capture phase so it fires before the form's own handler
}
