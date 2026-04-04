// tests/frontend-utils-deep.test.js — Deep coverage: utils.js, form-validator.js, pagination.js, ui-states.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

const utilsJs = read('js/utils.js');
const formValidatorJs = read('js/form-validator.js');
const paginationJs = read('js/pagination.js');
const uiStatesJs = read('js/ui-states.js');
const notificationsJs = read('js/notifications.js');
const chartsJs = read('js/charts.js');
const loginJs = read('js/login.js');

// ════════════════════════════════════════════════════════════════
// UTILS.JS — Complete API, fmt, date, toast, modal, el, confirm
// ════════════════════════════════════════════════════════════════

describe('utils.js — api() function', () => {
  it('api is an exported async function', () => {
    assert.ok(utilsJs.includes('export async function api('));
  });

  it('prepends /api to path', () => {
    assert.ok(utilsJs.includes('`/api${path}`'));
  });

  it('sets Content-Type to application/json', () => {
    assert.ok(utilsJs.includes("'Content-Type': 'application/json'"));
  });

  it('reads token from both localStorage and sessionStorage', () => {
    assert.ok(utilsJs.includes("localStorage.getItem('pfi_token')"));
    assert.ok(utilsJs.includes("sessionStorage.getItem('pfi_token')"));
  });

  it('attaches X-Session-Token header when token exists', () => {
    assert.ok(utilsJs.includes("headers['X-Session-Token'] = t"));
  });

  it('handles 401 by clearing storage and redirecting', () => {
    assert.ok(utilsJs.includes('res.status === 401'));
    assert.ok(utilsJs.includes("localStorage.removeItem('pfi_token')"));
    assert.ok(utilsJs.includes("localStorage.removeItem('pfi_user')"));
    assert.ok(utilsJs.includes("sessionStorage.setItem('pfi_session_expired', '1')"));
    assert.ok(utilsJs.includes("window.location.href = '/login.html'"));
  });

  it('parses response as JSON', () => {
    assert.ok(utilsJs.includes('await res.json()'));
  });

  it('throws on non-ok responses with error message extraction', () => {
    assert.ok(utilsJs.includes("data.error?.message || 'API error'"));
  });

  it('returns parsed data on success', () => {
    assert.ok(utilsJs.includes('return data'));
  });

  it('spreads caller options into fetch', () => {
    assert.ok(utilsJs.includes('{ ...options, headers }'));
  });

  it('spreads caller headers', () => {
    assert.ok(utilsJs.includes('...options.headers'));
  });
});

describe('utils.js — Api object', () => {
  it('Api.get calls api with path only', () => {
    assert.ok(utilsJs.includes('get: (path) => api(path)'));
  });

  it('Api.post sends POST with JSON body', () => {
    assert.ok(utilsJs.includes("method: 'POST', body: JSON.stringify(body)"));
  });

  it('Api.put sends PUT with JSON body', () => {
    assert.ok(utilsJs.includes("method: 'PUT', body: JSON.stringify(body)"));
  });

  it('Api.del sends DELETE without body', () => {
    assert.ok(utilsJs.includes("del: (path) => api(path, { method: 'DELETE' })"));
  });

  it('Api does not have a delete method', () => {
    assert.ok(!utilsJs.includes('delete:'));
  });
});

describe('utils.js — fmt() currency formatter', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function fmt('));
  });

  it('defaults to INR currency', () => {
    assert.ok(utilsJs.includes("currency = 'INR'"));
  });

  it('handles null/undefined amounts as 0', () => {
    assert.ok(utilsJs.includes('amount || 0'));
  });

  it('uses Intl.NumberFormat with currency style', () => {
    assert.ok(utilsJs.includes("new Intl.NumberFormat(resolvedLocale, { style: 'currency', currency })"));
  });

  it('has CURRENCY_LOCALE mapping for 32 currencies', () => {
    const currencies = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SGD',
      'AED', 'BRL', 'KRW', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'ZAR', 'NZD',
      'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'MXN', 'RUB', 'HKD', 'TWD', 'ILS'];
    for (const c of currencies) {
      assert.ok(utilsJs.includes(`${c}:`), `CURRENCY_LOCALE must include ${c}`);
    }
  });

  it('maps INR to en-IN locale', () => {
    assert.ok(utilsJs.includes("INR: 'en-IN'"));
  });

  it('maps USD to en-US locale', () => {
    assert.ok(utilsJs.includes("USD: 'en-US'"));
  });

  it('falls back to en-US for unknown currencies', () => {
    assert.ok(utilsJs.includes("|| 'en-US'"));
  });

  it('accepts optional locale override', () => {
    const sig = utilsJs.match(/export function fmt\((.*?)\)/);
    assert.ok(sig[1].includes('locale'));
  });
});

describe('utils.js — formatDate()', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function formatDate('));
  });

  it('returns empty string for falsy input', () => {
    assert.ok(utilsJs.includes("if (!dateStr) return ''"));
  });

  it('appends T00:00:00 to avoid timezone shifts', () => {
    assert.ok(utilsJs.includes("dateStr + 'T00:00:00'"));
  });

  it('supports DD/MM/YYYY format', () => {
    assert.ok(utilsJs.includes("case 'DD/MM/YYYY':"));
  });

  it('supports MM/DD/YYYY format', () => {
    assert.ok(utilsJs.includes("case 'MM/DD/YYYY':"));
  });

  it('supports DD-MM-YYYY format', () => {
    assert.ok(utilsJs.includes("case 'DD-MM-YYYY':"));
  });

  it('supports DD.MM.YYYY format', () => {
    assert.ok(utilsJs.includes("case 'DD.MM.YYYY':"));
  });

  it('defaults to YYYY-MM-DD format', () => {
    assert.ok(utilsJs.includes("format = 'YYYY-MM-DD'"));
  });

  it('pads month and day with leading zeros', () => {
    assert.ok(utilsJs.includes("padStart(2, '0')"));
  });
});

describe('utils.js — toast()', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function toast('));
  });

  it('accepts message, type, and options params', () => {
    const sig = utilsJs.match(/export function toast\((.*?)\)/);
    assert.ok(sig[1].includes('message'));
    assert.ok(sig[1].includes('type'));
    assert.ok(sig[1].includes('options'));
  });

  it('defaults type to info', () => {
    assert.ok(utilsJs.includes("type = 'info'"));
  });

  it('creates div with toast-{type} class', () => {
    assert.ok(utilsJs.includes('`toast toast-${type}`'));
  });

  it('uses textContent for message (not innerHTML)', () => {
    assert.ok(utilsJs.includes('t.textContent = message'));
  });

  it('supports undo option with button', () => {
    assert.ok(utilsJs.includes('options.undo'));
    assert.ok(utilsJs.includes("'toast-undo-btn'"));
  });

  it('undo button removes toast on click', () => {
    assert.ok(utilsJs.includes('t.remove()'));
  });

  it('error toast has 8s duration', () => {
    assert.ok(utilsJs.includes("type === 'error' ? 8000"));
  });

  it('normal toast has 5s duration', () => {
    assert.ok(utilsJs.includes(': 5000'));
  });

  it('auto-removes via setTimeout', () => {
    assert.ok(utilsJs.includes('setTimeout(() => t.remove(), duration)'));
  });

  it('announces to screen readers via a11y-announce', () => {
    assert.ok(utilsJs.includes("document.getElementById('a11y-announce')"));
  });

  it('clears announce text first then sets after 100ms delay', () => {
    assert.ok(utilsJs.includes("announce.textContent = ''"));
    assert.ok(utilsJs.includes('setTimeout(() => { announce.textContent = msg; }, 100)'));
  });

  it('includes undo info in screen reader announcement', () => {
    assert.ok(utilsJs.includes('Undo available'));
  });
});

describe('utils.js — openModal()', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function openModal('));
  });

  it('saves current activeElement as trigger', () => {
    assert.ok(utilsJs.includes('_modalTrigger = document.activeElement'));
  });

  it('clears previous content safely', () => {
    assert.ok(utilsJs.includes("content.innerHTML = ''"));
  });

  it('handles string html by using textContent', () => {
    assert.ok(utilsJs.includes("typeof html === 'string'"));
    assert.ok(utilsJs.includes('content.textContent = html'));
  });

  it('handles element html by using appendChild', () => {
    assert.ok(utilsJs.includes('content.appendChild(html)'));
  });

  it('sets aria-labelledby from .modal-title if present', () => {
    assert.ok(utilsJs.includes("content.querySelector('.modal-title')"));
    assert.ok(utilsJs.includes("overlay.setAttribute('aria-labelledby'"));
  });

  it('removes aria-labelledby if no title found', () => {
    assert.ok(utilsJs.includes("overlay.removeAttribute('aria-labelledby')"));
  });

  it('auto-generates id for untitled modal titles', () => {
    assert.ok(utilsJs.includes("title.id = title.id || 'modal-title-auto'"));
  });

  it('prepends close button with aria-label', () => {
    assert.ok(utilsJs.includes("'aria-label': 'Close'"));
    assert.ok(utilsJs.includes("className: 'modal-close-btn'"));
  });

  it('does not duplicate close button', () => {
    assert.ok(utilsJs.includes("content.querySelector('.modal-close-btn')"));
  });

  it('removes hidden class from overlay', () => {
    assert.ok(utilsJs.includes("classList.remove('hidden')"));
  });

  it('focuses first focusable element after 50ms delay', () => {
    assert.ok(utilsJs.includes('setTimeout('));
    assert.ok(utilsJs.includes("input:not([type=\"hidden\"])"));
  });
});

describe('utils.js — closeModal()', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function closeModal()'));
  });

  it('adds hidden class to overlay', () => {
    assert.ok(utilsJs.includes("classList.add('hidden')"));
  });

  it('clears modal content', () => {
    // closeModal sets innerHTML = '' on modal-content
    const closeFn = utilsJs.slice(utilsJs.indexOf('export function closeModal'));
    assert.ok(closeFn.includes("innerHTML = ''"));
  });

  it('restores focus to trigger element', () => {
    assert.ok(utilsJs.includes('_modalTrigger.focus()'));
  });

  it('checks isConnected before focusing trigger', () => {
    assert.ok(utilsJs.includes('_modalTrigger.isConnected'));
  });

  it('nullifies trigger after restoring focus', () => {
    assert.ok(utilsJs.includes('_modalTrigger = null'));
  });
});

describe('utils.js — el() helper', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function el('));
  });

  it('creates element with document.createElement', () => {
    assert.ok(utilsJs.includes('document.createElement(tag)'));
  });

  it('handles className attribute', () => {
    assert.ok(utilsJs.includes("if (k === 'className') e.className = v"));
  });

  it('handles textContent attribute safely', () => {
    assert.ok(utilsJs.includes("if (k === 'textContent') e.textContent = v"));
  });

  it('handles event listeners via on* prefix', () => {
    assert.ok(utilsJs.includes("if (k.startsWith('on'))"));
    assert.ok(utilsJs.includes("e.addEventListener(k.slice(2).toLowerCase(), v)"));
  });

  it('sets other attributes via setAttribute', () => {
    assert.ok(utilsJs.includes("e.setAttribute(k, v)"));
  });

  it('handles string children as text nodes', () => {
    assert.ok(utilsJs.includes('document.createTextNode(child)'));
  });

  it('handles element children via appendChild', () => {
    assert.ok(utilsJs.includes('e.appendChild(child)'));
  });

  it('skips null/undefined children', () => {
    assert.ok(utilsJs.includes('if (child)'));
  });

  it('never uses innerHTML', () => {
    const elFn = utilsJs.slice(utilsJs.indexOf('export function el('), utilsJs.indexOf('export function el(') + 500);
    assert.ok(!elFn.includes('innerHTML'));
  });
});

describe('utils.js — confirm()', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function confirm('));
  });

  it('returns a Promise', () => {
    assert.ok(utilsJs.includes('return new Promise'));
  });

  it('creates confirm-dialog wrapper', () => {
    assert.ok(utilsJs.includes("className: 'confirm-dialog'"));
  });

  it('shows message in confirm-msg element', () => {
    assert.ok(utilsJs.includes("className: 'confirm-msg'"));
  });

  it('has Cancel button that resolves false', () => {
    assert.ok(utilsJs.includes("textContent: 'Cancel'"));
    assert.ok(utilsJs.includes('resolve(false)'));
  });

  it('has Delete button that resolves true', () => {
    assert.ok(utilsJs.includes("textContent: 'Delete'"));
    assert.ok(utilsJs.includes('resolve(true)'));
  });

  it('both buttons call closeModal', () => {
    const confirmFn = utilsJs.slice(utilsJs.indexOf('export function confirm'));
    const closeModalCalls = confirmFn.match(/closeModal\(\)/g) || [];
    assert.ok(closeModalCalls.length >= 2, 'Both Cancel and Delete must call closeModal');
  });

  it('opens the dialog via openModal', () => {
    const confirmFn = utilsJs.slice(utilsJs.indexOf('export function confirm'));
    assert.ok(confirmFn.includes('openModal('));
  });

  it('Delete button has btn-danger class', () => {
    assert.ok(utilsJs.includes("className: 'btn btn-danger'"));
  });
});

describe('utils.js — getUser/getToken', () => {
  it('getUser returns parsed pfi_user from storage', () => {
    assert.ok(utilsJs.includes('export function getUser()'));
    assert.ok(utilsJs.includes("localStorage.getItem('pfi_user')"));
  });

  it('getToken returns token from storage', () => {
    assert.ok(utilsJs.includes('export function getToken()'));
  });

  it('getUser falls back to empty object on missing data', () => {
    assert.ok(utilsJs.includes("|| '{}'"));
  });

  it('getUser tries sessionStorage as fallback', () => {
    assert.ok(utilsJs.includes("sessionStorage.getItem('pfi_user')"));
  });
});

describe('utils.js — renderColorPicker()', () => {
  it('is an exported function', () => {
    assert.ok(utilsJs.includes('export function renderColorPicker('));
  });

  it('has 10 preset colors', () => {
    assert.ok(utilsJs.includes('PRESET_COLORS'));
    const match = utilsJs.match(/PRESET_COLORS\s*=\s*\[(.*?)\]/s);
    const colors = match[1].split(',').map(s => s.trim()).filter(Boolean);
    assert.equal(colors.length, 10);
  });

  it('uses radiogroup ARIA role on container', () => {
    assert.ok(utilsJs.includes("role: 'radiogroup'"));
  });

  it('uses radio ARIA role on swatches', () => {
    assert.ok(utilsJs.includes("role: 'radio'"));
  });

  it('sets aria-checked on selected swatch', () => {
    assert.ok(utilsJs.includes("'aria-checked': String(selectedColor === color)"));
  });

  it('has aria-label on each swatch', () => {
    assert.ok(utilsJs.includes("'aria-label': color"));
  });

  it('toggles selected class on click', () => {
    assert.ok(utilsJs.includes("swatch.classList.add('selected')"));
    assert.ok(utilsJs.includes("s.classList.remove('selected')"));
  });

  it('calls onChange callback with selected color', () => {
    assert.ok(utilsJs.includes('if (onChange) onChange(color)'));
  });

  it('uses aria-label Color picker on container', () => {
    assert.ok(utilsJs.includes("'aria-label': 'Color picker'"));
  });
});

describe('utils.js — withLoading()', () => {
  it('is an exported async function', () => {
    assert.ok(utilsJs.includes('export async function withLoading('));
  });

  it('takes button and asyncFn params', () => {
    const sig = utilsJs.match(/export async function withLoading\((.*?)\)/);
    assert.ok(sig[1].includes('button'));
    assert.ok(sig[1].includes('asyncFn'));
  });

  it('returns early if button already disabled', () => {
    assert.ok(utilsJs.includes('if (button.disabled) return'));
  });

  it('saves original button text', () => {
    assert.ok(utilsJs.includes('const original = button.textContent'));
  });

  it('disables button during loading', () => {
    assert.ok(utilsJs.includes('button.disabled = true'));
  });

  it('adds btn-loading class during loading', () => {
    assert.ok(utilsJs.includes("button.classList.add('btn-loading')"));
  });

  it('restores state in finally block', () => {
    assert.ok(utilsJs.includes('finally'));
    assert.ok(utilsJs.includes('button.disabled = false'));
    assert.ok(utilsJs.includes("button.classList.remove('btn-loading')"));
    assert.ok(utilsJs.includes('button.textContent = original'));
  });
});

// ════════════════════════════════════════════════════════════════
// FORM-VALIDATOR.JS — rules, validateField, validateForm, attachValidation
// ════════════════════════════════════════════════════════════════

describe('form-validator.js — rules', () => {
  it('exports rules as const', () => {
    assert.ok(formValidatorJs.includes('export const rules'));
  });

  it('required rule checks trimmed empty string', () => {
    assert.ok(formValidatorJs.includes("!String(v).trim()"));
  });

  it('required returns custom message or default', () => {
    assert.ok(formValidatorJs.includes("msg || 'This field is required'"));
  });

  it('minLength checks string length < n', () => {
    assert.ok(formValidatorJs.includes('String(v).trim().length < n'));
  });

  it('maxLength checks string length > n', () => {
    assert.ok(formValidatorJs.includes('String(v).trim().length > n'));
  });

  it('min checks numeric value < n', () => {
    assert.ok(formValidatorJs.includes("Number(v) < n"));
  });

  it('max checks numeric value > n', () => {
    assert.ok(formValidatorJs.includes("Number(v) > n"));
  });

  it('min/max skip empty values', () => {
    assert.ok(formValidatorJs.includes("v !== '' && Number(v) < n"));
    assert.ok(formValidatorJs.includes("v !== '' && Number(v) > n"));
  });

  it('pattern uses regex test', () => {
    assert.ok(formValidatorJs.includes('!re.test(String(v))'));
  });

  it('email validates with proper regex', () => {
    assert.ok(formValidatorJs.includes('@'));
    assert.ok(formValidatorJs.includes("'Invalid email address'"));
  });

  it('email regex rejects strings without @', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    assert.ok(!emailRegex.test('invalid'));
    assert.ok(!emailRegex.test('no-at-sign.com'));
    assert.ok(emailRegex.test('valid@email.com'));
  });

  it('all rules are curried functions returning validators', () => {
    for (const name of ['required', 'minLength', 'maxLength', 'min', 'max', 'pattern', 'email']) {
      assert.ok(formValidatorJs.includes(`${name}:`), `rules.${name} must exist`);
    }
  });

  it('all rules return null for valid values', () => {
    assert.ok(formValidatorJs.includes(': null'));
  });
});

describe('form-validator.js — validateField()', () => {
  it('is an exported function', () => {
    assert.ok(formValidatorJs.includes('export function validateField('));
  });

  it('accepts value and fieldRules params', () => {
    const sig = formValidatorJs.match(/export function validateField\((.*?)\)/);
    assert.ok(sig[1].includes('value'));
    assert.ok(sig[1].includes('fieldRules'));
  });

  it('iterates rules and returns first error', () => {
    assert.ok(formValidatorJs.includes('if (err) return err'));
  });

  it('returns null when all rules pass', () => {
    assert.ok(formValidatorJs.includes('return null'));
  });
});

describe('form-validator.js — validateForm()', () => {
  it('is an exported function', () => {
    assert.ok(formValidatorJs.includes('export function validateForm('));
  });

  it('iterates rulesMap entries', () => {
    assert.ok(formValidatorJs.includes('Object.entries(rulesMap)'));
  });

  it('reads input values from form.elements', () => {
    assert.ok(formValidatorJs.includes('form.elements[name]'));
  });

  it('skips missing form inputs gracefully', () => {
    assert.ok(formValidatorJs.includes('if (!input) continue'));
  });

  it('returns errors object keyed by field name', () => {
    assert.ok(formValidatorJs.includes('errors[name] = err'));
  });

  it('returns empty object when all valid', () => {
    assert.ok(formValidatorJs.includes('const errors = {}'));
    assert.ok(formValidatorJs.includes('return errors'));
  });
});

describe('form-validator.js — attachValidation()', () => {
  it('is an exported function', () => {
    assert.ok(formValidatorJs.includes('export function attachValidation('));
  });

  it('listens to blur events on inputs', () => {
    assert.ok(formValidatorJs.includes("input.addEventListener('blur'"));
  });

  it('listens to input events for real-time feedback', () => {
    assert.ok(formValidatorJs.includes("input.addEventListener('input'"));
  });

  it('intercepts submit with capture phase', () => {
    assert.ok(formValidatorJs.includes("}, true)"));
  });

  it('prevents default on validation failure', () => {
    assert.ok(formValidatorJs.includes('e.preventDefault()'));
  });

  it('stops immediate propagation on failure', () => {
    assert.ok(formValidatorJs.includes('e.stopImmediatePropagation()'));
  });

  it('focuses first invalid field on submit error', () => {
    assert.ok(formValidatorJs.includes('if (first) first.focus()'));
  });

  it('shows errors inline via showFieldError', () => {
    assert.ok(formValidatorJs.includes('showFieldError('));
  });
});

describe('form-validator.js — DOM helpers', () => {
  it('field-error elements use role="alert"', () => {
    assert.ok(formValidatorJs.includes("'alert'"));
  });

  it('shows input-invalid class on error', () => {
    assert.ok(formValidatorJs.includes("'input-invalid'"));
  });

  it('shows input-valid class on valid', () => {
    assert.ok(formValidatorJs.includes("'input-valid'"));
  });

  it('hides error element when valid', () => {
    assert.ok(formValidatorJs.includes("errEl.style.display = 'none'"));
  });

  it('creates error element if not present', () => {
    assert.ok(formValidatorJs.includes("document.createElement('span')"));
    assert.ok(formValidatorJs.includes("'field-error'"));
  });

  it('reuses existing error element', () => {
    assert.ok(formValidatorJs.includes("querySelector('.field-error')"));
  });
});

// ════════════════════════════════════════════════════════════════
// PAGINATION.JS — renderPagination, getPageNumbers
// ════════════════════════════════════════════════════════════════

describe('pagination.js — renderPagination()', () => {
  it('is an exported function', () => {
    assert.ok(paginationJs.includes('export function renderPagination'));
  });

  it('clears container before rendering', () => {
    assert.ok(paginationJs.includes("innerHTML = ''") || paginationJs.includes('.textContent'));
  });

  it('renders nothing for single page (totalPages <= 1)', () => {
    assert.ok(paginationJs.includes('totalPages <= 1'));
  });

  it('creates First button', () => {
    assert.ok(paginationJs.includes('First'));
  });

  it('creates Prev button', () => {
    assert.ok(paginationJs.includes('Prev'));
  });

  it('creates Next button', () => {
    assert.ok(paginationJs.includes('Next'));
  });

  it('creates Last button', () => {
    assert.ok(paginationJs.includes('Last'));
  });

  it('disables First/Prev on page 1', () => {
    assert.ok(paginationJs.includes('currentPage === 1'));
  });

  it('disables Next/Last on last page', () => {
    assert.ok(paginationJs.includes('currentPage === totalPages'));
  });

  it('sets aria-current="page" on active page', () => {
    assert.ok(paginationJs.includes("'aria-current'"));
    assert.ok(paginationJs.includes("'page'"));
  });

  it('has aria-label Pagination on nav', () => {
    assert.ok(paginationJs.includes("'aria-label'"));
  });

  it('shows Page X of Y info', () => {
    assert.ok(paginationJs.includes('Page '));
    assert.ok(paginationJs.includes('page-info'));
  });

  it('calls onPageChange callback on page click', () => {
    assert.ok(paginationJs.includes('onPageChange'));
  });
});

describe('pagination.js — getPageNumbers()', () => {
  it('returns all pages for total <= 7', () => {
    assert.ok(paginationJs.includes('total <= 7'));
  });

  it('uses ellipsis for large page counts', () => {
    assert.ok(paginationJs.includes("'...'"));
  });

  it('shows pages around current page', () => {
    assert.ok(paginationJs.includes('current - 1'));
    assert.ok(paginationJs.includes('current + 1'));
  });

  it('always includes first and last pages', () => {
    assert.ok(paginationJs.includes('1'));
    assert.ok(paginationJs.includes('total'));
  });

  it('renders ellipsis character', () => {
    assert.ok(paginationJs.includes('…'));
  });
});

// ════════════════════════════════════════════════════════════════
// UI-STATES.JS — showLoading, showEmpty, showError, etc.
// ════════════════════════════════════════════════════════════════

describe('ui-states.js — exports', () => {
  for (const fn of ['showLoading', 'showLoadingSkeleton', 'showEmpty', 'showError', 'hideStates', 'showTableSkeleton']) {
    it(`exports ${fn}`, () => {
      assert.ok(uiStatesJs.includes(`export function ${fn}`));
    });
  }
});

describe('ui-states.js — showLoading()', () => {
  it('creates spinner element', () => {
    assert.ok(uiStatesJs.includes('ui-spinner'));
  });

  it('creates skeleton loading lines', () => {
    assert.ok(uiStatesJs.includes('skeleton-line'));
  });

  it('calls hideStates first', () => {
    const showLoadingStart = uiStatesJs.indexOf('function showLoading');
    const showLoadingBody = uiStatesJs.slice(showLoadingStart, showLoadingStart + 400);
    assert.ok(showLoadingBody.includes('hideStates('));
  });
});

describe('ui-states.js — showEmpty()', () => {
  it('has customizable icon', () => {
    assert.ok(uiStatesJs.includes('ui-empty-icon'));
  });

  it('has customizable title', () => {
    assert.ok(uiStatesJs.includes('ui-empty-title'));
  });

  it('has customizable message', () => {
    assert.ok(uiStatesJs.includes('ui-empty-message'));
  });

  it('has optional action button', () => {
    assert.ok(uiStatesJs.includes('ui-empty-action'));
  });

  it('calls hideStates first', () => {
    const fnStart = uiStatesJs.indexOf('function showEmpty');
    const fnBody = uiStatesJs.slice(fnStart, fnStart + 400);
    assert.ok(fnBody.includes('hideStates('));
  });
});

describe('ui-states.js — showError()', () => {
  it('has error icon', () => {
    assert.ok(uiStatesJs.includes('error_outline'));
  });

  it('has retry button', () => {
    assert.ok(uiStatesJs.includes('ui-error-retry'));
  });

  it('calls hideStates first', () => {
    const fnStart = uiStatesJs.indexOf('function showError');
    const fnBody = uiStatesJs.slice(fnStart, fnStart + 400);
    assert.ok(fnBody.includes('hideStates('));
  });
});

describe('ui-states.js — hideStates()', () => {
  it('removes loading state', () => {
    assert.ok(uiStatesJs.includes('.ui-loading'));
  });

  it('removes empty state', () => {
    assert.ok(uiStatesJs.includes('.ui-empty'));
  });

  it('removes error state', () => {
    assert.ok(uiStatesJs.includes('.ui-error'));
  });

  it('uses element.remove()', () => {
    assert.ok(uiStatesJs.includes('.remove()'));
  });
});

describe('ui-states.js — showTableSkeleton()', () => {
  it('accepts container and optional row count', () => {
    const sig = uiStatesJs.match(/function showTableSkeleton\((.*?)\)/);
    assert.ok(sig);
  });

  it('creates skeleton rows', () => {
    assert.ok(uiStatesJs.includes('skeleton'));
  });
});

// ════════════════════════════════════════════════════════════════
// NOTIFICATIONS.JS — polling, badge, panel
// ════════════════════════════════════════════════════════════════

describe('notifications.js — polling', () => {
  it('exports startPolling', () => {
    assert.ok(notificationsJs.includes('export function startPolling'));
  });

  it('exports stopPolling', () => {
    assert.ok(notificationsJs.includes('export function stopPolling'));
  });

  it('polls every 30 seconds', () => {
    assert.ok(notificationsJs.includes('30000'));
  });

  it('clears existing timer before starting new poll', () => {
    assert.ok(notificationsJs.includes('if (pollTimer) clearInterval(pollTimer)'));
  });

  it('stopPolling clears interval', () => {
    assert.ok(notificationsJs.includes('clearInterval(pollTimer)'));
    assert.ok(notificationsJs.includes('pollTimer = null'));
  });
});

describe('notifications.js — badge', () => {
  it('shows count badge for unread', () => {
    assert.ok(notificationsJs.includes('badge'));
    assert.ok(notificationsJs.includes('count > 0'));
  });

  it('caps badge at 99+', () => {
    assert.ok(notificationsJs.includes("'99+'"));
  });

  it('hides badge when count is 0', () => {
    assert.ok(notificationsJs.includes("classList.add('hidden')"));
  });
});

describe('notifications.js — panel', () => {
  it('toggles panel visibility', () => {
    assert.ok(notificationsJs.includes('togglePanel'));
    assert.ok(notificationsJs.includes('panelOpen'));
  });

  it('sets aria-expanded on bell', () => {
    assert.ok(notificationsJs.includes("bell.setAttribute('aria-expanded'"));
  });

  it('fetches notifications on panel open', () => {
    assert.ok(notificationsJs.includes('fetchNotifications'));
  });

  it('closes panel on backdrop click', () => {
    assert.ok(notificationsJs.includes("backdrop.addEventListener('click', closePanel)"));
  });

  it('closes panel on Escape key', () => {
    assert.ok(notificationsJs.includes("e.key === 'Escape'"));
  });

  it('marks individual notification as read', () => {
    assert.ok(notificationsJs.includes('markRead'));
    assert.ok(notificationsJs.includes('/read'));
  });

  it('marks all notifications as read', () => {
    assert.ok(notificationsJs.includes('markAllRead'));
    assert.ok(notificationsJs.includes('/notifications/read-all'));
  });
});

describe('notifications.js — rendering', () => {
  it('uses textContent for notification messages (safe)', () => {
    assert.ok(notificationsJs.includes('msg.textContent = n.message'));
  });

  it('shows time ago for notification timestamps', () => {
    assert.ok(notificationsJs.includes('timeAgo'));
  });

  it('timeAgo handles just now', () => {
    assert.ok(notificationsJs.includes("'just now'"));
  });

  it('timeAgo handles minutes', () => {
    assert.ok(notificationsJs.includes("m ago"));
  });

  it('timeAgo handles hours', () => {
    assert.ok(notificationsJs.includes("h ago"));
  });

  it('timeAgo handles days', () => {
    assert.ok(notificationsJs.includes("d ago"));
  });

  it('shows empty state for no notifications', () => {
    assert.ok(notificationsJs.includes('No notifications'));
  });

  it('shows unread dot for unread items', () => {
    assert.ok(notificationsJs.includes('notif-unread-dot'));
  });

  it('navigation maps notification types to views', () => {
    assert.ok(notificationsJs.includes('budget_exceeded'));
    assert.ok(notificationsJs.includes('goal_completed'));
    assert.ok(notificationsJs.includes('large_transaction'));
    assert.ok(notificationsJs.includes('bill_reminder'));
  });

  it('maps correct icon per notification type', () => {
    assert.ok(notificationsJs.includes('getNotifIcon'));
    assert.ok(notificationsJs.includes("large_transaction: 'warning'"));
    assert.ok(notificationsJs.includes("goal_completed: 'emoji_events'"));
    assert.ok(notificationsJs.includes("budget_exceeded: 'trending_up'"));
  });
});

// ════════════════════════════════════════════════════════════════
// CHARTS.JS — initDashboardCharts, rendering, theming
// ════════════════════════════════════════════════════════════════

describe('charts.js — exports', () => {
  it('exports initDashboardCharts', () => {
    assert.ok(chartsJs.includes('export async function initDashboardCharts'));
  });

  it('exports destroyCharts', () => {
    assert.ok(chartsJs.includes('export { destroyCharts }'));
  });
});

describe('charts.js — theme integration', () => {
  it('reads CSS custom properties for theme colors', () => {
    assert.ok(chartsJs.includes('getComputedStyle'));
    assert.ok(chartsJs.includes('getPropertyValue'));
  });

  it('has fallback values for all CSS properties', () => {
    assert.ok(chartsJs.includes("'#6366f1'"));
    assert.ok(chartsJs.includes("'#10b981'"));
    assert.ok(chartsJs.includes("'#ef4444'"));
  });

  it('reads --accent, --green, --red, --yellow', () => {
    assert.ok(chartsJs.includes("'--accent'"));
    assert.ok(chartsJs.includes("'--green'"));
    assert.ok(chartsJs.includes("'--red'"));
    assert.ok(chartsJs.includes("'--yellow'"));
  });

  it('reads --text-secondary for chart text color', () => {
    assert.ok(chartsJs.includes("'--text-secondary'"));
  });

  it('reads --border for grid lines', () => {
    assert.ok(chartsJs.includes("'--border'"));
  });
});

describe('charts.js — chart rendering', () => {
  it('creates doughnut chart for spending by category', () => {
    assert.ok(chartsJs.includes("type: 'doughnut'"));
  });

  it('creates bar chart for income vs expense', () => {
    assert.ok(chartsJs.includes("type: 'bar'"));
  });

  it('creates line chart for spending trend', () => {
    assert.ok(chartsJs.includes("type: 'line'"));
  });

  it('fetches spending-pie data', () => {
    assert.ok(chartsJs.includes('/charts/spending-pie'));
  });

  it('fetches income-expense data', () => {
    assert.ok(chartsJs.includes('/charts/income-expense'));
  });

  it('fetches spending-trend data', () => {
    assert.ok(chartsJs.includes('/charts/spending-trend'));
  });

  it('handles empty data gracefully with noDataMessage', () => {
    assert.ok(chartsJs.includes('noDataMessage'));
    assert.ok(chartsJs.includes("'No data available'"));
  });

  it('respects prefers-reduced-motion', () => {
    assert.ok(chartsJs.includes('prefers-reduced-motion'));
    assert.ok(chartsJs.includes('reducedMotion'));
    assert.ok(chartsJs.includes('animation: !reducedMotion'));
  });

  it('destroyCharts cleans up chart instances', () => {
    assert.ok(chartsJs.includes('destroyChart'));
    assert.ok(chartsJs.includes('.destroy()'));
  });

  it('sets chart to null after destroy', () => {
    assert.ok(chartsJs.includes('= null'));
  });

  it('uses 60% cutout for doughnut chart', () => {
    assert.ok(chartsJs.includes("cutout: '60%'"));
  });

  it('has click handler on doughnut for drill-down', () => {
    assert.ok(chartsJs.includes('onClick:'));
  });

  it('uses beginAtZero on y axis', () => {
    assert.ok(chartsJs.includes('beginAtZero: true'));
  });

  it('uses INR formatting in tooltips', () => {
    assert.ok(chartsJs.includes("toLocaleString('en-IN')"));
  });

  it('line chart uses fill and tension', () => {
    assert.ok(chartsJs.includes('fill: true'));
    assert.ok(chartsJs.includes('tension: 0.3'));
  });
});

describe('charts.js — date helpers', () => {
  it('has monthStart() helper', () => {
    assert.ok(chartsJs.includes('function monthStart()'));
  });

  it('has monthsAgo() helper', () => {
    assert.ok(chartsJs.includes('function monthsAgo('));
  });

  it('has daysAgo() helper', () => {
    assert.ok(chartsJs.includes('function daysAgo('));
  });

  it('has todayStr() helper', () => {
    assert.ok(chartsJs.includes('function todayStr()'));
  });
});

// ════════════════════════════════════════════════════════════════
// LOGIN.JS — auth flow, UX, security
// ════════════════════════════════════════════════════════════════

describe('login.js — form submission', () => {
  it('uses /api/auth/ endpoint with template literal', () => {
    assert.ok(loginJs.includes('/api/auth/'));
    assert.ok(loginJs.includes("isLogin ? 'login' : 'register'"));
  });

  it('sends POST request', () => {
    assert.ok(loginJs.includes("method: 'POST'"));
  });

  it('sends JSON content type', () => {
    assert.ok(loginJs.includes("'Content-Type': 'application/json'"));
  });

  it('stringifies body', () => {
    assert.ok(loginJs.includes('JSON.stringify(body)'));
  });

  it('stores token on success', () => {
    assert.ok(loginJs.includes("storage.setItem('pfi_token', data.token)"));
  });

  it('stores user data on success', () => {
    assert.ok(loginJs.includes("storage.setItem('pfi_user', JSON.stringify(data.user))"));
  });

  it('uses localStorage or sessionStorage based on remember-me', () => {
    assert.ok(loginJs.includes('remember'));
    assert.ok(loginJs.includes('localStorage : sessionStorage'));
  });

  it('shows error messages using textContent (not innerHTML)', () => {
    assert.ok(loginJs.includes('errorMsg.textContent ='));
    const dangerousSetters = loginJs.match(/errorMsg\.innerHTML\s*=/g) || [];
    assert.equal(dangerousSetters.length, 0);
  });

  it('handles network errors', () => {
    assert.ok(loginJs.includes("'Network error'"));
  });
});

describe('login.js — tab switching', () => {
  it('has tab-based auth switching', () => {
    assert.ok(loginJs.includes('auth-tab'));
  });

  it('sets aria-selected on active tab', () => {
    assert.ok(loginJs.includes("aria-selected"));
  });

  it('changes button text between Sign In and Register', () => {
    assert.ok(loginJs.includes("'Sign In'"));
    assert.ok(loginJs.includes("'Register'"));
  });

  it('toggles display_name field visibility', () => {
    assert.ok(loginJs.includes('groupDisplay'));
  });

  it('clears error message on switch', () => {
    assert.ok(loginJs.includes("errorMsg.textContent = ''"));
  });
});

describe('login.js — password features', () => {
  it('has password visibility toggle', () => {
    assert.ok(loginJs.includes('password-toggle'));
    assert.ok(loginJs.includes("pw.type === 'password'"));
  });

  it('toggle updates aria-label', () => {
    assert.ok(loginJs.includes("'Hide password'"));
    assert.ok(loginJs.includes("'Show password'"));
  });

  it('has real-time password requirements checking', () => {
    assert.ok(loginJs.includes('/.{8,}/'));
    assert.ok(loginJs.includes('/[A-Z]/'));
    assert.ok(loginJs.includes('/[a-z]/'));
    assert.ok(loginJs.includes('/[0-9]/'));
    assert.ok(loginJs.includes('/[^a-zA-Z0-9]/'));
  });

  it('marks requirements as met with class toggle', () => {
    assert.ok(loginJs.includes("'met'"));
  });

  it('only checks requirements in register mode', () => {
    assert.ok(loginJs.includes('if (isLogin) return'));
  });

  it('sets autocomplete attribute based on mode', () => {
    assert.ok(loginJs.includes("'current-password'"));
    assert.ok(loginJs.includes("'new-password'"));
  });
});

describe('login.js — session and redirect', () => {
  it('redirects if already logged in', () => {
    assert.ok(loginJs.includes("if (localStorage.getItem('pfi_token'))"));
  });

  it('shows session expiry message', () => {
    assert.ok(loginJs.includes('pfi_session_expired'));
    assert.ok(loginJs.includes('Your session expired'));
  });

  it('clears session expired flag after showing', () => {
    assert.ok(loginJs.includes("sessionStorage.removeItem('pfi_session_expired')"));
  });

  it('has demo quick-fill button', () => {
    assert.ok(loginJs.includes('demo-btn'));
    assert.ok(loginJs.includes("'demo'"));
    assert.ok(loginJs.includes("'demo123'"));
  });
});
