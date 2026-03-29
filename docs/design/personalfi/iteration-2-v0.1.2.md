# PersonalFi — Iteration 2 (v0.1.2) Design Document

> **Date:** 30 March 2026 | **Status:** Draft
> **Scope:** Transactions view (filters, search, pagination, CRUD) + Categories view (grouped CRUD)

---

## 1. Transactions View (`views/transactions.js`)

### 1.1 API Contract

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| GET | `/api/transactions` | `?account_id=&category_id=&type=&start_date=&end_date=&search=&limit=&offset=` | `{ transactions: [...] }` |
| POST | `/api/transactions` | `{ account_id, category_id, type, amount, description, date, notes, transfer_account_id }` | `{ transaction }` |
| PUT | `/api/transactions/:id` | Same fields (all optional) | `{ transaction }` |
| DELETE | `/api/transactions/:id` | — | `{ ok: true }` |

### 1.2 Layout

```
┌─ View Header ──────────────────────────────────────────┐
│ [h2 Transactions]                        [+ Add Txn]   │
├─ Filter Bar ───────────────────────────────────────────┤
│ [Account ▾] [Category ▾] [Type ▾] [Date From] [Date To] [🔍 Search...] │
├─ Transaction Table ───────────────────────────────────-┤
│ Date       │ Description  │ Account  │ Category │ Amount│ Actions │
│ 28 Mar '26 │ Swiggy order │ HDFC Sav │ Food     │ -₹450 │ ✎ 🗑    │
│ 27 Mar '26 │ Salary       │ HDFC Sav │ Salary   │+₹80k  │ ✎ 🗑    │
│ 27 Mar '26 │ Savings xfer │ HDFC→SBI │ Transfer │ ₹10k  │ ✎ 🗑    │
├─ Pagination ──────────────────────────────────────────-┤
│                       [← Prev] Page 1 of 5 [Next →]    │
└────────────────────────────────────────────────────────┘
```

### 1.3 Filter Bar

- **Dropdowns** for account, category, type — populated from `/api/accounts` and `/api/categories` on load
- **Date inputs** (`type="date"`) for start/end range
- **Search input** with debounced 300ms `keyup` — hits `?search=` param
- Any filter change re-fetches with `offset=0`; all params combined in one GET
- A "Clear filters" link appears when any filter is active

### 1.4 Transaction Row Rules

- **Amount color:** `var(--green)` for income, `var(--red)` for expense, `var(--text-secondary)` for transfer
- **Transfer display:** Show `AccountA → AccountB` in the Account column; description shows linked accounts
- **Category column:** Show `icon + name`; if category deleted/missing, show "Uncategorized" in muted text

### 1.5 Add/Edit Modal

- Same modal system as accounts; fields: description, amount, type (radio: income/expense/transfer), account (dropdown), category (dropdown filtered by selected type), date, notes
- When `type=transfer`: hide category, show "To Account" dropdown, validate source ≠ destination
- On edit: pre-fill all fields; type change resets category/transfer fields
- Amount input: `type="number" step="0.01" min="0.01" required`

### 1.6 Pagination

- Default `limit=20`; track `offset` in view state
- Show "Page X of Y" (compute from total count — backend should return `total` in GET response)
- Prev/Next buttons; Prev disabled on page 1, Next disabled on last page

---

## 2. Categories View (`views/categories.js`)

### 2.1 API Contract

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/categories` | — | `{ categories: [...] }` |
| POST | `/api/categories` | `{ name, icon, type, parent_id, color }` | `{ category }` |
| PUT | `/api/categories/:id` | Same fields (optional) | `{ category }` |
| DELETE | `/api/categories/:id` | — | `{ ok: true }` |

### 2.2 Layout

- Two-column layout: **Income categories** (left), **Expense categories** (right)
- Each column: heading + list of category cards (icon + name + color dot)
- System categories (`is_system=1`): show lock icon, edit allowed, delete button hidden
- "+ Add Category" button per column, pre-sets `type` in the modal

### 2.3 Add/Edit Modal

- Fields: name, icon (emoji picker reused from accounts), type (pre-filled from column, radio), color (input type="color")
- `parent_id` dropdown (optional, filtered to same type) for sub-categories
- System categories: name and icon editable, type and `is_system` not editable

---

## 3. Expert Panel Review

**UI/UX:** The filter bar should be a single horizontal row that collapses into a toggleable panel on narrow viewports, with dropdowns using the existing `select` styling and search as an `input` with a search icon prefix. Transaction rows use a compact table with sticky header; transfer rows span the account column with an `→` separator and use muted text color to visually distinguish them from income/expense.

**QA:** Validate amount > 0 on submit and reject empty/zero amounts with inline error; handle missing or deleted categories gracefully by falling back to "Uncategorized" display; transfer transactions must enforce source ≠ destination and show both accounts even if one is later deleted (use stored account name); test pagination boundary (exactly `limit` items, zero results, offset beyond total); test filter combinations yielding no results show empty state not a broken table.

**PM — Acceptance Criteria:**
- [ ] Transaction list loads with default 20-per-page pagination, showing date/desc/account/category/amount
- [ ] All five filters (account, category, type, date range, search) work independently and combined
- [ ] Add transaction modal validates required fields; transfer type shows/hides transfer_account_id field
- [ ] Income amounts render green, expense red, transfer muted
- [ ] Transfer rows display "Source → Dest" in account column
- [ ] Edit pre-fills all fields; delete shows confirm dialog
- [ ] Categories view shows two grouped columns (income/expense) with icon + name + color
- [ ] System categories show lock icon and cannot be deleted
- [ ] Add/edit category modal with icon picker and optional parent_id
- [ ] Empty states shown for no transactions (with filters and without) and no categories

---

## 4. New Files

```
public/js/views/
├── transactions.js    # render(container) — filter state, fetch, table, pagination, modal
└── categories.js      # render(container) — grouped lists, modal, system-category guards
```

CSS additions in `styles.css`: `.filter-bar`, `.txn-table`, `.txn-amount.income/.expense/.transfer`, `.category-columns`, `.category-card`, `.badge-system`, `.pagination`.
