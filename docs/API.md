# PersonalFi API Reference

> Base URL: `http://localhost:3457/api`

All endpoints except Auth (register/login) and Health require authentication via `X-Session-Token` header or API token via `X-API-Token` header.

**Request format:** JSON (`Content-Type: application/json`)
**Response format:** JSON

---

## Table of Contents

- [Authentication](#authentication)
- [Accounts](#accounts)
- [Transactions](#transactions)
- [Categories](#categories)
- [Budgets](#budgets)
- [Goals](#goals)
- [Subscriptions](#subscriptions)
- [Recurring Rules](#recurring-rules)
- [Recurring Suggestions](#recurring-suggestions)
- [Tags](#tags)
- [Reports](#reports)
- [Insights](#insights)
- [Charts](#charts)
- [Export](#export)
- [Notifications](#notifications)
- [Reminders](#reminders)
- [Exchange Rates](#exchange-rates)
- [API Tokens](#api-tokens)
- [Admin (Backup)](#admin-backup)
- [Health](#health)
- [Search](#search)
- [Preferences](#preferences)
- [Attachments](#attachments)
- [Duplicates](#duplicates)
- [Data Import/Export](#data-importexport)
- [Settings](#settings)
- [Net Worth](#net-worth)
- [Audit Log](#audit-log)
- [Groups](#groups)
- [Splits](#splits)
- [Stats](#stats)
- [Rules](#rules)
- [Upcoming](#upcoming)

---

## Authentication

All protected endpoints require the `X-Session-Token` header with a valid session token obtained from login.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login, returns session token |
| `POST` | `/auth/logout` | Logout, invalidates session |
| `GET` | `/auth/me` | Get current user profile |
| `PUT` | `/auth/password` | Change password |
| `DELETE` | `/auth/account` | Delete account and all data |
| `GET` | `/auth/sessions` | List active sessions |
| `DELETE` | `/auth/sessions/:id` | Revoke a specific session |
| `POST` | `/auth/sessions/revoke-others` | Revoke all other sessions |

### POST /auth/register

```json
{
  "username": "string (3-50 chars)",
  "password": "string (8+ chars)",
  "displayName": "string (optional)"
}
```

**Response** `201`:
```json
{
  "user": { "id": 1, "username": "john", "displayName": "John" },
  "token": "session-token-string"
}
```

### POST /auth/login

```json
{
  "username": "string",
  "password": "string",
  "rememberMe": false
}
```

**Response** `200`:
```json
{
  "user": { "id": 1, "username": "john", "displayName": "John" },
  "token": "session-token-string"
}
```

### PUT /auth/password

```json
{
  "currentPassword": "string",
  "newPassword": "string (8+ chars)"
}
```

---

## Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/accounts` | List all accounts |
| `POST` | `/accounts` | Create account |
| `PUT` | `/accounts/:id` | Update account |
| `DELETE` | `/accounts/:id` | Delete account |

### POST /accounts

```json
{
  "name": "string",
  "type": "checking | savings | credit | cash | investment | loan",
  "balance": 0,
  "currency": "INR",
  "position": 0
}
```

**Response** `201`:
```json
{
  "account": { "id": 1, "name": "Savings", "type": "savings", "balance": 50000, "currency": "INR", "position": 0 }
}
```

---

## Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/transactions` | List transactions (paginated, filterable) |
| `POST` | `/transactions` | Create transaction |
| `PUT` | `/transactions/:id` | Update transaction |
| `DELETE` | `/transactions/:id` | Delete transaction |
| `POST` | `/transactions/bulk-delete` | Bulk delete by IDs |
| `POST` | `/transactions/bulk-categorize` | Bulk set category |
| `POST` | `/transactions/bulk-tag` | Bulk add tag |
| `POST` | `/transactions/bulk-untag` | Bulk remove tag |

### GET /transactions

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 25, max: 100) |
| `type` | string | Filter by `income`, `expense`, `transfer` |
| `accountId` | number | Filter by account |
| `categoryId` | number | Filter by category |
| `startDate` | string | Filter from date (YYYY-MM-DD) |
| `endDate` | string | Filter to date (YYYY-MM-DD) |
| `search` | string | Search description/notes |
| `tagId` | number | Filter by tag |
| `minAmount` | number | Minimum amount |
| `maxAmount` | number | Maximum amount |

### POST /transactions

```json
{
  "type": "income | expense | transfer",
  "amount": 1500.00,
  "description": "Grocery shopping",
  "date": "2026-03-15",
  "accountId": 1,
  "categoryId": 2,
  "toAccountId": null,
  "notes": "optional notes",
  "tags": [1, 2]
}
```

### POST /transactions/bulk-delete

```json
{ "ids": [1, 2, 3] }
```

### POST /transactions/bulk-categorize

```json
{ "ids": [1, 2, 3], "categoryId": 5 }
```

### POST /transactions/bulk-tag

```json
{ "ids": [1, 2, 3], "tagId": 2 }
```

---

## Duplicates

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/transactions/duplicates` | Detect potential duplicates |
| `POST` | `/transactions/duplicates/dismiss` | Dismiss a duplicate pair |

### POST /transactions/duplicates/dismiss

```json
{ "transactionId": 1, "duplicateId": 2 }
```

---

## Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/categories` | List categories |
| `POST` | `/categories` | Create category |
| `PUT` | `/categories/:id` | Update category |
| `DELETE` | `/categories/:id` | Delete category |

### POST /categories

```json
{
  "name": "string",
  "type": "income | expense",
  "icon": "optional emoji",
  "color": "#hex optional"
}
```

---

## Budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/budgets` | List budgets |
| `GET` | `/budgets/:id` | Get budget detail |
| `GET` | `/budgets/:id/summary` | Budget summary with progress |
| `POST` | `/budgets` | Create budget |
| `PUT` | `/budgets/:id` | Update budget |
| `PUT` | `/budgets/:id/items/:itemId` | Update budget line item |
| `DELETE` | `/budgets/:id` | Delete budget |

### POST /budgets

```json
{
  "name": "March Budget",
  "period": "monthly | weekly | custom",
  "startDate": "2026-03-01",
  "endDate": "2026-03-31",
  "items": [
    { "categoryId": 1, "amount": 5000, "rollover": false }
  ]
}
```

---

## Goals

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/goals` | List savings goals |
| `POST` | `/goals` | Create goal |
| `PUT` | `/goals/:id` | Update goal / contribute |
| `DELETE` | `/goals/:id` | Delete goal |

### POST /goals

```json
{
  "name": "Emergency Fund",
  "targetAmount": 100000,
  "currentAmount": 0,
  "deadline": "2026-12-31"
}
```

---

## Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/subscriptions` | List subscriptions |
| `POST` | `/subscriptions` | Create subscription |
| `PUT` | `/subscriptions/:id` | Update subscription |
| `DELETE` | `/subscriptions/:id` | Delete subscription |

### POST /subscriptions

```json
{
  "name": "Netflix",
  "amount": 649,
  "frequency": "monthly | yearly | weekly",
  "nextBillDate": "2026-04-01",
  "categoryId": 3,
  "accountId": 1,
  "active": true
}
```

---

## Recurring Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/recurring` | List recurring rules |
| `POST` | `/recurring` | Create recurring rule |
| `PUT` | `/recurring/:id` | Update recurring rule |
| `DELETE` | `/recurring/:id` | Delete recurring rule |
| `POST` | `/recurring/:id/skip` | Skip next occurrence |

### POST /recurring

```json
{
  "description": "Rent",
  "amount": 25000,
  "type": "expense",
  "frequency": "monthly",
  "nextDate": "2026-04-01",
  "accountId": 1,
  "categoryId": 4
}
```

---

## Recurring Suggestions

Auto-detected recurring patterns from transaction history.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/recurring/suggestions` | Get suggested recurring rules |
| `POST` | `/recurring/suggestions/accept` | Accept a suggestion |
| `POST` | `/recurring/suggestions/dismiss` | Dismiss a suggestion |

### POST /recurring/suggestions/accept

```json
{ "description": "Netflix", "amount": 649, "frequency": "monthly" }
```

---

## Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tags` | List tags |
| `POST` | `/tags` | Create tag |
| `PUT` | `/tags/:id` | Update tag |
| `DELETE` | `/tags/:id` | Delete tag |

### POST /tags

```json
{ "name": "vacation", "color": "#ff6600" }
```

---

## Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/reports/monthly` | Monthly income/expense summary |
| `GET` | `/reports/yearly` | Yearly summary |
| `GET` | `/reports/categories` | Category breakdown |
| `GET` | `/reports/compare` | Compare two months |

### GET /reports/monthly

**Query:** `?month=2026-03`

### GET /reports/compare

**Query:** `?month1=2026-01&month2=2026-02`

---

## Insights

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/insights/trends` | Spending trends |
| `GET` | `/insights/anomalies` | Unusual spending detection |
| `GET` | `/insights/velocity` | Spending velocity |
| `GET` | `/insights/categories` | Category insights |
| `GET` | `/insights/payees` | Top payees |

---

## Charts

Data endpoints for chart rendering.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/charts/cashflow` | Cash flow over time |
| `GET` | `/charts/balance-history` | Account balance history |
| `GET` | `/charts/spending-pie` | Spending by category (pie) |
| `GET` | `/charts/income-expense` | Income vs expense bars |
| `GET` | `/charts/net-worth` | Net worth over time |
| `GET` | `/charts/budget-utilization` | Budget usage chart |

### GET /charts/cashflow

**Query:** `?months=6`

---

## Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/export/transactions` | Export transactions as CSV |
| `GET` | `/export/accounts` | Export accounts as CSV |
| `GET` | `/export/budgets` | Export budgets as CSV |
| `GET` | `/export/all` | Export all data as ZIP |

### GET /export/transactions

**Query:** `?startDate=2026-01-01&endDate=2026-03-31&format=csv`

---

## Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notifications` | List notifications (paginated) |
| `PUT` | `/notifications/:id/read` | Mark as read |
| `POST` | `/notifications/read-all` | Mark all as read |
| `DELETE` | `/notifications/:id` | Delete notification |

---

## Reminders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/reminders` | List bill reminders |
| `GET` | `/reminders/upcoming` | Get upcoming bills |
| `POST` | `/reminders` | Create reminder |
| `PUT` | `/reminders/:id` | Update reminder |
| `DELETE` | `/reminders/:id` | Delete reminder |

### POST /reminders

```json
{
  "title": "Electricity Bill",
  "amount": 2500,
  "dueDate": "2026-04-05",
  "frequency": "monthly",
  "accountId": 1,
  "categoryId": 6
}
```

---

## Exchange Rates

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/exchange-rates` | List exchange rates |
| `POST` | `/exchange-rates` | Add/update exchange rate |
| `DELETE` | `/exchange-rates/:id` | Delete exchange rate |

### POST /exchange-rates

```json
{
  "fromCurrency": "USD",
  "toCurrency": "INR",
  "rate": 83.50
}
```

---

## API Tokens

Personal API tokens for programmatic access.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/tokens` | Create API token |
| `GET` | `/tokens` | List API tokens |
| `DELETE` | `/tokens/:id` | Revoke API token |

### POST /tokens

```json
{ "name": "Mobile App", "expiresInDays": 90 }
```

**Response** `201`:
```json
{ "token": { "id": 1, "name": "Mobile App", "token": "pfi_...", "expiresAt": "..." } }
```

---

## Admin (Backup)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/backup` | Create database backup |
| `GET` | `/admin/backups` | List available backups |
| `GET` | `/admin/backups/:filename` | Download a backup |
| `DELETE` | `/admin/backups/:filename` | Delete a backup |

---

## Health

Public endpoints — no authentication required.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Full health check (status, version, uptime, db) |
| `GET` | `/health/ready` | Readiness probe |
| `GET` | `/health/live` | Liveness probe |
| `GET` | `/health/metrics` | Application metrics |

### GET /health

```json
{
  "status": "ok",
  "version": "0.3.25",
  "uptime": 3600,
  "database": "ok",
  "timestamp": "2026-03-30T12:00:00Z"
}
```

---

## Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/search` | Global search across entities |

**Query:** `?q=netflix&type=transactions`

---

## Preferences

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/preferences` | Get user preferences |
| `PUT` | `/preferences` | Update preferences |

### PUT /preferences

```json
{
  "date_format": "YYYY-MM-DD",
  "number_format": "en-IN",
  "timezone": "Asia/Kolkata",
  "theme": "system",
  "language": "en",
  "items_per_page": 25
}
```

---

## Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/transactions/:id/attachments` | Upload attachment (multipart) |
| `GET` | `/transactions/:id/attachments` | List attachments for transaction |
| `GET` | `/attachments/:id` | Download attachment |
| `DELETE` | `/attachments/:id` | Delete attachment |

Upload uses `multipart/form-data` with field name `file`. Max 5MB, accepts images and PDFs.

---

## Data Import/Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/data/export` | Full JSON data export |
| `POST` | `/data/import` | Full JSON data import |
| `GET` | `/data/csv-template` | Download CSV import template |
| `POST` | `/data/csv-import` | Import transactions from CSV |

---

## Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/settings` | Get user settings |
| `PUT` | `/settings` | Update settings |
| `GET` | `/settings/dashboard` | Get dashboard layout config |

---

## Net Worth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/net-worth` | Current net worth calculation |
| `GET` | `/net-worth/history` | Net worth history |
| `POST` | `/net-worth/snapshot` | Take a net worth snapshot |

---

## Audit Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/audit` | Paginated audit log |

**Query:** `?page=1&limit=25&action=create&entity=transaction`

---

## Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/groups` | List groups |
| `POST` | `/groups` | Create group |
| `GET` | `/groups/:id` | Get group detail |
| `DELETE` | `/groups/:id` | Delete group |
| `POST` | `/groups/:id/members` | Add member |
| `DELETE` | `/groups/:id/members/:memberId` | Remove member |
| `GET` | `/groups/:id/budgets` | List shared budgets |
| `POST` | `/groups/:id/budgets` | Create shared budget |
| `GET` | `/groups/:id/budgets/:budgetId` | Get shared budget |
| `PUT` | `/groups/:id/budgets/:budgetId` | Update shared budget |
| `DELETE` | `/groups/:id/budgets/:budgetId` | Delete shared budget |

---

## Splits

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/splits/:groupId/expenses` | List group expenses |
| `POST` | `/splits/:groupId/expenses` | Add shared expense |
| `DELETE` | `/splits/:groupId/expenses/:id` | Delete shared expense |
| `GET` | `/splits/:groupId/balances` | Calculate balances |
| `POST` | `/splits/:groupId/settle` | Record settlement |

### POST /splits/:groupId/expenses

```json
{
  "description": "Dinner",
  "amount": 3000,
  "paidBy": 1,
  "splitMethod": "equal | exact | percentage | shares",
  "splits": [
    { "userId": 1, "amount": 1500 },
    { "userId": 2, "amount": 1500 }
  ]
}
```

---

## Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/stats/overview` | Dashboard overview stats |
| `GET` | `/stats/trends` | Spending trends |
| `GET` | `/stats/category-breakdown` | Category spending breakdown |
| `GET` | `/stats/financial-health` | Financial health score |
| `GET` | `/stats/daily-spending` | Daily spending sparkline data |

---

## Rules

Auto-categorization rules.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/rules` | List categorization rules |
| `POST` | `/rules` | Create rule |
| `PUT` | `/rules/:id` | Update rule |
| `DELETE` | `/rules/:id` | Delete rule |

### POST /rules

```json
{
  "pattern": "netflix|spotify",
  "categoryId": 3,
  "priority": 10
}
```

---

## Upcoming

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/upcoming` | Upcoming bills/expenses |

**Query:** `?days=30` (1-365)

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "VALIDATION_ERROR",
  "details": []
}
```

**Common HTTP status codes:**

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request / validation error |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | Not found |
| `409` | Conflict (duplicate) |
| `429` | Rate limited |
| `500` | Internal server error |

---

## Rate Limiting

- General: 200 requests per 60 seconds
- Auth endpoints: 20 requests per 15 minutes
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Request IDs

Every response includes `X-Request-Id` header for tracing.
