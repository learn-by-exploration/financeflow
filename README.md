# PersonalFi

> **Your finances, your machine.** Self-hosted personal finance manager with collaborative expense splitting.

PersonalFi is a web-based personal finance app that combines budgeting, expense tracking, subscription management, savings goals, financial health scoring, and collaborative expense splitting — all in one self-hosted platform. No cloud, no tracking, your data stays on your machine.

## Problem

People juggle an average of 2.4 financial apps. 86% want a single solution. The dedicated couples/family finance tools (Zeta, Honeydue) have shut down. **No single app solves personal finance AND collaborative money management together.**

PersonalFi fills this gap: manage your own money AND collaborate with friends, family, and partners — all in one place.

## Features

- **Accounts** — Track checking, savings, credit cards, cash, investments, loans
- **Transactions** — Income, expenses, transfers with auto-categorization and search
- **Budgets** — Monthly/weekly/custom budgets with per-category allocation and progress tracking
- **Subscriptions** — Track recurring subscriptions, total monthly burn rate
- **Savings Goals** — Set targets with deadlines, contribute, auto-complete on target
- **Groups & Splitting** — Create groups, split expenses (equal/exact/percentage/shares), settle debts
- **Financial Health** — Score based on emergency fund, savings rate, debt-to-income (30-day gated)
- **Reports** — Trends, category breakdowns, visual bars
- **Auto-Categorization** — Pattern-based rules (system + custom) applied on transaction creation
- **Dashboard** — Net worth, income vs expenses, top categories, recent transactions
- **Data Portability** — Full JSON export/import, CSV import with template
- **Multi-user** — Session-based auth with bcrypt password hashing, per-user data isolation
- **PWA** — Installable with offline fallback, service worker caching
- **Keyboard-first** — `N` = quick-add, `1-5` = nav, `Esc` = close modal
- **Mobile-friendly** — Hamburger sidebar toggle, responsive layout
- **Onboarding** — Welcome wizard for new users (3-step guide)
- **Zero cloud** — SQLite database, no tracking, no telemetry

## Quick Start

```bash
git clone <repo-url>
cd personalfi
npm install
cp .env.example .env   # optional — works without it
node src/server.js      # → http://localhost:3457
```

## Docker

```bash
docker compose up -d
```

Or standalone:

```bash
docker build -t personalfi .
docker run -d -p 3457:3457 -v personalfi-data:/app/data personalfi
```

Data is persisted in the `personalfi-data` volume at `/app/data/personalfi.db`.

## Environment Variables

All values have sensible defaults — the app works without a `.env` file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3457` | Server port |
| `DB_DIR` | `./` | SQLite database directory |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `DEFAULT_CURRENCY` | `INR` | Default currency for new users |
| `SESSION_MAX_AGE_DAYS` | `30` | Session token TTL |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | `200` | Max requests per window |
| `BCRYPT_SALT_ROUNDS` | `12` | Password hashing rounds (4 in test mode) |
| `AUTH_LIMIT_WINDOW_MS` | `900000` | Auth rate limit window (15 min) |
| `AUTH_LIMIT_MAX` | `20` | Max auth attempts per window |
| `LOG_LEVEL` | `info` | Pino log level: silent, error, warn, info, debug |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy |

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Backend | Express 5, better-sqlite3 (WAL mode) |
| Frontend | Vanilla JS SPA — ES modules, no framework, no build step |
| Auth | bcryptjs, session tokens (`X-Session-Token` header) |
| Security | Helmet CSP, express-rate-limit, input validation |
| Testing | node:test (built-in) + supertest — 355 tests |
| Container | Docker (node:22-slim) |
| PWA | Service worker, Web App Manifest |

## Project Structure

```
src/
  server.js              — Express app entry, route mounting, graceful shutdown
  config.js              — Centralized config (dotenv, Object.freeze)
  logger.js              — Pino structured logging
  errors.js              — AppError classes
  scheduler.js           — Recurring transaction scheduler
  db/
    index.js             — SQLite schema (23 tables), WAL mode, FK enforcement
  routes/
    auth.js              — Register, login, logout, me
    accounts.js          — Account CRUD
    transactions.js      — Transactions with filtering, pagination, auto-categorization
    categories.js        — Category CRUD (system + custom)
    budgets.js           — Budget CRUD with items and summary
    subscriptions.js     — Subscription CRUD with monthly normalization
    goals.js             — Savings goal CRUD with auto-complete
    groups.js            — Group + member management
    splits.js            — Shared expenses, balances, settlements
    stats.js             — Dashboard overview, trends, breakdown, health score
    rules.js             — Auto-categorization rules CRUD
    settings.js          — User preferences (key/value)
    data.js              — JSON export/import, CSV template/import
  middleware/
    auth.js              — Session validation (requireAuth)
    errors.js            — Global error handler
  services/
    transaction.js       — Double-entry transfer logic
    split.js             — Expense splitting (equal/exact), debt simplification
    health.js            — Financial health scoring algorithm
    audit.js             — Audit logging
  utils/
    safe-regex.js        — ReDoS-safe pattern matching (pipe-delimited)
public/
  index.html             — SPA shell with sidebar navigation
  login.html             — Auth page (login/register)
  styles.css             — Complete dark theme (Midnight) + responsive
  manifest.json          — PWA manifest
  sw.js                  — Service worker (cache-first static, network-only API)
  js/
    app.js               — SPA entry: routing, lazy loading, onboarding, quick-add FAB
    utils.js             — Shared utilities: api, fmt, toast, modal, el, confirm
    views/
      dashboard.js       — Stats overview, top categories, recent transactions
      accounts.js        — Account CRUD with summary cards, icon picker
      transactions.js    — Filtered/paginated list, transfer support
      categories.js      — Grouped by type, system protection
      budgets.js         — Progress bars, category allocations
      goals.js           — Active/completed, contribute modal
      subscriptions.js   — Burn rate, frequency normalization
      settings.js        — Preferences, JSON/CSV import/export
      groups.js          — Member management, guest support
      splits.js          — Shared expenses, balances, settle up
      reports.js         — Health score + trends/category breakdown
      rules.js           — Auto-categorization rules management
tests/
  *.test.js              — 20 test files, 355 tests
docs/
  design/                — Design specifications
  iterations/            — Iteration design docs
```

## API Reference

All endpoints return JSON. Auth endpoints are public; all others require `X-Session-Token` header.

### Auth — `/api/auth`

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/register` | `username`, `password` (min 8), `email?`, `display_name?` | `{ token, user }` 201 |
| POST | `/login` | `username`, `password` | `{ token, user }` |
| POST | `/logout` | — | `{ ok: true }` |
| GET | `/me` | — | `{ user }` |

### Accounts — `/api/accounts`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ accounts }` |
| POST | `/` | `name`, `type`, `currency?`, `balance?`, `icon?`, `color?` | `{ account }` 201 |
| PUT | `/:id` | any field | `{ account }` |
| DELETE | `/:id` | — | `{ ok: true }` |

### Transactions — `/api/transactions`

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/` | Query: `account_id`, `category_id`, `type`, `from`, `to`, `limit`, `offset`, `search` | `{ transactions, total }` |
| POST | `/` | `account_id`, `type`, `amount`, `description`, `date`, `category_id?`, `transfer_to_account_id?` | `{ transaction }` 201 |
| PUT | `/:id` | updatable fields | `{ transaction }` |
| DELETE | `/:id` | — | `{ ok: true }` |

### Categories — `/api/categories`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ categories }` |
| POST | `/` | `name`, `type`, `icon?`, `color?`, `parent_id?` | `{ category }` 201 |
| PUT | `/:id` | `name?`, `icon?`, `color?` (system immutable) | `{ category }` |
| DELETE | `/:id` | — (system protected) | `{ ok: true }` |

### Budgets — `/api/budgets`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ budgets }` |
| GET | `/:id` | — | `{ budget, items }` |
| GET | `/:id/summary` | — | `{ budget, categories, total_allocated, total_spent, total_remaining }` |
| POST | `/` | `name`, `period`, `start_date?`, `end_date?`, `items?` | `{ id }` 201 |
| PUT | `/:id` | updatable fields | `{ budget }` |
| DELETE | `/:id` | — | `{ ok: true }` |

### Subscriptions — `/api/subscriptions`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ subscriptions, total_monthly }` |
| POST | `/` | `name`, `amount`, `frequency`, `category_id?`, `next_billing_date?`, `provider?` | `{ subscription }` 201 |
| PUT | `/:id` | updatable fields | `{ subscription }` |
| DELETE | `/:id` | — | `{ ok: true }` |

### Goals — `/api/goals`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ goals }` |
| POST | `/` | `name`, `target_amount`, `current_amount?`, `icon?`, `color?`, `deadline?` | `{ goal }` 201 |
| PUT | `/:id` | updatable fields (auto-completes if current ≥ target) | `{ goal }` |
| DELETE | `/:id` | — | `{ ok: true }` |

### Groups — `/api/groups`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ groups }` |
| POST | `/` | `name`, `icon?`, `color?` | `{ group }` 201 |
| GET | `/:id` | — | `{ group, members }` |
| DELETE | `/:id` | — (owner only) | `{ ok: true }` |
| POST | `/:id/members` | `username?`, `display_name?` | `{ id }` 201 |
| DELETE | `/:id/members/:memberId` | — | `{ ok: true }` |

### Splits — `/api/splits`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/:groupId/expenses` | — | `{ expenses }` |
| POST | `/:groupId/expenses` | `paid_by`, `amount`, `description`, `date`, `split_method?`, `splits?` | `{ id }` 201 |
| DELETE | `/:groupId/expenses/:id` | — | `{ ok: true }` |
| GET | `/:groupId/balances` | — | `{ balances, simplified_debts }` |
| POST | `/:groupId/settle` | `from_member`, `to_member`, `amount`, `note?` | `{ id }` 201 |

### Stats — `/api/stats`

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/overview` | — | `{ net_worth, month_income, month_expense, top_categories, recent_transactions, ... }` |
| GET | `/trends` | `months?` (default 12) | `{ trends: [{ month, income, expense }] }` |
| GET | `/category-breakdown` | `from?`, `to?`, `type?` | `{ breakdown: [{ id, name, icon, total, count }] }` |
| GET | `/financial-health` | — | `{ score, savings_rate, debt_to_income, emergency_fund_months, ... }` |

### Rules — `/api/rules`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ rules }` |
| POST | `/` | `pattern`, `category_id`, `position?` | `{ rule }` 201 |
| PUT | `/:id` | `pattern?`, `category_id?`, `position?` (system immutable) | `{ rule }` |
| DELETE | `/:id` | — (system protected) | `{ ok: true }` |

### Settings — `/api/settings`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | — | `{ settings }` |
| PUT | `/` | `key` (`default_currency` \| `date_format`), `value` | `{ ok: true }` |

### Data — `/api/data`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/export` | — | Full JSON backup |
| POST | `/import` | `password`, `data` (full export shape) | `{ ok: true }` (destructive — replaces all data) |
| GET | `/csv-template` | — | CSV file download |
| POST | `/csv-import?account_id=X` | Raw CSV body | `{ imported, categorized, uncategorized }` |

## Database Schema (23 tables)

### Core
- `users`, `sessions`, `settings` — Auth & preferences
- `accounts` — Bank accounts, wallets, credit cards
- `transactions` — Income, expense, transfer records (double-entry for transfers)
- `categories` — Income/expense/transfer categories (system + custom)
- `auto_categorization_rules` — Pattern-based auto-categorization
- `recurring_rules` — Recurring transaction definitions
- `tags`, `transaction_tags` — User-defined tags

### Budgeting & Goals
- `budgets`, `budget_items` — Budgets with per-category allocation
- `savings_goals` — Savings targets with progress tracking
- `subscriptions` — Recurring subscription tracking

### Collaboration
- `groups`, `group_members` — User groups with roles (owner/admin/member)
- `shared_expenses`, `expense_splits` — Expense splitting
- `settlements` — Debt settlement records
- `shared_budgets`, `shared_budget_items` — Household budgets

### Analytics
- `net_worth_snapshots` — Historical net worth
- `financial_health_scores` — Health score history
- `audit_log` — System audit trail

## Testing

```bash
npm test              # Run all 355 tests
```

Tests cover: auth, accounts, transactions (double-entry), categories, budgets, subscriptions, goals, groups, splits, stats, rules, settings, data import/export, security, data integrity, multi-user isolation, and full user lifecycle journeys.

## Security

- Passwords hashed with bcrypt (12 rounds)
- Session tokens: 32 random bytes, expiry-checked
- Helmet CSP headers
- Rate limiting: 200 req/min global, 20 req/15min auth
- Input validation on all endpoints
- ReDoS-safe pattern matching (no regex — pipe-delimited string matching)
- Per-user data isolation (all queries scoped by user_id)
- Audit logging for sensitive operations

## License

MIT
