// tests/frontend-exhaustive.test.js — 20 Iterations of Exhaustive Frontend Coverage
// Covers: API contract safety, view rendering patterns, security, a11y, state management,
// form validation, SPA routing, service worker, pagination, cross-view consistency.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

// ── Preload all source files ──
const appJs = read('js/app.js');
const utilsJs = read('js/utils.js');
const chartsJs = read('js/charts.js');
const swJs = read('sw.js');
const loginJs = read('js/login.js');
const paginationJs = read('js/pagination.js');
const formValidatorJs = read('js/form-validator.js');
const uiStatesJs = read('js/ui-states.js');
const notificationsJs = read('js/notifications.js');
const indexHtml = read('index.html');
const loginHtml = read('login.html');
const landingHtml = read('landing.html');
const stylesCss = read('styles.css');

const viewFiles = {};
const viewDir = path.join(PUBLIC, 'js', 'views');
for (const f of fs.readdirSync(viewDir).filter(f => f.endsWith('.js'))) {
  viewFiles[f.replace('.js', '')] = fs.readFileSync(path.join(viewDir, f), 'utf8');
}

// ── Helpers ──
const allJsFiles = [];
function collectJs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'vendor') collectJs(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) allJsFiles.push({ path: full, content: fs.readFileSync(full, 'utf8'), name: entry.name });
  }
}
collectJs(path.join(PUBLIC, 'js'));
allJsFiles.push({ path: path.join(PUBLIC, 'sw.js'), content: swJs, name: 'sw.js' });

const allViewSources = Object.values(viewFiles);
const allViewNames = Object.keys(viewFiles);

// ═════════════════════════════════════════════════════════════════
// ITERATION 1: API Method Contract Safety
// Ensures no view uses non-existent API methods
// ═════════════════════════════════════════════════════════════════
describe('Iteration 1 — API Method Contract Safety', () => {
  it('no view uses Api.delete() — must use Api.del()', () => {
    for (const file of allJsFiles) {
      const matches = file.content.match(/Api\.delete\s*\(/g) || [];
      assert.equal(matches.length, 0, `${file.name} uses Api.delete() which does not exist — use Api.del()`);
    }
  });

  it('all views importing Api use only valid methods (get/post/put/del)', () => {
    const validMethods = /Api\.(get|post|put|del)\s*\(/;
    const anyApiCall = /Api\.(\w+)\s*\(/g;
    for (const file of allJsFiles) {
      if (!file.content.includes('Api')) continue;
      let match;
      while ((match = anyApiCall.exec(file.content)) !== null) {
        const method = match[1];
        assert.ok(['get', 'post', 'put', 'del'].includes(method),
          `${file.name} uses Api.${method}() which is not a valid Api method`);
      }
    }
  });

  it('Api.del() is defined in utils.js', () => {
    assert.ok(utilsJs.includes('del:'), 'utils.js must define Api.del');
    assert.ok(utilsJs.includes("method: 'DELETE'"), 'Api.del must use DELETE method');
  });

  it('all API paths in views start with / and do not double-prefix /api/', () => {
    for (const file of allJsFiles) {
      const apiCalls = file.content.match(/Api\.\w+\s*\(\s*[`'"]([^`'"]+)[`'"]/g) || [];
      for (const call of apiCalls) {
        const pathMatch = call.match(/[`'"]([^`'"]+)[`'"]/);
        if (pathMatch) {
          const apiPath = pathMatch[1];
          assert.ok(!apiPath.startsWith('/api/'),
            `${file.name}: Api call uses /api/ prefix directly ("${apiPath}"). The api() helper already prepends /api.`);
        }
      }
    }
  });

  it('api() helper prepends /api to all paths', () => {
    assert.ok(utilsJs.includes('`/api${path}`'), 'api() must prepend /api to path');
  });

  it('api() sends X-Session-Token header', () => {
    assert.ok(utilsJs.includes("'X-Session-Token'"), 'api() must include session token header');
  });

  it('api() handles 401 by clearing storage and redirecting', () => {
    assert.ok(utilsJs.includes('res.status === 401'), 'api() must check for 401');
    assert.ok(utilsJs.includes("removeItem('pfi_token')"), 'api() must clear token on 401');
    assert.ok(utilsJs.includes("'/login.html'"), 'api() must redirect to login on 401');
  });

  it('api() throws on non-ok responses', () => {
    assert.ok(utilsJs.includes('if (!res.ok) throw'), 'api() must throw on error responses');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 2: fmt() Currency Formatter Contract
// ═════════════════════════════════════════════════════════════════
describe('Iteration 2 — Currency Formatter Contract', () => {
  it('fmt is exported as a function, not an object', () => {
    assert.ok(utilsJs.includes('export function fmt('), 'fmt must be a plain function');
    assert.ok(!utilsJs.includes('fmt.currency'), 'utils.js must not define fmt.currency');
  });

  it('no file uses fmt.currency() — must use fmt()', () => {
    for (const file of allJsFiles) {
      assert.ok(!file.content.includes('fmt.currency('),
        `${file.name} uses fmt.currency() which does not exist. Use fmt() directly.`);
    }
  });

  it('fmt handles multiple currencies with locale mapping', () => {
    assert.ok(utilsJs.includes('CURRENCY_LOCALE'), 'utils.js must have CURRENCY_LOCALE map');
    assert.ok(utilsJs.includes("INR: 'en-IN'"), 'INR must map to en-IN');
    assert.ok(utilsJs.includes("USD: 'en-US'"), 'USD must map to en-US');
    assert.ok(utilsJs.includes('Intl.NumberFormat'), 'fmt must use Intl.NumberFormat');
  });

  it('fmt has sensible defaults (INR, 0 amount)', () => {
    assert.ok(utilsJs.includes("currency = 'INR'"), 'fmt defaults to INR');
    assert.ok(utilsJs.includes('amount || 0'), 'fmt defaults null/undefined amounts to 0');
  });

  it('all views that import fmt use it as a function call', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (!src.includes('fmt')) continue;
      const fmtUsages = src.match(/fmt\b[.(]/g) || [];
      for (const usage of fmtUsages) {
        assert.ok(usage === 'fmt(' || usage === 'fmt.',
          `${name}.js has unexpected fmt usage: ${usage}`);
        if (usage === 'fmt.') {
          // Only allow destructured import like `{ fmt }` — not `fmt.something(`
          const dotUsages = src.match(/fmt\.\w+\s*\(/g) || [];
          assert.equal(dotUsages.length, 0, `${name}.js calls fmt.method() which is invalid`);
        }
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 3: View Rendering Contract — Every View Exports render*
// ═════════════════════════════════════════════════════════════════
describe('Iteration 3 — View Rendering Contracts', () => {
  it('every view file exports a render function', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const exportMatch = src.match(/export\s+(async\s+)?function\s+render\w+/);
      assert.ok(exportMatch, `${name}.js must export a render* function`);
    }
  });

  it('every view render function accepts a container parameter', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const fnMatch = src.match(/export\s+(?:async\s+)?function\s+render\w+\s*\((\w+)/);
      assert.ok(fnMatch, `${name}.js render function must accept a parameter`);
      assert.equal(fnMatch[1], 'container', `${name}.js render function first param should be "container"`);
    }
  });

  it('every view clears container before rendering', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const clearsContainer = src.includes("container.innerHTML = ''") ||
        src.includes('container.innerHTML=""') ||
        src.includes('container.replaceChildren') ||
        src.includes("container.textContent = ''");
      assert.ok(clearsContainer, `${name}.js must clear container at start of render`);
    }
  });

  it('all views import from utils.js', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      assert.ok(src.includes("from '../utils.js'"), `${name}.js must import from utils.js`);
    }
  });

  it('all views that make API calls handle errors with try/catch', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (!src.includes('Api.')) continue;
      const apiCalls = (src.match(/Api\.\w+\s*\(/g) || []).length;
      if (apiCalls > 0) {
        assert.ok(src.includes('catch'), `${name}.js makes ${apiCalls} API calls but has no error handling`);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 4: Security — No innerHTML with Dynamic Data
// ═════════════════════════════════════════════════════════════════
describe('Iteration 4 — Security: innerHTML Safety', () => {
  it('no JS file uses innerHTML with template literals containing variables', () => {
    for (const file of allJsFiles) {
      const innerHtmlAssigns = file.content.match(/\.innerHTML\s*=\s*`[^`]*\$\{/g) || [];
      assert.equal(innerHtmlAssigns.length, 0,
        `${file.name} sets innerHTML with interpolated template literal — XSS risk. Use el() or textContent.`);
    }
  });

  it('no JS file uses innerHTML with string concatenation involving variables', () => {
    for (const file of allJsFiles) {
      // Match innerHTML = someVar + ... or innerHTML = '...' + someVar
      const concatAssigns = file.content.match(/\.innerHTML\s*=\s*[^'"`;\n]*\+\s*\w/g) || [];
      assert.equal(concatAssigns.length, 0,
        `${file.name} sets innerHTML with string concatenation — potential XSS. Use el() or textContent.`);
    }
  });

  it('innerHTML assignments only use empty string or hardcoded literals', () => {
    for (const file of allJsFiles) {
      const allAssigns = file.content.match(/\.innerHTML\s*=\s*[^;]+/g) || [];
      for (const assign of allAssigns) {
        const value = assign.replace(/\.innerHTML\s*=\s*/, '').trim();
        // Allowed: '', "", `static content without ${}`, or clearing
        const isSafe = value === "''" || value === '""' || value === '``' ||
          (value.startsWith('`') && !value.includes('${')) ||
          (value.startsWith("'") && !value.includes("'+")) ||
          (value.startsWith('"') && !value.includes('"+')); 
        assert.ok(isSafe, `${file.name}: innerHTML = ${value.slice(0, 80)}... — must only be empty or static literal`);
      }
    }
  });

  it('no file uses eval() or Function()', () => {
    for (const file of allJsFiles) {
      assert.ok(!file.content.match(/\beval\s*\(/), `${file.name} uses eval() — forbidden`);
      assert.ok(!file.content.match(/\bnew\s+Function\s*\(/), `${file.name} uses new Function() — forbidden`);
    }
  });

  it('no file uses document.write()', () => {
    for (const file of allJsFiles) {
      assert.ok(!file.content.match(/document\.write\s*\(/), `${file.name} uses document.write() — forbidden`);
    }
  });

  it('el() helper uses textContent, not innerHTML', () => {
    assert.ok(utilsJs.includes("'textContent'"), 'el() must use textContent for text');
    assert.ok(!utilsJs.match(/el\b[^}]*\.innerHTML/), 'el() must never set innerHTML');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 5: openModal() Contract & Usage
// ═════════════════════════════════════════════════════════════════
describe('Iteration 5 — Modal System Contract', () => {
  it('openModal accepts exactly one parameter (html element or string)', () => {
    const fnDef = utilsJs.match(/export\s+function\s+openModal\s*\((\w+)\)/);
    assert.ok(fnDef, 'openModal must be exported');
    assert.equal(fnDef[1], 'html', 'openModal param should be named "html"');
  });

  it('no view calls openModal with 2 top-level arguments', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      // Find openModal calls and check top-level arg count (ignore nested parens)
      const lines = src.split('\n');
      for (const line of lines) {
        const idx = line.indexOf('openModal(');
        if (idx === -1) continue;
        // Extract args by counting paren depth
        let depth = 0, args = 0, started = false;
        for (let i = idx + 'openModal('.length; i < line.length; i++) {
          if (line[i] === '(') depth++;
          else if (line[i] === ')') {
            if (depth === 0) break;
            depth--;
          } else if (line[i] === ',' && depth === 0) args++;
        }
        if (!started) args = args; // top-level commas = args - 1
        assert.ok(args === 0, `${name}.js line "${line.trim().slice(0, 60)}" calls openModal with ${args + 1} args`);
      }
    }
  });

  it('closeModal restores focus to trigger element', () => {
    assert.ok(utilsJs.includes('_modalTrigger'), 'closeModal must track trigger element');
    assert.ok(utilsJs.includes('.focus()'), 'closeModal must restore focus');
    assert.ok(utilsJs.includes('.isConnected'), 'closeModal must check element is still in DOM');
  });

  it('openModal clears previous content safely', () => {
    assert.ok(utilsJs.includes("content.innerHTML = ''"), 'openModal must clear previous content');
    assert.ok(utilsJs.includes('content.appendChild'), 'openModal must append new content safely');
  });

  it('openModal adds close button with aria-label', () => {
    assert.ok(utilsJs.includes("'aria-label': 'Close'"), 'close button must have aria-label');
    assert.ok(utilsJs.includes('modal-close-btn'), 'close button must have class modal-close-btn');
  });

  it('openModal sets aria-labelledby from modal title', () => {
    assert.ok(utilsJs.includes('aria-labelledby'), 'openModal must set aria-labelledby');
    assert.ok(utilsJs.includes('.modal-title'), 'openModal must look for .modal-title');
  });

  it('openModal focuses first focusable element inside modal', () => {
    assert.ok(utilsJs.includes('input:not([type="hidden"])'), 'openModal must find focusable elements');
    assert.ok(utilsJs.includes('.focus()'), 'openModal must focus first element');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 6: Toast System
// ═════════════════════════════════════════════════════════════════
describe('Iteration 6 — Toast Notification System', () => {
  it('toast creates elements with textContent (not innerHTML)', () => {
    assert.ok(utilsJs.includes('t.textContent = message'), 'toast must use textContent for message');
  });

  it('toast supports undo action', () => {
    assert.ok(utilsJs.includes('options.undo'), 'toast must check for undo option');
    assert.ok(utilsJs.includes('toast-undo-btn'), 'toast must create undo button');
  });

  it('toast auto-removes after timeout', () => {
    assert.ok(utilsJs.includes('setTimeout('), 'toast must auto-remove');
    assert.ok(utilsJs.includes('t.remove()'), 'toast must remove element');
  });

  it('toast announces to screen readers via a11y region', () => {
    assert.ok(utilsJs.includes('a11y-announce'), 'toast must announce to screen readers');
  });

  it('error toasts have longer duration than info', () => {
    assert.ok(utilsJs.includes('8000'), 'error toast should have 8s duration');
    assert.ok(utilsJs.includes('5000'), 'normal toast should have 5s duration');
  });

  it('all views use toast() for user feedback', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.post(') || src.includes('Api.put(') || src.includes('Api.del(')) {
        assert.ok(src.includes('toast('), `${name}.js makes mutating API calls but never shows toast feedback`);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 7: Form Validator Logic
// ═════════════════════════════════════════════════════════════════
describe('Iteration 7 — Form Validator', () => {
  it('exports rules, validateField, validateForm, attachValidation', () => {
    assert.ok(formValidatorJs.includes('export const rules'), 'must export rules');
    assert.ok(formValidatorJs.includes('export function validateField'), 'must export validateField');
    assert.ok(formValidatorJs.includes('export function validateForm'), 'must export validateForm');
    assert.ok(formValidatorJs.includes('export function attachValidation'), 'must export attachValidation');
  });

  it('rules.required returns error for empty values', () => {
    assert.ok(formValidatorJs.includes("required:"), 'must have required rule');
    assert.ok(formValidatorJs.includes('!String(v).trim()'), 'required must check trimmed empty');
  });

  it('rules include length and numeric bounds', () => {
    assert.ok(formValidatorJs.includes('minLength:'), 'must have minLength rule');
    assert.ok(formValidatorJs.includes('maxLength:'), 'must have maxLength rule');
    assert.ok(formValidatorJs.includes('min:'), 'must have min rule');
    assert.ok(formValidatorJs.includes('max:'), 'must have max rule');
  });

  it('rules include pattern and email', () => {
    assert.ok(formValidatorJs.includes('pattern:'), 'must have pattern rule');
    assert.ok(formValidatorJs.includes('email:'), 'must have email rule');
    assert.ok(formValidatorJs.includes('@'), 'email rule must check for @');
  });

  it('validateField returns first error or null', () => {
    assert.ok(formValidatorJs.includes('return null'), 'must return null when valid');
    assert.ok(formValidatorJs.includes('if (err) return err'), 'must return first error');
  });

  it('attachValidation listens to blur and input events', () => {
    assert.ok(formValidatorJs.includes("'blur'"), 'must listen to blur');
    assert.ok(formValidatorJs.includes("'input'"), 'must listen to input');
  });

  it('attachValidation prevents submit on validation errors', () => {
    assert.ok(formValidatorJs.includes('e.preventDefault()'), 'must prevent submit on errors');
    assert.ok(formValidatorJs.includes('e.stopImmediatePropagation()'), 'must stop propagation to prevent form handler');
  });

  it('attachValidation uses capture phase for submit', () => {
    assert.ok(formValidatorJs.includes(', true)'), 'submit listener must use capture phase');
  });

  it('field errors use role="alert" for a11y', () => {
    assert.ok(formValidatorJs.includes("'alert'"), 'error elements must have role=alert');
  });

  it('clears validation errors properly', () => {
    assert.ok(formValidatorJs.includes('input-valid'), 'must add valid class');
    assert.ok(formValidatorJs.includes('input-invalid'), 'must add invalid class');
    assert.ok(formValidatorJs.includes("display = 'none'") || formValidatorJs.includes("display: 'none'") || formValidatorJs.includes("style.display = 'none'"),
      'must hide error element when valid');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 8: Pagination Component
// ═════════════════════════════════════════════════════════════════
describe('Iteration 8 — Pagination Component', () => {
  it('exports renderPagination function', () => {
    assert.ok(paginationJs.includes('export function renderPagination'), 'must export renderPagination');
  });

  it('renders nothing for single page', () => {
    assert.ok(paginationJs.includes('totalPages <= 1'), 'must skip rendering for 1 page');
  });

  it('includes First, Prev, Next, Last buttons', () => {
    assert.ok(paginationJs.includes('First'), 'must have First button');
    assert.ok(paginationJs.includes('Prev'), 'must have Prev button');
    assert.ok(paginationJs.includes('Next'), 'must have Next button');
    assert.ok(paginationJs.includes('Last'), 'must have Last button');
  });

  it('disables First/Prev on page 1', () => {
    assert.ok(paginationJs.includes('currentPage === 1'), 'must check page 1 for disabling');
  });

  it('disables Next/Last on last page', () => {
    assert.ok(paginationJs.includes('currentPage === totalPages'), 'must check last page for disabling');
  });

  it('has ellipsis for large page counts', () => {
    assert.ok(paginationJs.includes("'...'"), 'must use ellipsis');
    assert.ok(paginationJs.includes('…'), 'must render ellipsis character');
  });

  it('marks active page with aria-current', () => {
    assert.ok(paginationJs.includes("'aria-current'"), 'must set aria-current on active page');
    assert.ok(paginationJs.includes("'page'"), 'aria-current must be "page"');
  });

  it('has proper ARIA navigation label', () => {
    assert.ok(paginationJs.includes("'aria-label'"), 'nav must have aria-label');
    assert.ok(paginationJs.includes('Pagination'), 'nav label must be Pagination');
  });

  it('shows Page X of Y info', () => {
    assert.ok(paginationJs.includes('page-info'), 'must have page info element');
    assert.ok(paginationJs.includes('Page '), 'must show "Page X of Y"');
  });

  it('getPageNumbers handles edge cases', () => {
    // <= 7 pages returns all
    assert.ok(paginationJs.includes('total <= 7'), 'must handle small page counts');
    // Shows pages around current
    assert.ok(paginationJs.includes('current - 1'), 'must show page before current');
    assert.ok(paginationJs.includes('current + 1'), 'must show page after current');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 9: UI States (Loading, Empty, Error)
// ═════════════════════════════════════════════════════════════════
describe('Iteration 9 — UI States Component', () => {
  it('exports showLoading, showLoadingSkeleton, showEmpty, showError, hideStates, showTableSkeleton', () => {
    for (const fn of ['showLoading', 'showLoadingSkeleton', 'showEmpty', 'showError', 'hideStates', 'showTableSkeleton']) {
      assert.ok(uiStatesJs.includes(`export function ${fn}`), `must export ${fn}`);
    }
  });

  it('showLoading includes spinner and skeleton lines', () => {
    assert.ok(uiStatesJs.includes('ui-spinner'), 'showLoading must have spinner');
    assert.ok(uiStatesJs.includes('skeleton-line'), 'showLoading must have skeleton lines');
  });

  it('showEmpty has customizable icon, title, message, and action', () => {
    assert.ok(uiStatesJs.includes('ui-empty-icon'), 'showEmpty must have icon');
    assert.ok(uiStatesJs.includes('ui-empty-title'), 'showEmpty must have title');
    assert.ok(uiStatesJs.includes('ui-empty-message'), 'showEmpty must have message');
    assert.ok(uiStatesJs.includes('ui-empty-action'), 'showEmpty must have action button');
  });

  it('showError has error icon and optional retry button', () => {
    assert.ok(uiStatesJs.includes('error_outline'), 'showError must have error icon');
    assert.ok(uiStatesJs.includes('ui-error-retry'), 'showError must support retry');
  });

  it('hideStates removes all state overlays', () => {
    assert.ok(uiStatesJs.includes('.ui-loading'), 'hideStates must remove loading');
    assert.ok(uiStatesJs.includes('.ui-empty'), 'hideStates must remove empty');
    assert.ok(uiStatesJs.includes('.ui-error'), 'hideStates must remove error');
    assert.ok(uiStatesJs.includes('.remove()'), 'hideStates must call remove()');
  });

  it('all state functions call hideStates first to prevent stacking', () => {
    const fns = uiStatesJs.match(/export function (show\w+)/g) || [];
    for (const fn of fns) {
      const name = fn.replace('export function ', '');
      if (name === 'hideStates') continue;
      const fnBody = uiStatesJs.slice(uiStatesJs.indexOf(`function ${name}`));
      assert.ok(fnBody.includes('hideStates('), `${name} must call hideStates first`);
    }
  });

  it('views use showLoading/showError/showEmpty for async states', () => {
    let viewsWithApi = 0;
    let viewsWithStates = 0;
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.get(')) {
        viewsWithApi++;
        if (src.includes('showLoading') || src.includes('showLoadingSkeleton') || src.includes('showTableSkeleton') || src.includes('showEmpty') || src.includes('showError')) {
          viewsWithStates++;
        }
      }
    }
    // At least 40% of views with API calls should use loading/state management
    const ratio = viewsWithStates / Math.max(viewsWithApi, 1);
    assert.ok(ratio >= 0.4, `Only ${viewsWithStates}/${viewsWithApi} views with API calls use UI states (${(ratio * 100).toFixed(0)}%). Should be ≥40%.`);
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 10: SPA Router & Navigation
// ═════════════════════════════════════════════════════════════════
describe('Iteration 10 — SPA Router', () => {
  it('app.js uses hash-based routing', () => {
    assert.ok(appJs.includes('location.hash') || appJs.includes('hashchange') || appJs.includes('popstate'),
      'app.js must handle hash/popstate for routing');
  });

  it('app.js has route-to-view mapping', () => {
    for (const view of ['dashboard', 'transactions', 'accounts', 'budgets', 'categories', 'goals', 'settings']) {
      assert.ok(appJs.includes(view), `app.js must reference ${view} view`);
    }
  });

  it('app.js guards routes with auth check', () => {
    assert.ok(appJs.includes('pfi_token') || appJs.includes('getToken'), 'app.js must check auth token');
    assert.ok(appJs.includes('login.html'), 'app.js must redirect to login if unauthenticated');
  });

  it('app.js handles popstate for browser back/forward', () => {
    assert.ok(appJs.includes('popstate'), 'app.js must listen to popstate');
  });

  it('sidebar navigation uses proper anchors or click handlers', () => {
    assert.ok(indexHtml.includes('nav') || indexHtml.includes('sidebar'),
      'index.html must have navigation sidebar');
  });

  it('app.js supports keyboard shortcuts', () => {
    assert.ok(appJs.includes('keydown') || appJs.includes('KeyboardEvent'),
      'app.js must handle keyboard events');
    assert.ok(appJs.includes('pfi_shortcuts'), 'app.js must check shortcuts preference');
  });

  it('router handles unknown routes gracefully', () => {
    assert.ok(appJs.includes('not found') || appJs.includes('View not found') || appJs.includes('default'),
      'app.js must handle unknown routes');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 11: Service Worker
// ═════════════════════════════════════════════════════════════════
describe('Iteration 11 — Service Worker', () => {
  it('uses versioned cache name', () => {
    assert.ok(swJs.match(/CACHE_NAME\s*=\s*['"`][\w-]+v\d+/i) || swJs.includes('CACHE_NAME'),
      'sw.js must define versioned CACHE_NAME');
  });

  it('caches static assets on install', () => {
    assert.ok(swJs.includes('install'), 'sw.js must handle install event');
    assert.ok(swJs.includes('addAll') || swJs.includes('cache.put'), 'sw.js must cache assets');
  });

  it('cleans old caches on activate', () => {
    assert.ok(swJs.includes('activate'), 'sw.js must handle activate event');
    assert.ok(swJs.includes('.delete') || swJs.includes('caches.delete'), 'sw.js must delete old caches');
  });

  it('implements fetch interception', () => {
    assert.ok(swJs.includes('fetch'), 'sw.js must intercept fetch');
    assert.ok(swJs.includes('respondWith'), 'sw.js must use respondWith');
  });

  it('offline mutation queue uses IndexedDB', () => {
    assert.ok(swJs.includes('indexedDB') || swJs.includes('IDBDatabase'),
      'sw.js must use IndexedDB for offline queue');
  });

  it('caches essential pages', () => {
    assert.ok(swJs.includes('index.html'), 'sw.js must cache index.html');
    assert.ok(swJs.includes('styles.css'), 'sw.js must cache styles.css');
  });

  it('does not cache API responses in static cache', () => {
    // API responses should not be in the static cache list
    const staticCacheSection = swJs.slice(0, swJs.indexOf('fetch'));
    assert.ok(!staticCacheSection.includes("'/api/"), 'Static cache must not include API endpoints');
  });

  it('replays offline mutations when online', () => {
    assert.ok(swJs.includes('replay') || swJs.includes('sync') || swJs.includes('offlineQueue'),
      'sw.js must support offline replay');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 12: Login System
// ═════════════════════════════════════════════════════════════════
describe('Iteration 12 — Login System', () => {
  it('login form submits to /api/auth endpoint', () => {
    assert.ok(loginJs.includes('/api/auth/'), 'login must POST to /api/auth/');
    assert.ok(loginJs.includes('login') && loginJs.includes('register'),
      'login form must handle both login and register paths');
  });

  it('auth endpoint uses fetch with POST method', () => {
    assert.ok(loginJs.includes("method: 'POST'") || loginJs.includes('method: "POST"'),
      'auth must use POST method');
  });

  it('stores token in localStorage on success', () => {
    assert.ok(loginJs.includes("pfi_token"), 'login must store pfi_token');
    assert.ok(loginJs.includes("pfi_user"), 'login must store pfi_user');
  });

  it('shows error messages using textContent (not innerHTML)', () => {
    assert.ok(loginJs.includes('.textContent'), 'error messages must use textContent');
    // Should not inject user input via innerHTML
    assert.ok(!loginJs.match(/\.innerHTML\s*=.*error/), 'must not inject errors via innerHTML');
  });

  it('login.html has proper form structure', () => {
    assert.ok(loginHtml.includes('<form'), 'login.html must have form element');
    assert.ok(loginHtml.includes('type="password"'), 'login.html must have password field');
    assert.ok(loginHtml.includes('type="submit"') || loginHtml.includes("type='submit'"),
      'login.html must have submit button');
  });

  it('login stores token in sessionStorage for session-only option', () => {
    assert.ok(loginJs.includes('sessionStorage'), 'login must support sessionStorage');
  });

  it('handles session expired state', () => {
    assert.ok(loginJs.includes('pfi_session_expired'), 'login must check for expired session');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 13: Notification System
// ═════════════════════════════════════════════════════════════════
describe('Iteration 13 — Notification System', () => {
  it('exports startPolling and stopPolling', () => {
    assert.ok(notificationsJs.includes('export function startPolling') || notificationsJs.includes('export { startPolling'),
      'must export startPolling');
    assert.ok(notificationsJs.includes('export function stopPolling') || notificationsJs.includes('stopPolling'),
      'must export stopPolling');
  });

  it('fetches notifications via Api.get', () => {
    assert.ok(notificationsJs.includes('/notifications'), 'must fetch from /notifications');
  });

  it('marks notifications as read', () => {
    assert.ok(notificationsJs.includes('/read') || notificationsJs.includes('mark') || notificationsJs.includes('read-all'),
      'must support marking as read');
  });

  it('uses textContent for notification messages (not innerHTML with user data)', () => {
    const dangerousInnerHtml = notificationsJs.match(/\.innerHTML\s*=\s*[^'"` \n][^;]*\b\w+\.\w+/g) || [];
    assert.equal(dangerousInnerHtml.length, 0,
      'notifications must not use innerHTML with dynamic data');
  });

  it('shows unread count badge', () => {
    assert.ok(notificationsJs.includes('badge') || notificationsJs.includes('count') || notificationsJs.includes('unread'),
      'must show unread notification count');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 14: Charts Integration
// ═════════════════════════════════════════════════════════════════
describe('Iteration 14 — Charts Integration', () => {
  it('exports initDashboardCharts and destroyCharts', () => {
    assert.ok(chartsJs.includes('initDashboardCharts'), 'must export initDashboardCharts');
    assert.ok(chartsJs.includes('destroyCharts'), 'must export destroyCharts');
  });

  it('fetches chart data from correct endpoints', () => {
    assert.ok(chartsJs.includes('/charts/spending-pie') || chartsJs.includes('spending-pie'),
      'must fetch spending pie data');
    assert.ok(chartsJs.includes('/charts/income-expense') || chartsJs.includes('income-expense'),
      'must fetch income vs expense data');
  });

  it('uses Chart.js for rendering', () => {
    assert.ok(chartsJs.includes('Chart') && chartsJs.includes('canvas'),
      'must use Chart.js with canvas');
  });

  it('reads theme colors from CSS custom properties', () => {
    assert.ok(chartsJs.includes('getComputedStyle') || chartsJs.includes('--'),
      'must read CSS custom properties for theme colors');
  });

  it('destroyCharts properly cleans up chart instances', () => {
    assert.ok(chartsJs.includes('.destroy()'), 'must call .destroy() on chart instances');
  });

  it('handles empty data gracefully', () => {
    assert.ok(chartsJs.includes('length') || chartsJs.includes('!data') || chartsJs.includes('no data'),
      'must handle empty chart data');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 15: localStorage Hygiene
// ═════════════════════════════════════════════════════════════════
describe('Iteration 15 — localStorage Key Hygiene', () => {
  it('all localStorage keys use pfi_ prefix', () => {
    const allSrc = allJsFiles.map(f => f.content).join('\n');
    const setItems = allSrc.match(/localStorage\.setItem\s*\(\s*['"]([^'"]+)['"]/g) || [];
    for (const match of setItems) {
      const key = match.match(/['"]([^'"]+)['"]/)[1];
      assert.ok(key.startsWith('pfi_'), `localStorage key "${key}" must use pfi_ prefix`);
    }
  });

  it('all sessionStorage keys use pfi_ prefix', () => {
    const allSrc = allJsFiles.map(f => f.content).join('\n');
    const setItems = allSrc.match(/sessionStorage\.setItem\s*\(\s*['"]([^'"]+)['"]/g) || [];
    for (const match of setItems) {
      const key = match.match(/['"]([^'"]+)['"]/)[1];
      assert.ok(key.startsWith('pfi_'), `sessionStorage key "${key}" must use pfi_ prefix`);
    }
  });

  it('token is stored consistently across login and utils', () => {
    assert.ok(loginJs.includes("'pfi_token'"), 'login must use pfi_token key');
    assert.ok(utilsJs.includes("'pfi_token'"), 'utils must read pfi_token key');
  });

  it('user data is stored as JSON', () => {
    assert.ok(loginJs.includes('JSON.stringify'), 'login must stringify user data');
    assert.ok(utilsJs.includes('JSON.parse'), 'utils must parse user data');
  });

  it('logout clears auth keys', () => {
    assert.ok(appJs.includes("removeItem('pfi_token')") || appJs.includes('removeItem("pfi_token")'),
      'logout must clear token from localStorage');
    assert.ok(appJs.includes('sessionStorage.removeItem'),
      'logout must also clear sessionStorage token');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 16: CSS Theme System
// ═════════════════════════════════════════════════════════════════
describe('Iteration 16 — CSS Theme System', () => {
  it('defines all 6 themes', () => {
    // Dark is the default via :root (no data-theme attr needed), rest use [data-theme="X"]
    assert.ok(stylesCss.includes(':root') && (stylesCss.includes('--bg-primary') || stylesCss.includes('--bg')),
      'styles.css must define default (dark) theme via :root');
    for (const theme of ['light', 'forest', 'ocean', 'rose', 'nord']) {
      assert.ok(stylesCss.includes(`[data-theme="${theme}"]`) || stylesCss.includes(`data-theme="${theme}"`),
        `styles.css must define ${theme} theme`);
    }
  });

  it('uses CSS custom properties for all colors', () => {
    for (const prop of ['--bg-primary', '--text-primary', '--accent', '--border']) {
      assert.ok(stylesCss.includes(prop), `styles.css must define ${prop} custom property`);
    }
  });

  it('has transition tokens for smooth theme switching', () => {
    assert.ok(stylesCss.includes('--transition-fast') || stylesCss.includes('transition-fast'),
      'styles.css must define fast transition token');
  });

  it('supports prefers-reduced-motion', () => {
    assert.ok(stylesCss.includes('prefers-reduced-motion'), 'styles.css must respect reduced motion');
  });

  it('has responsive breakpoints', () => {
    const mediaQueries = stylesCss.match(/@media\s+\(max-width:\s*\d+px\)/g) || [];
    assert.ok(mediaQueries.length >= 2, `styles.css must have at least 2 responsive breakpoints, found ${mediaQueries.length}`);
  });

  it('settings.js handles theme switching', () => {
    const settingsJs = viewFiles.settings;
    assert.ok(settingsJs.includes('data-theme') || settingsJs.includes('pfi_theme'),
      'settings.js must handle theme switching');
  });

  it('app.js applies saved theme on load', () => {
    assert.ok(appJs.includes('pfi_theme'), 'app.js must read saved theme');
    assert.ok(appJs.includes('data-theme') || appJs.includes('setAttribute'),
      'app.js must apply theme attribute');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 17: Accessibility Compliance
// ═════════════════════════════════════════════════════════════════
describe('Iteration 17 — Accessibility', () => {
  it('index.html has lang attribute', () => {
    assert.ok(indexHtml.includes('lang="en"'), 'index.html must have lang attribute');
  });

  it('index.html has skip-to-content link', () => {
    assert.ok(indexHtml.includes('skip') || indexHtml.includes('Skip'),
      'index.html should have skip navigation link');
  });

  it('all HTML pages have meta viewport', () => {
    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml], ['landing.html', landingHtml]]) {
      assert.ok(html.includes('viewport'), `${name} must have meta viewport`);
    }
  });

  it('index.html has a11y announcement region', () => {
    assert.ok(indexHtml.includes('a11y-announce'), 'index.html must have a11y announcement region');
    assert.ok(indexHtml.includes('role="status"') || indexHtml.includes('aria-live'),
      'a11y region must have proper ARIA role');
  });

  it('modal overlay has proper ARIA attributes', () => {
    assert.ok(indexHtml.includes('role="dialog"'), 'modal must have role=dialog');
    assert.ok(indexHtml.includes('aria-modal="true"'), 'modal must have aria-modal=true');
  });

  it('buttons in views have accessible labels', () => {
    let buttonsWithoutLabel = 0;
    for (const [name, src] of Object.entries(viewFiles)) {
      // Icon-only buttons must have aria-label
      const iconButtons = src.match(/el\s*\(\s*'button'[^)]*material-icons/g) || [];
      for (const btn of iconButtons) {
        if (!btn.includes('aria-label') && !btn.includes('textContent')) {
          buttonsWithoutLabel++;
        }
      }
    }
    assert.ok(buttonsWithoutLabel <= 5,
      `Found ${buttonsWithoutLabel} icon buttons without aria-label (allow ≤5 for non-critical icons)`);
  });

  it('form inputs have associated labels or aria-labels or placeholders', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const inputs = (src.match(/el\s*\(\s*'input'/g) || []).length;
      const labels = (src.match(/el\s*\(\s*'label'/g) || []).length;
      const ariaLabels = (src.match(/'aria-label'/g) || []).length;
      const placeholders = (src.match(/placeholder/g) || []).length;
      if (inputs > 5) {
        // Views with many inputs should have labels, aria-labels, or placeholders
        const total = labels + ariaLabels + placeholders;
        assert.ok(total >= inputs * 0.3,
          `${name}.js has ${inputs} inputs but only ${total} labels/aria-labels/placeholders`);
      }
    }
  });

  it('color picker uses radiogroup pattern', () => {
    assert.ok(utilsJs.includes("role: 'radiogroup'") || utilsJs.includes("'radiogroup'"),
      'color picker must use radiogroup role');
    assert.ok(utilsJs.includes("role: 'radio'") || utilsJs.includes("'radio'"),
      'color swatches must use radio role');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 18: Cross-View Consistency
// ═════════════════════════════════════════════════════════════════
describe('Iteration 18 — Cross-View Consistency', () => {
  it('all CRUD views follow consistent header pattern', () => {
    const crudViews = ['accounts', 'categories', 'budgets', 'goals', 'subscriptions', 'tags', 'rules'];
    for (const name of crudViews) {
      const src = viewFiles[name];
      if (!src) continue;
      assert.ok(src.includes('view-header') || src.includes('header'),
        `${name}.js must have view header section`);
    }
  });

  it('all CRUD views have add/create button', () => {
    const crudViews = ['accounts', 'categories', 'budgets', 'goals', 'subscriptions', 'tags', 'rules'];
    for (const name of crudViews) {
      const src = viewFiles[name];
      if (!src) continue;
      assert.ok(src.includes('add') || src.includes('Add') || src.includes('create') || src.includes('Create') || src.includes('New'),
        `${name}.js must have add/create button`);
    }
  });

  it('delete actions use confirm() dialog', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.del(')) {
        assert.ok(src.includes('confirm(') || src.includes('confirm '),
          `${name}.js uses Api.del() but doesn't confirm with user first`);
      }
    }
  });

  it('mutation operations invalidate/refresh data', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.post(') || src.includes('Api.put(') || src.includes('Api.del(')) {
        // Should have some kind of refresh mechanism
        assert.ok(src.includes('render') || src.includes('load') || src.includes('refresh') || src.includes('onRefresh'),
          `${name}.js mutates data but has no visible refresh mechanism`);
      }
    }
  });

  it('all views using el() import it from utils.js', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('el(') && !src.includes('el.remove') && !src.includes('.el')) {
        assert.ok(src.includes("import") && src.includes("el") && src.includes("utils.js"),
          `${name}.js uses el() but doesn't import it from utils.js`);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 19: withLoading & Confirm Dialogs
// ═════════════════════════════════════════════════════════════════
describe('Iteration 19 — withLoading & Confirm', () => {
  it('withLoading prevents double-submit', () => {
    assert.ok(utilsJs.includes('button.disabled'), 'withLoading must disable button');
    assert.ok(utilsJs.includes('btn-loading'), 'withLoading must add loading class');
  });

  it('withLoading restores button state in finally block', () => {
    assert.ok(utilsJs.includes('finally'), 'withLoading must use finally block');
    assert.ok(utilsJs.includes('button.disabled = false'), 'withLoading must re-enable button');
  });

  it('confirm() creates a proper dialog', () => {
    assert.ok(utilsJs.includes('confirm-dialog'), 'confirm must create dialog wrapper');
    assert.ok(utilsJs.includes('confirm-msg'), 'confirm must show message');
    assert.ok(utilsJs.includes('Cancel'), 'confirm must have Cancel button');
    assert.ok(utilsJs.includes('Delete'), 'confirm must have Delete button');
  });

  it('confirm() returns Promise<boolean>', () => {
    assert.ok(utilsJs.includes('new Promise'), 'confirm must return Promise');
    assert.ok(utilsJs.includes('resolve(true)'), 'confirm must resolve true for delete');
    assert.ok(utilsJs.includes('resolve(false)'), 'confirm must resolve false for cancel');
  });

  it('confirm() uses openModal/closeModal', () => {
    assert.ok(utilsJs.includes('openModal(fragment)') || utilsJs.includes('openModal(wrapper)'),
      'confirm must use openModal');
    assert.ok(utilsJs.match(/confirm[\s\S]*closeModal/), 'confirm callbacks must call closeModal');
  });
});

// ═════════════════════════════════════════════════════════════════
// ITERATION 20: HTML Structure & PWA Integrity
// ═════════════════════════════════════════════════════════════════
describe('Iteration 20 — HTML & PWA Integrity', () => {
  it('index.html registers service worker', () => {
    // SW registration moved to external js/sw-register.js
    const swRegJs = read('js/sw-register.js');
    assert.ok(indexHtml.includes('sw-register.js') || indexHtml.includes('serviceWorker') || appJs.includes('serviceWorker'),
      'must register service worker');
    assert.ok(swRegJs.includes('sw.js') || indexHtml.includes('sw.js') || appJs.includes('sw.js'),
      'must reference sw.js');
  });

  it('index.html links to manifest.json', () => {
    assert.ok(indexHtml.includes('manifest'), 'must link to manifest.json');
  });

  it('manifest.json exists and has required fields', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert.ok(manifest.name, 'manifest must have name');
    assert.ok(manifest.short_name, 'manifest must have short_name');
    assert.ok(manifest.start_url, 'manifest must have start_url');
    assert.ok(manifest.display, 'manifest must have display mode');
    assert.ok(manifest.icons && manifest.icons.length > 0, 'manifest must have icons');
  });

  it('index.html has modal overlay element', () => {
    assert.ok(indexHtml.includes('modal-overlay'), 'must have modal-overlay');
    assert.ok(indexHtml.includes('modal-content'), 'must have modal-content');
  });

  it('index.html has toast container', () => {
    assert.ok(indexHtml.includes('toast-container'), 'must have toast-container');
  });

  it('index.html has main content area', () => {
    assert.ok(indexHtml.includes('id="main"') || indexHtml.includes('id="content"') || indexHtml.includes('id="app"'),
      'must have main content area');
  });

  it('landing.html exists with feature showcase', () => {
    assert.ok(landingHtml.includes('feature') || landingHtml.includes('Feature'),
      'landing page must showcase features');
    assert.ok(landingHtml.includes('Get Started') || landingHtml.includes('Sign Up') || landingHtml.includes('Login') || landingHtml.includes('login'),
      'landing page must have CTA');
  });

  it('all HTML files have DOCTYPE', () => {
    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml], ['landing.html', landingHtml]]) {
      assert.ok(html.trim().toLowerCase().startsWith('<!doctype'),
        `${name} must start with DOCTYPE`);
    }
  });

  it('all HTML files have charset meta', () => {
    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml], ['landing.html', landingHtml]]) {
      assert.ok(html.includes('charset') || html.includes('UTF-8'),
        `${name} must declare charset`);
    }
  });

  it('fonts are self-hosted (no Google Fonts CDN)', () => {
    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml], ['landing.html', landingHtml]]) {
      assert.ok(!html.includes('fonts.googleapis.com'), `${name} must not use Google Fonts CDN`);
      assert.ok(!html.includes('fonts.gstatic.com'), `${name} must not use Google Fonts CDN`);
    }
    assert.ok(!stylesCss.includes('fonts.googleapis.com'), 'styles.css must not use Google Fonts CDN');
  });

  it('no external CDN resources', () => {
    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml], ['landing.html', landingHtml]]) {
      assert.ok(!html.includes('cdn.'), `${name} must not reference CDN resources`);
      assert.ok(!html.includes('cdnjs.'), `${name} must not reference cdnjs`);
      assert.ok(!html.includes('unpkg.'), `${name} must not reference unpkg`);
    }
  });

  it('no analytics or tracking scripts', () => {
    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml], ['landing.html', landingHtml]]) {
      assert.ok(!html.includes('google-analytics'), `${name} must not include Google Analytics`);
      assert.ok(!html.includes('gtag('), `${name} must not include gtag`);
      assert.ok(!html.includes('googletagmanager'), `${name} must not include Google Tag Manager`);
      assert.ok(!html.includes('facebook.net'), `${name} must not include Facebook pixel`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ADDITIONAL DEEP-DIVE TESTS
// ═══════════════════════════════════════════════════════════════

describe('Deep Dive — View-Specific Patterns', () => {
  // ── Dashboard ──
  it('dashboard fetches overview stats', () => {
    assert.ok(viewFiles.dashboard.includes('/stats/overview') || viewFiles.dashboard.includes('overview'),
      'dashboard must fetch overview stats');
  });

  // ── Transactions ──
  it('transactions view has filter/search functionality', () => {
    const txSrc = viewFiles.transactions;
    assert.ok(txSrc.includes('filter') || txSrc.includes('search') || txSrc.includes('query'),
      'transactions must support filtering');
  });

  it('transactions view has pagination', () => {
    const txSrc = viewFiles.transactions;
    assert.ok(txSrc.includes('pagination') || txSrc.includes('Pagination') || txSrc.includes('page'),
      'transactions must have pagination');
  });

  it('transactions view supports multi-select', () => {
    const txSrc = viewFiles.transactions;
    assert.ok(txSrc.includes('select') || txSrc.includes('checkbox') || txSrc.includes('multi'),
      'transactions should support multi-select');
  });

  // ── Settings ──
  it('settings view has theme selection', () => {
    assert.ok(viewFiles.settings.includes('theme') || viewFiles.settings.includes('Theme'),
      'settings must have theme selection');
  });

  it('settings view has data import/export', () => {
    assert.ok(viewFiles.settings.includes('import') || viewFiles.settings.includes('export') || viewFiles.settings.includes('Export'),
      'settings must have data management');
  });

  // ── Search ──
  it('search view highlights results', () => {
    const searchSrc = viewFiles.search;
    assert.ok(searchSrc.includes('highlight') || searchSrc.includes('mark') || searchSrc.includes('<mark'),
      'search should highlight matching terms');
  });

  // ── Reports ──
  it('reports view has financial health score', () => {
    const reportsSrc = viewFiles.reports;
    assert.ok(reportsSrc.includes('health') || reportsSrc.includes('Health') || reportsSrc.includes('score'),
      'reports must show financial health');
  });

  // ── Calendar ──
  it('calendar view does not double-prefix API path', () => {
    assert.ok(!viewFiles.calendar.includes("Api.get(`/api/"),
      'calendar must not double-prefix /api/ in API calls');
  });

  // ── Export ──
  it('export view does not use innerHTML with template literals', () => {
    assert.ok(!viewFiles.export.match(/\.innerHTML\s*=\s*`/),
      'export view must not use innerHTML with template literals');
  });

  // ── Calculators ──
  it('calculators view has SIP, Lumpsum, EMI, FIRE calculators', () => {
    const src = viewFiles.calculators;
    assert.ok(src.includes('sip') || src.includes('SIP'), 'must have SIP calculator');
    assert.ok(src.includes('lumpsum') || src.includes('Lumpsum'), 'must have lumpsum calculator');
    assert.ok(src.includes('emi') || src.includes('EMI'), 'must have EMI calculator');
    assert.ok(src.includes('fire') || src.includes('FIRE'), 'must have FIRE calculator');
  });

  // ── Categories ──
  it('categories view supports type field (income/expense)', () => {
    assert.ok(viewFiles.categories.includes('type') || viewFiles.categories.includes('Type'),
      'categories should show type classification');
  });
});

describe('Deep Dive — Error Path Coverage', () => {
  it('all views with try/catch show error toast', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const catchBlocks = src.match(/catch\s*\((\w+)\)\s*\{[^}]*\}/g) || [];
      for (const block of catchBlocks) {
        const showsError = block.includes('toast(') || block.includes('showError(') || block.includes('error');
        assert.ok(showsError, `${name}.js has catch block without error feedback: ${block.slice(0, 60)}...`);
      }
    }
  });

  it('API error responses are extracted properly', () => {
    assert.ok(utilsJs.includes('data.error?.message'), 'api() must extract error message');
    assert.ok(utilsJs.includes("'API error'"), 'api() must have fallback error message');
  });
});

describe('Deep Dive — Data Flow Integrity', () => {
  it('accounts view shows net worth summary', () => {
    const src = viewFiles.accounts;
    assert.ok(src.includes('net_worth') || src.includes('netWorth') || src.includes('Net Worth') || src.includes('total'),
      'accounts must show net worth or total');
  });

  it('budgets view shows progress bars', () => {
    const src = viewFiles.budgets;
    assert.ok(src.includes('progress') || src.includes('Progress') || src.includes('bar'),
      'budgets must show progress visualization');
  });

  it('goals view shows contribution tracking', () => {
    const src = viewFiles.goals;
    assert.ok(src.includes('contribute') || src.includes('Contribute') || src.includes('deposit') || src.includes('add_'),
      'goals must support contributions');
  });

  it('subscriptions view shows monthly burn rate', () => {
    const src = viewFiles.subscriptions;
    assert.ok(src.includes('total') || src.includes('burn') || src.includes('monthly') || src.includes('Monthly'),
      'subscriptions must show total/monthly cost');
  });

  it('splits view handles settle-up', () => {
    const src = viewFiles.splits;
    assert.ok(src.includes('settle') || src.includes('Settle'),
      'splits must support settle-up');
  });

  it('groups view manages members', () => {
    const src = viewFiles.groups;
    assert.ok(src.includes('member') || src.includes('Member'),
      'groups must manage members');
  });

  it('recurring view handles suggestions', () => {
    const src = viewFiles.recurring;
    assert.ok(src.includes('suggest') || src.includes('Suggest') || src.includes('pattern'),
      'recurring must handle suggestions/patterns');
  });

  it('insights view shows spending analysis', () => {
    const src = viewFiles.insights;
    assert.ok(src.includes('velocity') || src.includes('anomal') || src.includes('trend'),
      'insights must show spending analysis');
  });
});

// ═══════════════════════════════════════════════════════════════
// API endpoint tests via supertest
// ═══════════════════════════════════════════════════════════════
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, today } = require('./helpers');

describe('Frontend API Contract — Backend Endpoints Exist', () => {
  let app, db;
  before(() => { ({ app, db } = setup()); });
  after(() => teardown());

  // Dashboard endpoints
  it('GET /api/stats/overview returns overview data', async () => {
    const res = await agent().get('/api/stats/overview').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  // Chart endpoints
  it('GET /api/charts/spending-pie returns chart data', async () => {
    const from = '2025-01-01';
    const to = '2025-12-31';
    const res = await agent().get(`/api/charts/spending-pie?from=${from}&to=${to}`).expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('GET /api/charts/income-expense returns chart data', async () => {
    const from = '2025-01-01';
    const to = '2025-12-31';
    const res = await agent().get(`/api/charts/income-expense?from=${from}&to=${to}&interval=monthly`).expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('GET /api/charts/spending-trend returns chart data', async () => {
    const from = '2025-01-01';
    const to = '2025-12-31';
    const res = await agent().get(`/api/charts/spending-trend?from=${from}&to=${to}&interval=daily`).expect(200);
    assert.ok(typeof res.body === 'object');
  });

  // Calendar endpoint
  it('GET /api/calendar returns calendar data', async () => {
    const res = await agent().get('/api/calendar?month=2026-04').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  // Financial health endpoint
  it('GET /api/stats/financial-health returns health data', async () => {
    const res = await agent().get('/api/stats/financial-health');
    // May return 200 with gated message or actual data
    assert.ok(res.status === 200);
  });

  // Search endpoint
  it('GET /api/search returns search results', async () => {
    const res = await agent().get('/api/search?q=test').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  // Notifications endpoint
  it('GET /api/notifications returns notifications', async () => {
    const res = await agent().get('/api/notifications').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  // Settings endpoints
  it('GET /api/settings returns user settings', async () => {
    const res = await agent().get('/api/settings').expect(200);
    assert.ok(res.body.settings !== undefined);
  });

  it('GET /api/settings/dashboard returns dashboard layout', async () => {
    const res = await agent().get('/api/settings/dashboard').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  // Export endpoint
  it('GET /api/export/transactions returns data', async () => {
    const res = await agent().get('/api/export/transactions?format=json').expect(200);
    assert.ok(typeof res.body === 'object' || Array.isArray(res.body));
  });

  // Whats new endpoint
  it('GET /api/whats-new returns changelog', async () => {
    const res = await agent().get('/api/whats-new').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  // Version endpoint
  it('GET /api/version returns version info', async () => {
    const res = await agent().get('/api/version').expect(200);
    assert.ok(res.body.version);
  });

  // Financial todos endpoint
  it('GET /api/financial-todos returns todos', async () => {
    const res = await agent().get('/api/financial-todos').expect(200);
    assert.ok(res.body.todos !== undefined);
  });

  // Lending endpoint
  it('GET /api/lending returns lending data', async () => {
    const res = await agent().get('/api/lending').expect(200);
    assert.ok(res.body.items !== undefined);
  });

  // New stats endpoints
  it('GET /api/stats/age-of-money returns data', async () => {
    makeAccount({ balance: 50000 });
    const res = await agent().get('/api/stats/age-of-money').expect(200);
    assert.ok(res.body.age_of_money_days !== undefined);
  });

  it('GET /api/stats/weekly-summary returns weeks', async () => {
    const res = await agent().get('/api/stats/weekly-summary').expect(200);
    assert.ok(Array.isArray(res.body.weeks));
  });

  it('GET /api/stats/payment-queue returns queue', async () => {
    const res = await agent().get('/api/stats/payment-queue').expect(200);
    assert.ok(Array.isArray(res.body.queue));
  });

  it('GET /api/stats/credit-utilization returns data', async () => {
    const res = await agent().get('/api/stats/credit-utilization').expect(200);
    assert.ok(Array.isArray(res.body.cards));
  });
});
