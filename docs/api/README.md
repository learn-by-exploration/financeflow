# PersonalFi API Reference

Base URL: `http://localhost:3457/api`

## Authentication

All endpoints except `/api/auth/register` and `/api/auth/login` require the `X-Session-Token` header.

```
X-Session-Token: <token-from-login-or-register>
```

Tokens expire after 30 days (configurable via `SESSION_MAX_AGE_DAYS`).

---

## Auth

### POST /auth/register

Create a new account. Seeds default categories and auto-categorization rules.

```json
// Request
{ "username": "alice", "password": "secure123", "email": "alice@example.com", "display_name": "Alice" }

// Response 201
{ "token": "abc123...", "user": { "id": 1, "username": "alice", "display_name": "Alice" } }
```

### POST /auth/login

```json
// Request
{ "username": "alice", "password": "secure123" }

// Response 200
{ "token": "abc123...", "user": { "id": 1, "username": "alice", "display_name": "Alice" } }
```

### POST /auth/logout

Invalidates the current session token.

```json
// Response 200
{ "ok": true }
```

### GET /auth/me

Returns the authenticated user's profile.

```json
// Response 200
{ "user": { "id": 1, "username": "alice", "display_name": "Alice", "email": "alice@example.com", "default_currency": "INR" } }
```

---

## Accounts

### GET /accounts

```json
// Response 200
{ "accounts": [{ "id": 1, "name": "Main Checking", "type": "checking", "balance": 50000, "currency": "INR", "icon": "🏦", "color": "#6366f1", "is_active": 1, "include_in_net_worth": 1 }] }
```

### POST /accounts

```json
// Request
{ "name": "Savings", "type": "savings", "balance": 100000, "currency": "INR", "icon": "💰", "color": "#10b981" }

// Response 201
{ "account": { "id": 2, "name": "Savings", ... } }
```

### PUT /accounts/:id

```json
// Request
{ "name": "Savings (HDFC)", "balance": 120000 }

// Response 200
{ "account": { ... } }
```

### DELETE /accounts/:id

```json
// Response 200
{ "ok": true }
```

---

## Transactions

### GET /transactions

Query parameters: `account_id`, `category_id`, `type` (income|expense|transfer), `from` (date), `to` (date), `search`, `limit` (default 50), `offset` (default 0).

```json
// Response 200
{ "transactions": [{ "id": 1, "account_id": 1, "category_id": 5, "type": "expense", "amount": 500, "description": "Groceries", "date": "2025-01-15", "category_name": "Food", "category_icon": "🍕", "account_name": "Main Checking" }], "total": 42 }
```

### POST /transactions

If `category_id` is omitted, auto-categorization rules are applied to the description.

For transfers, include `transfer_to_account_id` — creates paired debit/credit entries.

```json
// Request
{ "account_id": 1, "type": "expense", "amount": 500, "description": "Groceries at BigBasket", "date": "2025-01-15" }

// Response 201
{ "transaction": { ... } }
```

### PUT /transactions/:id

```json
// Request
{ "description": "Grocery shopping", "amount": 550 }

// Response 200
{ "transaction": { ... } }
```

### DELETE /transactions/:id

```json
// Response 200
{ "ok": true }
```

---

## Categories

### GET /categories

```json
// Response 200
{ "categories": [{ "id": 1, "name": "Food", "type": "expense", "icon": "🍕", "color": "#ef4444", "is_system": 1 }] }
```

### POST /categories

```json
// Request
{ "name": "Side Hustle", "type": "income", "icon": "💼", "color": "#10b981" }

// Response 201
{ "category": { ... } }
```

### PUT /categories/:id

System categories cannot be modified.

### DELETE /categories/:id

System categories cannot be deleted.

---

## Budgets

### GET /budgets

```json
// Response 200
{ "budgets": [{ "id": 1, "name": "January 2025", "period": "monthly", "start_date": "2025-01-01", "end_date": "2025-01-31", "is_active": 1 }] }
```

### GET /budgets/:id

```json
// Response 200
{ "budget": { ... }, "items": [{ "id": 1, "category_id": 5, "amount": 5000, "rollover": 0 }] }
```

### GET /budgets/:id/summary

```json
// Response 200
{
  "budget": { ... },
  "categories": [{ "category_id": 5, "category_name": "Food", "category_icon": "🍕", "allocated": 5000, "spent": 3200, "remaining": 1800 }],
  "total_allocated": 20000,
  "total_spent": 12000,
  "total_remaining": 8000
}
```

### POST /budgets

```json
// Request
{ "name": "January 2025", "period": "monthly", "start_date": "2025-01-01", "end_date": "2025-01-31", "items": [{ "category_id": 5, "amount": 5000 }] }

// Response 201
{ "id": 1 }
```

### PUT /budgets/:id

### DELETE /budgets/:id

---

## Subscriptions

### GET /subscriptions

Returns all subscriptions with normalized `total_monthly` burn rate.

```json
// Response 200
{ "subscriptions": [{ "id": 1, "name": "Netflix", "amount": 649, "frequency": "monthly", "is_active": 1, "provider": "Netflix" }], "total_monthly": 2500 }
```

### POST /subscriptions

```json
// Request
{ "name": "Netflix", "amount": 649, "frequency": "monthly", "provider": "Netflix", "next_billing_date": "2025-02-01" }

// Response 201
{ "subscription": { ... } }
```

### PUT /subscriptions/:id

### DELETE /subscriptions/:id

---

## Goals

### GET /goals

```json
// Response 200
{ "goals": [{ "id": 1, "name": "Emergency Fund", "target_amount": 300000, "current_amount": 50000, "is_completed": 0, "deadline": "2025-12-31" }] }
```

### POST /goals

```json
// Request
{ "name": "Emergency Fund", "target_amount": 300000, "current_amount": 0, "deadline": "2025-12-31", "icon": "🛡️" }

// Response 201
{ "goal": { ... } }
```

### PUT /goals/:id

Auto-completes (`is_completed = 1`) when `current_amount >= target_amount`.

### DELETE /goals/:id

---

## Groups

### GET /groups

### POST /groups

Creator is automatically added as `owner`.

```json
// Request
{ "name": "Roommates", "icon": "🏠" }

// Response 201
{ "group": { ... } }
```

### GET /groups/:id

Returns group details + member list. Requires group membership.

```json
// Response 200
{ "group": { ... }, "members": [{ "id": 1, "user_id": 1, "display_name": "Alice", "role": "owner" }] }
```

### DELETE /groups/:id

Owner only.

### POST /groups/:id/members

Add a registered user by `username` or a guest by `display_name`.

### DELETE /groups/:id/members/:memberId

Owner only. Cannot remove the last owner.

---

## Splits

### GET /splits/:groupId/expenses

### POST /splits/:groupId/expenses

```json
// Request
{ "paid_by": 1, "amount": 3000, "description": "Dinner", "date": "2025-01-15", "split_method": "equal" }

// Response 201
{ "id": 1 }
```

### DELETE /splits/:groupId/expenses/:id

### GET /splits/:groupId/balances

```json
// Response 200
{ "balances": [{ "member_id": 1, "paid": 3000, "owes": 1500, "net": 1500 }], "simplified_debts": [{ "from": 2, "to": 1, "amount": 1500 }] }
```

### POST /splits/:groupId/settle

```json
// Request
{ "from_member": 2, "to_member": 1, "amount": 1500 }

// Response 201
{ "id": 1 }
```

---

## Stats

### GET /stats/overview

Dashboard summary: net worth, monthly income/expense/savings, top categories, recent transactions, subscription burn.

### GET /stats/trends?months=12

Monthly income vs expense over N months.

### GET /stats/category-breakdown?type=expense&from=2025-01-01&to=2025-01-31

Spending by category with totals and counts.

### GET /stats/financial-health

Returns financial health score (0-100). **Gated**: requires at least 30 days of transaction history.

```json
// Response 200
{ "score": 72, "net_worth": 500000, "emergency_fund_months": 3.2, "savings_rate": 0.25, "debt_to_income": 0.15, "avg_monthly_income": 80000, "avg_monthly_expense": 60000, "interpretation": "Good" }
```

---

## Rules

Auto-categorization rules use pipe-delimited pattern matching (ReDoS-safe).

### GET /rules

### POST /rules

```json
// Request
{ "pattern": "swiggy|zomato|uber eats", "category_id": 5, "position": 10 }

// Response 201
{ "rule": { ... } }
```

### PUT /rules/:id

System rules are immutable.

### DELETE /rules/:id

System rules cannot be deleted.

---

## Settings

### GET /settings

```json
// Response 200
{ "settings": { "default_currency": "INR", "date_format": "YYYY-MM-DD" } }
```

### PUT /settings

```json
// Request
{ "key": "default_currency", "value": "USD" }

// Response 200
{ "ok": true }
```

---

## Data

### GET /data/export

Full JSON backup of all user data.

### POST /data/import

**Destructive** — replaces all user data. Requires password confirmation.

```json
// Request
{ "password": "secure123", "data": { /* full export shape */ } }

// Response 200
{ "ok": true }
```

### GET /data/csv-template

Downloads CSV template file: `date,description,amount,type,category`

### POST /data/csv-import?account_id=1

Import transactions from CSV body. Auto-categorization applied.

```json
// Response 200
{ "imported": 50, "categorized": 42, "uncategorized": 8 }
```

---

## Error Responses

All errors follow this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Description of what went wrong" } }
```

Common error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429).
