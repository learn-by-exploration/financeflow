# FinanceFlow UX Implementation Plan — Frontend-Only Items

**Source**: [ux-review-panel-v2.md](ux-review-panel-v2.md) (55-expert panel, v0.4.1)
**Scope**: Pure frontend changes — CSS, HTML, vanilla JS. No backend API changes.
**Baseline**: Current codebase at v0.4.1

---

## Phase 1: Critical UX Fixes

### 1.1 Password Visibility Toggle + Requirements Display (Login Page)

**Review Source**: UI/UX Experts — Iteration 1, Item 1 (CRITICAL)
**Problem**: No show/hide password toggle. Requirements only shown as static text after toggling to Register mode — no real-time validation feedback as user types.

**Files to modify**:
- [public/login.html](../../../public/login.html) — Add eye icon button, update requirements list with per-rule status indicators
- [public/js/login.js](../../../public/js/login.js) — Toggle password visibility, real-time requirement checking on input
- [public/css/login.css](../../../public/css/login.css) — Style toggle button positioning, requirement check/cross states

**Changes**:

1. **login.html** (~15 lines added):
   - Wrap password input in a `.password-wrapper` div with `position: relative`
   - Add `<button type="button" class="password-toggle" aria-label="Show password">` with Material Icons `visibility` / `visibility_off` inside the wrapper
   - Change requirements `<li>` elements to include `data-rule` attributes (e.g., `data-rule="length"`, `data-rule="upper"`) and a status icon span

2. **login.js** (~40 lines added):
   - Add click handler on `.password-toggle` to toggle `input.type` between `password` and `text`, swap icon text between `visibility` and `visibility_off`
   - Add `input` event listener on `#password` that runs when `!isLogin`:
     - Check each rule: `/.{8,}/` (length), `/[A-Z]/` (upper), `/[a-z]/` (lower), `/[0-9]/` (number), `/[^a-zA-Z0-9]/` (special)
     - Toggle `.met` class on matching `li[data-rule]` elements
   - Update `aria-label` on toggle button to reflect current state

3. **login.css** (~25 lines added):
   - `.password-wrapper { position: relative; }`
   - `.password-toggle { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; }`
   - `.password-requirements li { list-style: none; position: relative; padding-left: 1.5rem; }` with `::before` pseudo-element showing ✗ (default) or ✓ (`.met`)
   - `.password-requirements li.met { color: var(--green); }` and `li.met::before { content: '✓'; color: var(--green); }`
   - `.password-requirements li::before { content: '✗'; color: var(--red); position: absolute; left: 0; }`

**Estimated LOC**: ~80

---

### 1.2 Sidebar Keyboard Navigation Fix (WCAG)

**Review Source**: UI/UX Experts — Iteration 8, Item 1 (CRITICAL)
**Problem**: Nav items are `<li>` with `tabindex="0"` and `role="button"` — keyboard Enter/Space handlers exist in app.js but are reported as inconsistent. Need to verify and ensure full keyboard accessibility.

**Files to modify**:
- [public/js/app.js](../../../public/js/app.js) — Verify Enter/Space handlers on `.nav-item[data-view]` elements

**Changes**:

1. **app.js** — The current code already has keydown handlers on `.nav-item[data-view]`:
   ```js
   el.addEventListener('keydown', (e) => {
     if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
   });
   ```
   Verify this is correctly applied. The sidebar footer buttons (`#btn-settings`, `#btn-logout`) are already `<button>` elements. The issue may be that `.nav-group-header` keyboard handlers need the same treatment — already present.

   **Additional fix**: Add `role="navigation"` awareness. Ensure `:focus-visible` styles are visible on active nav items (current `.nav-item.active` uses `background: var(--accent)` which may mask the focus ring).

2. **styles.css** (~5 lines):
   - `.nav-item:focus-visible { outline: 2px solid var(--accent-light); outline-offset: -2px; }` (use inset to avoid clipping by sidebar overflow)

**Estimated LOC**: ~10

---

### 1.3 Modal Focus Trap Fix (WCAG)

**Review Source**: UI/UX Experts — Iteration 8, Item 2 (CRITICAL)
**Problem**: Tab can escape modal to sidebar items behind the overlay. Focus should move to first focusable element on open, trap within modal, return focus to trigger on close.

**Files to modify**:
- [public/js/utils.js](../../../public/js/utils.js) — Enhance `openModal()` and `closeModal()` functions

**Changes**:

1. **utils.js** `openModal()` (~15 lines modified):
   - Save `document.activeElement` as `_modalTrigger` before opening
   - After content is inserted, focus the first focusable element inside `.modal-content` (input, button, select, textarea, `[tabindex]`)
   - Add `aria-modal="true"` and `role="dialog"` to `#modal-overlay`

2. **utils.js** `closeModal()` (~5 lines modified):
   - After closing, restore focus to `_modalTrigger` if it still exists in DOM

3. **app.js** modal Tab trap — already implemented:
   ```js
   if (e.key === 'Tab') { /* existing trap logic */ }
   ```
   The trap targets `#modal-overlay` focusable elements. Verify it correctly queries *within* `.modal-content` not the overlay background. If overlay itself is focusable, Tab could escape. Fix: scope query to `modalOverlay.querySelector('.modal-content').querySelectorAll(...)`.

**Estimated LOC**: ~25

---

### 1.4 Color Contrast Fixes (WCAG AA)

**Review Source**: UI/UX Experts — Iteration 8, Item 3 (HIGH)
**Problem**: `--text-muted: #8893a7` on `--bg-secondary: #1e293b` = 3.3:1 (fails). `--text-secondary: #94a3b8` on `--bg-primary: #0f172a` = 3.8:1 (fails). WCAG AA requires 4.5:1 for normal text.

**Files to modify**:
- [public/styles.css](../../../public/styles.css) — Update CSS custom property values in `:root`

**Changes**:

1. **styles.css** `:root` block (2 lines changed):
   - `--text-secondary: #94a3b8;` → `--text-secondary: #a0b0c4;` (achieves ~4.5:1 on `--bg-primary`)
   - `--text-muted: #8893a7;` → `--text-muted: #a5b0c2;` (achieves ~4.6:1 on `--bg-secondary`)

**Estimated LOC**: ~2

---

### 1.5 Button Loading States (Prevent Double-Submit)

**Review Source**: UI/UX Experts — Iteration 1, Item 4 (HIGH); QA — double-click creates duplicates

**Problem**: No loading spinner on buttons during API calls. Users can double-click Submit creating duplicate entries.

**Files to modify**:
- [public/js/utils.js](../../../public/js/utils.js) — Add `withLoading(button, asyncFn)` helper
- [public/styles.css](../../../public/styles.css) — Add `.btn-loading` styles
- [public/js/views/transactions.js](../../../public/js/views/transactions.js) — Apply to Save button
- [public/js/views/budgets.js](../../../public/js/views/budgets.js) — Apply to Save button
- [public/js/views/goals.js](../../../public/js/views/goals.js) — Apply to Save button
- [public/js/views/accounts.js](../../../public/js/views/accounts.js) — Apply to Save button
- [public/js/views/groups.js](../../../public/js/views/groups.js) — Apply to Save button
- [public/js/views/splits.js](../../../public/js/views/splits.js) — Apply to Save button
- [public/js/app.js](../../../public/js/app.js) — Apply to FAB quick-add Save button

**Changes**:

1. **utils.js** (~20 lines added):
   ```js
   export async function withLoading(button, asyncFn) {
     if (button.disabled) return;
     const original = button.textContent;
     button.disabled = true;
     button.classList.add('btn-loading');
     button.textContent = 'Saving...';
     try {
       await asyncFn();
     } finally {
       button.disabled = false;
       button.classList.remove('btn-loading');
       button.textContent = original;
     }
   }
   ```

2. **styles.css** (~10 lines added):
   ```css
   .btn-loading {
     opacity: 0.7;
     cursor: not-allowed;
     pointer-events: none;
     position: relative;
   }
   .btn-loading::after {
     content: '';
     width: 1rem; height: 1rem;
     border: 2px solid transparent;
     border-top-color: currentColor;
     border-radius: 50%;
     animation: spin 0.6s linear infinite;
     display: inline-block;
     margin-left: 0.5rem;
     vertical-align: middle;
   }
   @keyframes spin { to { transform: rotate(360deg); } }
   ```

3. **Each view file** (~3-5 lines each, 7 files):
   - Import `withLoading` from utils
   - Wrap the form submit handler's API call: `await withLoading(saveBtn, async () => { ... })`
   - Keep modal open on error (satisfies item 1.8 below)

**Estimated LOC**: ~65

---

### 1.6 Browser Back/Forward Support (history.pushState)

**Review Source**: UI/UX Experts — Iteration 4, Item 3 (HIGH)
**Problem**: SPA has no URL-based routing. Browser back/forward buttons don't work. All navigation is lost on refresh.

**Files to modify**:
- [public/js/app.js](../../../public/js/app.js) — Add pushState on navigation, popstate listener, initial route parse

**Changes**:

1. **app.js** (~35 lines added/modified):
   - Create `navigateTo(view)` function replacing inline nav click logic:
     ```js
     function navigateTo(view, pushHistory = true) {
       currentView = view;
       document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
       const activeNav = document.querySelector(`.nav-item[data-view="${view}"]`);
       if (activeNav) activeNav.classList.add('active');
       sidebar.classList.remove('open');
       backdrop.classList.remove('active');
       if (pushHistory) history.pushState({ view }, '', `/#/${view}`);
       render();
     }
     ```
   - Update nav-item click handlers to call `navigateTo(el.dataset.view)`
   - Add `popstate` listener:
     ```js
     window.addEventListener('popstate', (e) => {
       if (e.state && e.state.view) navigateTo(e.state.view, false);
     });
     ```
   - On initial load, parse `location.hash` to determine starting view:
     ```js
     const hashView = location.hash.replace('#/', '');
     if (hashView && views[hashView]) currentView = hashView;
     history.replaceState({ view: currentView }, '', `/#/${currentView}`);
     ```
   - Update keyboard shortcut nav calls and onboarding step clicks to use `navigateTo()`

**Estimated LOC**: ~35

---

### 1.7 Form Data Preserved on Server Error

**Review Source**: UI/UX Experts — Iteration 12, Item 1 (HIGH)
**Problem**: After a server-side validation error, modal closes and user loses all form data.

**Files to modify**:
- [public/js/views/transactions.js](../../../public/js/views/transactions.js) — Keep modal open on API error
- [public/js/views/budgets.js](../../../public/js/views/budgets.js) — Same
- [public/js/views/goals.js](../../../public/js/views/goals.js) — Same
- [public/js/views/accounts.js](../../../public/js/views/accounts.js) — Same
- [public/js/views/groups.js](../../../public/js/views/groups.js) — Same
- [public/js/views/splits.js](../../../public/js/views/splits.js) — Same

**Changes**:

In each view's form submit handler, the current pattern is:
```js
try {
  await Api.post('/...', body);
  closeModal();
  toast('Saved!', 'success');
  onRefresh();
} catch (err) {
  toast(err.message, 'error');
}
```

Change to: **Don't close modal on error. Show error inline in the modal.**

```js
try {
  await Api.post('/...', body);
  closeModal();
  toast('Saved!', 'success');
  onRefresh();
} catch (err) {
  // Show error inside modal, keep form data intact
  let errDiv = form.querySelector('.modal-error');
  if (!errDiv) {
    errDiv = el('div', { className: 'modal-error' });
    form.prepend(errDiv);
  }
  errDiv.textContent = err.message;
}
```

**styles.css** (~5 lines):
```css
.modal-error {
  background: var(--red-bg);
  color: var(--red);
  padding: 0.625rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  margin-bottom: 0.5rem;
}
```

**Estimated LOC**: ~40 (across 6 view files + CSS)

---

### 1.8 Offline Indicator Banner

**Review Source**: UI/UX Experts — Iteration 12, Item 2 (HIGH)
**Problem**: When API calls fail with network errors, user sees generic error. No distinction between offline and server error.

**Files to modify**:
- [public/index.html](../../../public/index.html) — Add offline banner element
- [public/js/app.js](../../../public/js/app.js) — Listen for online/offline events
- [public/styles.css](../../../public/styles.css) — Style offline banner

**Changes**:

1. **index.html** (~3 lines): Add after `#demo-banner`:
   ```html
   <div id="offline-banner" class="offline-banner" style="display:none;">
     <span class="material-icons-round">cloud_off</span>
     <span>You're offline. Changes will not be saved.</span>
   </div>
   ```

2. **app.js** (~10 lines):
   ```js
   const offlineBanner = document.getElementById('offline-banner');
   window.addEventListener('offline', () => { offlineBanner.style.display = 'flex'; });
   window.addEventListener('online', () => { offlineBanner.style.display = 'none'; });
   if (!navigator.onLine) offlineBanner.style.display = 'flex';
   ```

3. **styles.css** (~8 lines):
   ```css
   .offline-banner {
     display: flex;
     align-items: center;
     gap: 0.5rem;
     padding: 0.625rem 1rem;
     background: var(--red-bg);
     border: 1px solid var(--red);
     border-radius: var(--radius-sm);
     color: var(--red);
     font-size: 0.875rem;
     margin-bottom: 1rem;
   }
   ```

**Estimated LOC**: ~21

---

## Phase 2: High-Impact Quick Wins (S Effort)

### 2.1 Clickable Stat Cards + Trend Arrows on Dashboard

**Review Source**: UI/UX Experts — Iteration 3 (HIGH, S effort); PM — Iteration 3

**Problem**: Stat cards show numbers with no context (no comparison to last month). Cards aren't clickable — should navigate to relevant filtered views.

**Files to modify**:
- [public/js/views/dashboard.js](../../../public/js/views/dashboard.js) — Make stat cards clickable, add trend indicators
- [public/styles.css](../../../public/styles.css) — Clickable card styles, trend arrow styles

**Changes**:

1. **dashboard.js** `statCard()` function (~20 lines modified):
   - Add `cursor: pointer` and `onClick` to each card navigating to the relevant view:
     - Net Worth → `navigateTo('accounts')`
     - Income → `navigateTo('transactions')` (filtered by type=income, but since filter state isn't shared, just navigate)
     - Expenses → `navigateTo('transactions')`
     - Savings → `navigateTo('budgets')`
   - Accept `trend` parameter (percentage change vs last month). The `/api/stats/overview` already returns `month_income`, `month_expense`, `month_savings`. We need the previous month's values — but if the API doesn't provide them, we can skip the trend data and just add the clickable behavior. **If API already returns prev-month data**: render `↑12%` or `↓8%` badge. **If not**: make cards clickable only (no trend arrows — that requires backend).

   **Frontend-only implementation** (no API change): Make stat cards clickable with visual affordance.
   ```js
   function statCard(label, value, color, onClick) {
     return el('div', { className: `stat-card ${color}`, style: 'cursor:pointer', onClick }, [
       el('div', { className: 'stat-label', textContent: label }),
       el('div', { className: 'stat-value', textContent: value }),
     ]);
   }
   ```

2. **styles.css** (~5 lines):
   ```css
   .stat-card[style*="cursor:pointer"]:hover,
   .stat-card.clickable:hover {
     border-color: var(--accent);
     transform: translateY(-1px);
     transition: all 0.15s;
   }
   ```

**Estimated LOC**: ~25

---

### 2.2 Sortable Table Columns (Transactions)

**Review Source**: UI/UX Experts — Iteration 2, Item 2 (HIGH, S effort)
**Problem**: Table column headers (Date, Amount, Category) aren't sortable. Users expect click-to-sort.

**Files to modify**:
- [public/js/views/transactions.js](../../../public/js/views/transactions.js) — Add sort state, sortable header click handlers, sort indicators
- [public/styles.css](../../../public/styles.css) — Sortable header styles

**Changes**:

1. **transactions.js** (~30 lines added):
   - Add `state.sort = { field: 'date', dir: 'desc' }` to state
   - Make table headers clickable:
     ```js
     function sortableHeader(label, field) {
       const arrow = state.sort.field === field ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
       return el('th', {
         textContent: label + arrow,
         style: 'cursor:pointer',
         onClick: () => {
           if (state.sort.field === field) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
           else { state.sort.field = field; state.sort.dir = 'asc'; }
           loadPage(state.page);
         },
       });
     }
     ```
   - Include `sort` and `order` in the API query params sent to `loadPage()`:
     ```js
     params.set('sort', state.sort.field);
     params.set('order', state.sort.dir);
     ```
     Note: This requires the backend `/api/transactions` to support `sort` and `order` params. **Check if backend supports this already** — if not, implement client-side sort of the current page's data.
   - **Client-side fallback** (~10 lines): Sort `state.transactions` array before rendering instead of sending to API.

2. **styles.css** (~5 lines):
   ```css
   .data-table th[style*="cursor:pointer"]:hover {
     color: var(--text-primary);
     background: rgba(255,255,255,0.03);
   }
   ```

**Estimated LOC**: ~35

---

### 2.3 Date Range Presets in Transaction Filters

**Review Source**: UI/UX Experts — Iteration 2, Item 3 (MEDIUM, S effort)
**Problem**: Date range filter has no presets. Users must manually pick start/end dates.

**Files to modify**:
- [public/js/views/transactions.js](../../../public/js/views/transactions.js) — Add preset dropdown/buttons before date inputs

**Changes**:

1. **transactions.js** `buildFilterBar()` (~25 lines added):
   - Add a `<select>` with preset options before the date inputs:
     ```js
     const presets = el('select', { className: 'filter-select' });
     [
       { value: '', label: 'Date Range' },
       { value: 'this-month', label: 'This Month' },
       { value: 'last-month', label: 'Last Month' },
       { value: 'last-90', label: 'Last 90 Days' },
       { value: 'this-year', label: 'This Year' },
       { value: 'custom', label: 'Custom...' },
     ].forEach(o => presets.appendChild(el('option', { value: o.value, textContent: o.label })));
     ```
   - On change, calculate dates:
     ```js
     presets.addEventListener('change', () => {
       const today = new Date();
       let fromDate, toDate;
       switch (presets.value) {
         case 'this-month':
           fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
           toDate = today;
           break;
         case 'last-month':
           fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
           toDate = new Date(today.getFullYear(), today.getMonth(), 0);
           break;
         // ... etc
       }
       from.value = fromDate?.toISOString().slice(0, 10) || '';
       to.value = toDate?.toISOString().slice(0, 10) || '';
       state.filters.from = from.value;
       state.filters.to = to.value;
       loadPage(0);
     });
     ```
   - Show/hide date inputs: hide when preset is not `custom`, show when it is.

**Estimated LOC**: ~40

---

### 2.4 Duplicate Transaction Detection (Client-Side)

**Review Source**: PM — Iteration 2, QA (HIGH, S effort)
**Problem**: Users can accidentally create duplicate transactions. No warning before save.

**Files to modify**:
- [public/js/views/transactions.js](../../../public/js/views/transactions.js) — Before saving, check for duplicates

**Changes**:

1. **transactions.js** form submit handler (~20 lines added):
   - Before the API call, search `state.transactions` for entries matching same amount ± same date ± similar description:
     ```js
     const possibleDup = state.transactions.find(t =>
       Math.abs(t.amount) === Math.abs(Number(body.amount)) &&
       t.date === body.date &&
       t.description.toLowerCase().includes(body.description.toLowerCase().slice(0, 10))
     );
     if (possibleDup) {
       const proceed = await confirm(
         `Possible duplicate: "${possibleDup.description}" for ${fmt(possibleDup.amount)} on ${possibleDup.date}. Save anyway?`
       );
       if (!proceed) return;
     }
     ```
   - This is a best-effort client-side check using the currently loaded page of transactions. Not exhaustive but catches obvious duplicates.

**Estimated LOC**: ~20

---

### 2.5 Skeleton Loaders on ALL View Transitions

**Review Source**: UI/UX — Iteration 14 (HIGH, S effort)
**Problem**: Some views show blank space during loading. Only dashboard has skeleton loaders.

**Files to modify**:
- [public/js/ui-states.js](../../../public/js/ui-states.js) — Already has `showLoading()` with skeleton. Verify all views use it.
- [public/js/views/transactions.js](../../../public/js/views/transactions.js) — Already calls `showLoading(container)` ✓
- [public/js/views/budgets.js](../../../public/js/views/budgets.js) — Already calls `showLoading(container)` ✓
- [public/js/views/goals.js](../../../public/js/views/goals.js) — Check
- [public/js/views/reports.js](../../../public/js/views/reports.js) — Check
- [public/js/views/insights.js](../../../public/js/views/insights.js) — Check
- All other view files — audit

**Changes**:

1. Audit each view's `render*` function. Ensure every view starts with:
   ```js
   container.innerHTML = '';
   showLoading(container);
   ```
   before the first `await` API call, and calls `hideStates(container)` after data is loaded.

2. Any view missing this pattern gets ~3 lines added.

**Estimated LOC**: ~15 (across views missing the pattern)

---

## Phase 3: Polish & CSS/JS Quick Wins

### 3.1 Login Page Tagline Update

**Review Source**: Marketing — Iteration 1, Item 1 (QUICK)
**Problem**: Login page says "Sign in to manage your finances" — generic. The tagline "Your money. Your server. Your rules." exists in docs but isn't displayed.

**Files to modify**:
- [public/login.html](../../../public/login.html) — Change subtitle text
- [public/js/login.js](../../../public/js/login.js) — Update toggle text for register mode

**Changes**:

1. **login.html** (1 line):
   - `<p id="auth-subtitle">Sign in to manage your finances</p>` → `<p id="auth-subtitle">Your money. Your server. Your rules.</p>`

2. **login.js** (1 line):
   - In toggle handler, change the login subtitle from generic text:
   - `subtitle.textContent = isLogin ? 'Your money. Your server. Your rules.' : 'Create your account';`

**Estimated LOC**: ~2

---

### 3.2 Modal Header with Title + X Close Button

**Review Source**: UI/UX Experts — Iteration 7, Item 1 (HIGH, S effort)
**Problem**: No close button (X) in modal header. No title bar. Users look top-right for close.

**Files to modify**:
- [public/js/utils.js](../../../public/js/utils.js) — Modify `openModal()` to wrap content with header
- [public/styles.css](../../../public/styles.css) — Modal header styles

**Changes**:

1. **utils.js** `openModal()` (~10 lines modified):
   - Wrap injected content. Detect the `.modal-title` element inside the content (already used by views) and move it into a header bar with an X button:
     ```js
     export function openModal(html) {
       const content = document.getElementById('modal-content');
       if (typeof html === 'string') {
         content.innerHTML = html;
       } else {
         content.innerHTML = '';
         content.appendChild(html);
       }
       // Add close (X) button if not already present
       if (!content.querySelector('.modal-close-btn')) {
         const closeBtn = el('button', {
           className: 'modal-close-btn btn-icon',
           'aria-label': 'Close',
           onClick: closeModal,
         }, [el('span', { className: 'material-icons-round', textContent: 'close' })]);
         content.prepend(closeBtn);
       }
       // ... existing open logic
     }
     ```

2. **styles.css** (~10 lines):
   ```css
   .modal-close-btn {
     position: absolute;
     top: 0.75rem;
     right: 0.75rem;
     z-index: 1;
   }
   .modal-content {
     position: relative; /* already set or add */
   }
   ```

**Estimated LOC**: ~20

---

### 3.3 Chart Accessibility (aria-labels)

**Review Source**: UI/UX Experts — Iteration 8, Item 4 (HIGH, S effort)
**Problem**: Charts have no alt text or accessible descriptions. Screen readers see nothing.

**Files to modify**:
- [public/js/views/dashboard.js](../../../public/js/views/dashboard.js) — Add `aria-label` to chart containers with text data summary
- [public/js/charts.js](../../../public/js/charts.js) — After chart renders, generate and set text summary

**Changes**:

1. **dashboard.js** `chartCard()` (~5 lines):
   - Add `role="img"` and a dynamic `aria-label` to the `.chart-wrapper` div:
     ```js
     function chartCard(title, canvasId) {
       const canvas = el('canvas', { id: canvasId });
       const wrapper = el('div', { className: 'chart-wrapper', role: 'img', 'aria-label': `${title} chart. Data loading.` }, [canvas]);
       return el('div', { className: 'card chart-card' }, [
         el('h3', { textContent: title }),
         wrapper,
       ]);
     }
     ```

2. **charts.js** — After each chart is initialized with data (~15 lines):
   - Generate a text summary, e.g., for spending by category: `"Spending by Category this month: Food ₹8,000 (25%), Transport ₹5,000 (15%), ..."`
   - Set it as `aria-label` on the parent `.chart-wrapper`

**Estimated LOC**: ~20

---

### 3.4 Progress Bar ARIA Attributes

**Review Source**: UI/UX Experts — Iteration 8, Item 5 (MEDIUM, S effort)
**Problem**: Budget and goal progress bars have no `role="progressbar"` or `aria-valuenow/aria-valuemax`.

**Files to modify**:
- [public/js/views/budgets.js](../../../public/js/views/budgets.js) — Add ARIA to progress bars
- [public/js/views/goals.js](../../../public/js/views/goals.js) — Add ARIA to progress bars

**Changes**:

1. **budgets.js** `progressBar()` function (~3 lines added):
   ```js
   function progressBar(pct, color) {
     const bar = el('div', { className: 'progress-bar', role: 'progressbar',
       'aria-valuenow': String(Math.min(pct, 100)),
       'aria-valuemin': '0', 'aria-valuemax': '100',
       'aria-label': `${pct}% of budget used`,
     });
     const fill = el('div', { className: 'progress-fill' });
     fill.style.width = `${Math.min(pct, 100)}%`;
     fill.style.background = color;
     bar.appendChild(fill);
     return bar;
   }
   ```

2. **goals.js** — Same pattern for goal progress bars.

**Estimated LOC**: ~15

---

### 3.5 Active Nav Item Stronger Visual Indicator

**Review Source**: UI/UX Experts — Iteration 4 (MEDIUM, S effort)
**Problem**: Active state is just a background color change. No left-border indicator.

**Files to modify**:
- [public/styles.css](../../../public/styles.css) — Enhance `.nav-item.active`

**Changes**:

```css
.nav-item.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  position: relative;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.25rem;
  bottom: 0.25rem;
  width: 3px;
  background: #fff;
  border-radius: 0 2px 2px 0;
}
```

**Estimated LOC**: ~10

---

### 3.6 View Transition Animation (Fade-In)

**Review Source**: UI/UX Experts — Iteration 4, Item 5 (MEDIUM, S effort)
**Problem**: View switch is instant (innerHTML replacement) — no animation. Content "jumps."

**Files to modify**:
- [public/styles.css](../../../public/styles.css) — Add fade-in animation to view container

**Changes**:

```css
#view-container {
  animation: viewFadeIn 0.15s ease;
}
@keyframes viewFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
```

To trigger on each render, the `render()` function in app.js needs to toggle a class or re-trigger the animation. Simplest approach:

**app.js** (~3 lines in `render()`):
```js
container.style.animation = 'none';
container.offsetHeight; // trigger reflow
container.style.animation = '';
```

**Estimated LOC**: ~10

---

### 3.7 Ctrl+K / `/` Search Shortcut

**Review Source**: UI/UX Experts — Iteration 4, Item 4 (MEDIUM, S effort)
**Problem**: No keyboard shortcut for search focus. Standard pattern is Ctrl+K or `/`.

**Files to modify**:
- [public/js/app.js](../../../public/js/app.js) — Add keyboard shortcut handler

**Changes**:

In the existing `keydown` listener (~8 lines added):
```js
// Ctrl+K or / to focus search (when not in input/textarea)
if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) &&
    !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
  e.preventDefault();
  const searchInput = document.getElementById('global-search');
  if (searchInput) searchInput.focus();
}
```

**Estimated LOC**: ~8

---

### 3.8 Stat Card Visual Hierarchy (Larger Numbers)

**Review Source**: UI/UX Experts — Iteration 3, Item 4 (MEDIUM, S effort)
**Problem**: Stat card numbers and labels have similar visual weight. The number should be much larger/bolder. Financial amounts should use tabular figures for alignment.

**Files to modify**:
- [public/styles.css](../../../public/styles.css) — Update `.stat-value` and `.stat-label` styles

**Changes**:

```css
.stat-label {
  font-size: 0.6875rem;  /* smaller */
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.375rem;
}
.stat-value {
  font-size: 1.75rem;  /* up from 1.5rem */
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
```

Also apply `tabular-nums` globally to financial amounts:
```css
.amount, .txn-amount, .account-card-balance .stat-value,
.budget-pct, .search-result-amount, .anomaly-amount {
  font-variant-numeric: tabular-nums;
}
```

**Estimated LOC**: ~12

---

### 3.9 Navigation Race Condition (AbortController)

**Review Source**: QA — Iteration 12 (HIGH, M effort)
**Problem**: Rapid navigation between views during loading can cause stale data rendering.

**Files to modify**:
- [public/js/app.js](../../../public/js/app.js) — Add AbortController to render cycle
- [public/js/utils.js](../../../public/js/utils.js) — Support abort signal in API helper

**Changes**:

1. **app.js** (~10 lines):
   ```js
   let renderAbort = null;

   async function render() {
     if (renderAbort) renderAbort.abort();
     renderAbort = new AbortController();
     const signal = renderAbort.signal;
     // ... existing render logic ...
     // After render completes or on catch, check signal.aborted
     try {
       // ... existing ...
       if (signal.aborted) return; // discard stale render
       // ... render content ...
     } catch (err) {
       if (signal.aborted) return;
       // ... error handling ...
     }
   }
   ```

2. **utils.js** `api()` (~3 lines): Accept optional `signal` parameter:
   ```js
   export async function api(path, options = {}) {
     // ... existing ...
     const res = await fetch(`/api${path}`, { ...options, headers, signal: options.signal });
     // ...
   }
   ```

**Estimated LOC**: ~20

---

### 3.10 Contextual Financial Tips in Empty States

**Review Source**: Personal Finance Experts — Iteration 1, Item 2 (HIGH, S effort)
**Problem**: Empty states show generic "No data yet" messages. Should include educational tips.

**Files to modify**:
- [public/js/views/transactions.js](../../../public/js/views/transactions.js) — Update empty state message
- [public/js/views/budgets.js](../../../public/js/views/budgets.js) — Update empty state message
- [public/js/views/goals.js](../../../public/js/views/goals.js) — Update empty state message
- [public/js/views/accounts.js](../../../public/js/views/accounts.js) — Update empty state message

**Changes**:

Replace generic empty state messages with contextual tips. Examples:

- **Transactions**: `"Track every expense for 30 days to discover where your money really goes. Most people are surprised by their subscription and dining spending."`
- **Budgets**: `"The 50/30/20 rule recommends: 50% needs, 30% wants, 20% savings. Create a budget to see how you're doing."`
- **Goals**: `"Financial experts recommend building an emergency fund covering 3-6 months of expenses as your first goal."`
- **Accounts**: `"Add your bank accounts, credit cards, and wallets to see your complete financial picture in one place."`

Each is a 1-line `message` string change in the `showEmpty()` call.

**Estimated LOC**: ~12

---

### 3.11 Link Recommendations to Actions (Insights/Health View)

**Review Source**: Personal Finance Experts — Iteration 9, Item 1 (HIGH, S effort)
**Problem**: Health/Insights views show recommendations like "Build emergency fund" but no links to take action.

**Files to modify**:
- [public/js/views/reports.js](../../../public/js/views/reports.js) — Add clickable CTAs to recommendations in Financial Health view

**Changes**:

In the health view's recommendation rendering, convert text recommendations to clickable links:
```js
function recItem(text, actionView) {
  const item = el('div', { className: 'rec-item' }, [
    el('span', { className: 'material-icons-round', textContent: 'lightbulb' }),
    el('span', { textContent: text }),
  ]);
  if (actionView) {
    item.appendChild(el('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: 'Take Action →',
      onClick: () => navigateTo(actionView),
    }));
    item.style.cursor = 'pointer';
  }
  return item;
}
```

Map recommendations to views: "emergency fund" → `goals`, "budget" → `budgets`, "reduce spending" → `transactions`.

**Estimated LOC**: ~20

---

### 3.12 Sidebar Collapsible Groups — localStorage Persistence

**Review Source**: UI/UX Experts — Iteration 1 (already partially implemented)
**Problem**: Nav groups collapse/expand but state isn't saved to localStorage. On page reload, all groups re-expand.

**Files to modify**:
- [public/js/app.js](../../../public/js/app.js) — Save/restore collapsed group state

**Changes**:

The collapse/expand toggle already exists. Add persistence:

```js
// On group header click (modify existing handler):
header.addEventListener('click', () => {
  header.parentElement.classList.toggle('collapsed');
  const expanded = !header.parentElement.classList.contains('collapsed');
  header.setAttribute('aria-expanded', String(expanded));
  // Persist state
  const states = JSON.parse(localStorage.getItem('pfi_nav_groups') || '{}');
  states[header.parentElement.dataset.group] = expanded;
  localStorage.setItem('pfi_nav_groups', JSON.stringify(states));
});

// On init — restore states:
const savedGroups = JSON.parse(localStorage.getItem('pfi_nav_groups') || '{}');
document.querySelectorAll('.nav-group').forEach(group => {
  const key = group.dataset.group;
  if (savedGroups[key] === false) {
    group.classList.add('collapsed');
    group.querySelector('.nav-group-header')?.setAttribute('aria-expanded', 'false');
  }
});
```

**Estimated LOC**: ~15

---

### 3.13 Toast Duration Extension (3s → 5s)

**Review Source**: UI/UX Experts — Iteration 8, Item 6 (MEDIUM)
**Problem**: Toasts disappear after 3s — too fast for screen readers and users who might miss them.

**Files to modify**:
- [public/js/utils.js](../../../public/js/utils.js) — Change timeout from 3000 to 5000

**Changes**:

```js
setTimeout(() => el.remove(), 5000); // was 3000
```

Also make error toasts persist until clicked:
```js
if (type === 'error') {
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => el.remove());
} else {
  setTimeout(() => el.remove(), 5000);
}
```

**Estimated LOC**: ~6

---

### 3.14 Session Expiry Message

**Review Source**: UI/UX — Iteration 12, Item 3 (MEDIUM, S effort)
**Problem**: When session expires, user is silently redirected to login page with no explanation.

**Files to modify**:
- [public/js/utils.js](../../../public/js/utils.js) — Set a flag before redirect on 401
- [public/js/login.js](../../../public/js/login.js) — Check flag and show message

**Changes**:

1. **utils.js** `api()` function (1 line):
   ```js
   if (res.status === 401) {
     localStorage.setItem('pfi_session_expired', '1'); // add this line
     localStorage.removeItem('pfi_token');
     // ... existing redirect
   }
   ```

2. **login.js** (~5 lines at bottom):
   ```js
   if (localStorage.getItem('pfi_session_expired')) {
     localStorage.removeItem('pfi_session_expired');
     errorMsg.textContent = 'Your session expired. Please sign in again.';
     errorMsg.style.color = 'var(--yellow)';
   }
   ```

**Estimated LOC**: ~7

---

## Summary Table

| # | Item | Phase | Files | Est. LOC | Priority |
|---|---|---|---|---|---|
| 1.1 | Password toggle + live requirements | 1 | login.html, login.js, login.css | 80 | CRITICAL |
| 1.2 | Sidebar keyboard nav fix | 1 | app.js, styles.css | 10 | CRITICAL |
| 1.3 | Modal focus trap | 1 | utils.js, app.js | 25 | CRITICAL |
| 1.4 | Color contrast fixes | 1 | styles.css | 2 | HIGH |
| 1.5 | Button loading states | 1 | utils.js, styles.css, 7 views | 65 | HIGH |
| 1.6 | Browser back/forward | 1 | app.js | 35 | HIGH |
| 1.7 | Preserve form data on error | 1 | 6 views, styles.css | 40 | HIGH |
| 1.8 | Offline indicator | 1 | index.html, app.js, styles.css | 21 | HIGH |
| 2.1 | Clickable stat cards | 2 | dashboard.js, styles.css | 25 | HIGH |
| 2.2 | Sortable table columns | 2 | transactions.js, styles.css | 35 | HIGH |
| 2.3 | Date range presets | 2 | transactions.js | 40 | MEDIUM |
| 2.4 | Duplicate detection | 2 | transactions.js | 20 | HIGH |
| 2.5 | Skeleton loaders everywhere | 2 | ui-states.js, various views | 15 | HIGH |
| 3.1 | Login tagline | 3 | login.html, login.js | 2 | QUICK |
| 3.2 | Modal X close button | 3 | utils.js, styles.css | 20 | HIGH |
| 3.3 | Chart aria-labels | 3 | dashboard.js, charts.js | 20 | HIGH |
| 3.4 | Progress bar ARIA | 3 | budgets.js, goals.js | 15 | MEDIUM |
| 3.5 | Active nav indicator | 3 | styles.css | 10 | MEDIUM |
| 3.6 | View fade-in transition | 3 | styles.css, app.js | 10 | LOW |
| 3.7 | Ctrl+K search shortcut | 3 | app.js | 8 | MEDIUM |
| 3.8 | Stat card hierarchy + tabular-nums | 3 | styles.css | 12 | MEDIUM |
| 3.9 | Navigation race condition | 3 | app.js, utils.js | 20 | HIGH |
| 3.10 | Contextual empty state tips | 3 | 4 views | 12 | HIGH |
| 3.11 | Link recommendations to actions | 3 | reports.js | 20 | HIGH |
| 3.12 | Sidebar group state persistence | 3 | app.js | 15 | MEDIUM |
| 3.13 | Toast duration 3s → 5s | 3 | utils.js | 6 | MEDIUM |
| 3.14 | Session expiry message | 3 | utils.js, login.js | 7 | MEDIUM |

**Total estimated LOC**: ~590

---

## Implementation Order (Recommended)

Execute in this order to minimize merge conflicts and maximize incremental testability:

1. **3.1** Login tagline (2 LOC, instant win)
2. **1.4** Color contrast fixes (2 LOC, WCAG compliance)
3. **3.5** Active nav indicator (CSS-only, 10 LOC)
4. **3.6** View fade-in transition (CSS + 3 lines JS)
5. **3.8** Stat card hierarchy + tabular-nums (CSS-only, 12 LOC)
6. **3.13** Toast duration extension (6 LOC)
7. **1.1** Password toggle + live requirements (80 LOC, login page isolated)
8. **1.2** Sidebar keyboard nav verification (10 LOC)
9. **1.3** Modal focus trap (25 LOC)
10. **3.2** Modal X close button (20 LOC, depends on 1.3)
11. **1.5** Button loading states (65 LOC, touches many files)
12. **1.7** Preserve form data on error (40 LOC, pairs with 1.5)
13. **1.6** Browser back/forward (35 LOC, refactors navigation)
14. **3.12** Sidebar group state persistence (15 LOC)
15. **3.7** Ctrl+K search shortcut (8 LOC)
16. **3.9** Navigation race condition (20 LOC)
17. **1.8** Offline indicator (21 LOC)
18. **3.14** Session expiry message (7 LOC)
19. **2.1** Clickable stat cards (25 LOC)
20. **2.2** Sortable table columns (35 LOC)
21. **2.3** Date range presets (40 LOC)
22. **2.4** Duplicate detection (20 LOC)
23. **2.5** Skeleton loaders everywhere (15 LOC, audit)
24. **3.3** Chart aria-labels (20 LOC)
25. **3.4** Progress bar ARIA (15 LOC)
26. **3.10** Contextual empty state tips (12 LOC)
27. **3.11** Link recommendations to actions (20 LOC)

---

## Items Explicitly Excluded (Require Backend Changes)

These items from the review are **not** pure frontend:
- Onboarding checklist with `user_preferences` tracking (needs API)
- Budget templates (50/30/20) — pre-filled allocations (needs API + seed data)
- Upcoming bills widget (needs new API endpoint)
- Budget status summary on dashboard (needs API aggregation)
- Month-over-month comparison data (needs prev-month stats from API)
- Merge Groups + Splits (needs route restructuring)
- Searchable category dropdown with recents (recents need API/localStorage tracking — *localStorage portion is frontend-feasible*)
- Spending alerts (needs notification API)
- Mobile bottom tab navigation (S/M effort but large CSS/JS, kept for future phase)

---

## Review Checkpoint

Before implementation begins, verify:
- [ ] The current `app.js` keyboard handlers are actually working (test manually)
- [ ] The `utils.js` modal Tab trap scope is correct (test with Tab key)
- [ ] Backend `/api/transactions` supports `sort`/`order` query params (if not, task 2.2 uses client-side sort)
- [ ] `charts.js` exposes data after render (needed for task 3.3 aria-labels)
