# PersonalFi

> **Your finances, your machine.** Self-hosted personal finance manager with collaborative expense splitting.

PersonalFi is a web-based personal finance app that combines budgeting, expense tracking, subscription management, savings goals, financial health scoring, and collaborative expense splitting — all in one self-hosted platform. No cloud, no tracking, your data stays on your machine.

## Problem

People juggle an average of 2.4 financial apps. 86% want a single solution. The dedicated couples/family finance tools (Zeta, Honeydue) have shut down. **No single app solves personal finance AND collaborative money management together.**

PersonalFi fills this gap: manage your own money AND collaborate with friends, family, and partners — all in one place.

## Features

- **Accounts** — Track checking, savings, credit cards, cash, investments, loans
- **Transactions** — Income, expenses, transfers with categorization and search
- **Budgets** — Monthly/weekly/custom budgets with category allocation
- **Subscriptions** — Track recurring subscriptions, see total monthly burn
- **Savings Goals** — Set targets with deadlines and progress tracking
- **Groups & Splitting** — Create groups, split expenses (equal/exact/percentage/shares), settle debts
- **Shared Budgets** — Household/couple budgets within groups
- **Financial Health** — Score based on emergency fund, savings rate, debt-to-income
- **Dashboard** — Net worth, income vs expenses, top categories, recent transactions
- **Reports** — Trends, category breakdowns, financial health over time
- **Multi-user** — Session-based auth with bcrypt password hashing
- **8 themes** — Midnight (default) + more coming
- **Keyboard-first** — Shortcuts for power users
- **Zero cloud** — SQLite database, no tracking, no telemetry

## Quick Start

```bash
git clone <repo-url>
cd personalfi
npm install
node src/server.js    # → http://localhost:3457
```

## Docker

```bash
docker compose up -d
# or:
docker run -d -p 3457:3457 -v personalfi-data:/app/data personalfi
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 |
| Backend | Express 5, better-sqlite3 (WAL mode) |
| Frontend | Vanilla JS SPA — no framework, no build step |
| Auth | bcryptjs, session tokens, CSRF |
| Security | helmet, express-rate-limit, input validation |
| Testing | node:test (built-in), supertest |
| Container | Docker (node:22-slim) |

## Project Structure

```
src/
  server.js             — Express app entry point
  config.js             — Centralized config (dotenv, Object.freeze)
  logger.js             — Pino structured logging
  errors.js             — AppError classes
  db/
    index.js            — SQLite schema (20+ tables), migrations
    migrations/         — Versioned SQL migrations
  routes/
    auth.js             — Register, login, logout, session (4 routes)
    accounts.js         — Account CRUD (4 routes)
    transactions.js     — Transaction CRUD with filtering (4 routes)
    categories.js       — Category CRUD (4 routes)
    budgets.js          — Budget CRUD with items (4 routes)
    groups.js           — Group creation, membership (5 routes)
    splits.js           — Shared expenses, balances, settlements (4 routes)
    stats.js            — Dashboard, trends, breakdown, health (4 routes)
    subscriptions.js    — Subscription CRUD (4 routes)
    goals.js            — Savings goal CRUD (4 routes)
  middleware/
    auth.js             — Session validation
    csrf.js             — CSRF token middleware
    errors.js           — Global error handler
    validate.js         — Zod validation middleware
    request-logger.js   — HTTP request logging
  schemas/              — Zod validation schemas (to be added)
  repositories/         — Data access layer (to be added)
  services/
    audit.js            — Audit logging
public/
  app.js                — SPA frontend
  styles.css            — All styles + responsive
  index.html            — SPA shell
  login.html            — Auth page
  js/api.js             — API client module
  manifest.json         — PWA manifest
tests/
  *.test.js             — Test files
docs/
  design/               — Design specs
```

## Database Schema (20+ tables)

### Core
- `users`, `sessions`, `settings` — Auth & preferences
- `accounts` — Bank accounts, wallets, credit cards
- `transactions` — Income, expense, transfer records
- `categories` — Income/expense/transfer categories (system + custom)
- `recurring_rules` — Recurring transaction definitions
- `tags` — User-defined tags

### Budgeting & Goals
- `budgets`, `budget_items` — Personal budgets with category allocation
- `savings_goals` — Savings targets with progress
- `subscriptions` — Recurring subscription tracking

### Collaboration
- `groups`, `group_members` — User groups (couples, roommates, friends)
- `shared_expenses`, `expense_splits` — Expense splitting with multiple methods
- `settlements` — Debt settlement records
- `shared_budgets`, `shared_budget_items` — Household budgets

### Analytics
- `net_worth_snapshots` — Historical net worth tracking
- `financial_health_scores` — Health score history
- `audit_log` — System audit trail

## License

MIT
