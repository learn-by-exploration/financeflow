# PersonalFi — Iteration 1 (v0.1.1) Design Document

> **Date:** 30 March 2026 | **Status:** Draft
> **Scope:** ES module refactor + Accounts CRUD view + CSS additions

---

## 1. Architecture Decision: ES Module Structure

**Problem:** `app.js` is a 154-line IIFE containing the API client, navigation, modal/toast utilities, dashboard rendering, and 10 placeholder views — all in one closure. The `js/api.js` ES module exists but is unused (the IIFE has its own inline `api()` function). This doesn't scale.

**Decision:** Refactor to ES modules using the browser's native `type="module"` support. No bundler, no build step.

```
public/
├── index.html              # Script tag changes to type="module", single entry
├── login.html              # Unchanged
├── styles.css              # Extended with form/table/empty-state styles
├── js/
│   ├── api.js              # Api.get/post/put/del (already exists, becomes canonical)
│   ├── app.js              # Entry: auth guard, router, nav binding, init
│   ├── utils.js            # toast(), fmt(), openModal(), closeModal()
│   ├── views/
│   │   ├── dashboard.js    # renderDashboard() — extracted from current IIFE
│   │   └── accounts.js     # renderAccounts() — NEW, full CRUD
│   └── views/
│        └── (future views) # One file per view, added in future iterations
```

**Key rules:**
- `app.js` moves from `public/app.js` to `public/js/app.js` and becomes the sole entry module
- Each view exports a single `async function render(container)` 
- Views import `Api` from `../api.js` and utilities from `../utils.js`
- `app.js` dynamically imports views only when needed (lazy via `await import()`)
- Placeholder views remain inline in `app.js` (not worth separate files yet)
- `index.html` changes: remove old `<script src="app.js">`, change api.js script to `<script type="module" src="js/app.js"></script>`

**Why not a framework / bundler:** The spec mandates vanilla JS, the app is small, and native ES modules work in all target browsers. A bundler adds complexity with no payoff at this scale.

---

## 2. Accounts View

### 2.1 API Contract (backend already implemented)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/accounts` | — | `{ accounts: [...] }` |
| POST | `/api/accounts` | `{ name, type, currency, balance, icon, color, institution, account_number_last4 }` | `{ account }` |
| PUT | `/api/accounts/:id` | Same fields (all optional, COALESCE) | `{ account }` |
| DELETE | `/api/accounts/:id` | — | `{ ok: true }` |

Account fields: `id, name, type, currency, balance, icon, color, institution, account_number_last4, is_active, include_in_net_worth, position, created_at, updated_at`

Account types (used in dropdown): `checking, savings, credit_card, cash, investment, loan, crypto, other`

### 2.2 View States

1. **Loading** — Spinner/skeleton while fetching
2. **Empty state** — No accounts yet; prominent "Add your first account" CTA
3. **List view** — Cards or table showing all accounts with balances
4. **Add/Edit modal** — Form inside existing modal system

### 2.3 HTML Structure (rendered into `#view-container`)

```html
<!-- View header with action button -->
<div class="view-header">
  <h2>Accounts</h2>
  <button class="btn btn-primary" id="btn-add-account">
    <span class="material-icons-round">add</span> Add Account
  </button>
</div>

<!-- Summary stats -->
<div class="stats-grid">
  <div class="stat-card accent">Net Worth: ₹X</div>
  <div class="stat-card green">Assets: ₹X</div>
  <div class="stat-card red">Liabilities: ₹X</div>
</div>

<!-- Account list (cards, not table — better for varied content) -->
<div class="account-list">
  <div class="account-card">
    <div class="account-icon">🏦</div>
    <div class="account-info">
      <span class="account-name">HDFC Savings</span>
      <span class="account-meta">savings · HDFC · ••1234</span>
    </div>
    <div class="account-balance">₹1,25,000</div>
    <div class="account-actions">
      <button class="btn-icon" data-action="edit"><span class="material-icons-round">edit</span></button>
      <button class="btn-icon" data-action="delete"><span class="material-icons-round">delete</span></button>
    </div>
  </div>
</div>
```

### 2.4 Add/Edit Modal Form

```html
<div class="modal-header">
  <h3>Add Account / Edit Account</h3>
  <button class="btn-icon modal-close">✕</button>
</div>
<form id="account-form" class="form">
  <div class="form-group">
    <label for="acc-name">Account Name *</label>
    <input id="acc-name" name="name" required placeholder="e.g., HDFC Savings">
  </div>
  <div class="form-row">
    <div class="form-group">
      <label for="acc-type">Type</label>
      <select id="acc-type" name="type">
        <option value="checking">Checking</option>
        <option value="savings" selected>Savings</option>
        <option value="credit_card">Credit Card</option>
        <option value="cash">Cash</option>
        <option value="investment">Investment</option>
        <option value="loan">Loan</option>
        <option value="crypto">Crypto</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="form-group">
      <label for="acc-balance">Current Balance</label>
      <input id="acc-balance" name="balance" type="number" step="0.01" value="0">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label for="acc-institution">Institution</label>
      <input id="acc-institution" name="institution" placeholder="e.g., HDFC Bank">
    </div>
    <div class="form-group">
      <label for="acc-last4">Last 4 digits</label>
      <input id="acc-last4" name="account_number_last4" maxlength="4" pattern="\d{4}" placeholder="1234">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label for="acc-icon">Icon</label>
      <input id="acc-icon" name="icon" value="🏦" maxlength="2">
    </div>
    <div class="form-group">
      <label for="acc-currency">Currency</label>
      <input id="acc-currency" name="currency" value="INR" maxlength="3">
    </div>
  </div>
  <div class="form-actions">
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button type="submit" class="btn btn-primary">Save</button>
  </div>
</form>
```

### 2.5 Interactions

| Action | Trigger | Behavior |
|--------|---------|----------|
| Load | Navigate to accounts | `GET /api/accounts`, render list or empty state |
| Add | Click "Add Account" button | Open modal with empty form, `POST /api/accounts` on submit, re-render list |
| Edit | Click edit icon on card | Open modal pre-filled, `PUT /api/accounts/:id` on submit, re-render list |
| Delete | Click delete icon | `confirm()` dialog → `DELETE /api/accounts/:id` → re-render, toast |
| Net worth | Computed client-side | Sum balances where `include_in_net_worth=1`; liabilities = credit_card + loan |

---

## 3. CSS Additions

Add to `styles.css` — extend the existing design system, don't duplicate.

```css
/* ─── Buttons ─── */
.btn                   /* Base: padding, radius, font, cursor, transition */
.btn-primary           /* Background: var(--accent), color: white */
.btn-secondary         /* Background: var(--bg-tertiary), color: text-primary */
.btn-danger            /* Background: var(--red), color: white */
.btn-icon              /* Ghost button for inline icon actions */

/* ─── Forms ─── */
.form                  /* Flex column, gap: 1rem */
.form-group            /* Label + input wrapper */
.form-group label      /* Font-size: 0.75rem, uppercase, text-secondary */
.form-group input,
.form-group select     /* bg-tertiary, border, radius-sm, padding, text-primary */
.form-row              /* Grid 2-col for side-by-side fields */
.form-actions          /* Flex, gap, justify-end */

/* ─── Account cards ─── */
.account-list          /* Flex column, gap: 0.5rem */
.account-card          /* bg-secondary, border, radius, flex row, padding */
.account-icon          /* 2rem font-size */
.account-info          /* Flex column */
.account-name          /* font-weight 600 */
.account-meta          /* text-muted, 0.75rem */
.account-balance       /* font-weight 700, margin-left auto */
.account-actions       /* Flex, gap, icon buttons */

/* ─── Empty state ─── */
.empty-state           /* Centered, padded, icon + message + CTA button */

/* ─── Modal header ─── */
.modal-header          /* Flex, space-between, border-bottom, margin-bottom */
```

---

## 4. Acceptance Criteria

### Module Refactor
- [ ] `index.html` loads a single `<script type="module" src="js/app.js">`
- [ ] `js/api.js` is the sole API client (no duplicate `api()` in app.js)
- [ ] `js/utils.js` exports `toast()`, `fmt()`, `openModal()`, `closeModal()`
- [ ] Dashboard renders identically to current behavior after refactor
- [ ] Navigation between views works (sidebar click → correct view renders)
- [ ] Auth guard redirects to `/login.html` when no token
- [ ] Logout clears storage and redirects

### Accounts View
- [ ] Accounts list shows all user accounts with icon, name, type, institution, last4, balance
- [ ] Summary stats show net worth, total assets, total liabilities
- [ ] Empty state shown when user has zero accounts, with "Add Account" CTA
- [ ] "Add Account" opens modal form; submitting creates account and refreshes list
- [ ] Edit icon opens modal pre-filled with account data; submitting updates account
- [ ] Delete icon shows confirmation; confirming deletes account and refreshes list
- [ ] Toast notifications on success ("Account created") and error
- [ ] Form validates: name is required, last4 is digits only (maxlength 4)
- [ ] Credit card and loan balances display as negative/liability in summary
- [ ] Currency formatting uses existing `fmt()` helper

### CSS
- [ ] Buttons (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-icon`) styled
- [ ] Form elements (inputs, selects, labels) styled with dark theme
- [ ] Account cards are responsive (stack on mobile)
- [ ] Empty state has centered layout with icon + message
- [ ] All new CSS uses existing design tokens (CSS variables)
- [ ] No visual regression on dashboard view

---

## 5. Out of Scope (deferred)

- Account reordering (drag-and-drop `position` field)
- Account grouping / hiding inactive accounts
- Categories view (Iteration 2)
- Transactions view (Iteration 3)
- Frontend automated tests (will evaluate Playwright in a future iteration)
