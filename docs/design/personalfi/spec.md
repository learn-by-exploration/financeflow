# PersonalFi — Design Spec

> **Version:** 0.2 | **Date:** 29 March 2026 | **Status:** Revised Draft
> **Previous:** v0.1 (28 Mar 2026) — initial scaffold

---

## Problem Statement

**People cannot manage their complete financial life in one place, and they have no good way to collaborate on money with the people they share life with.**

Users juggle an average of **2.4 financial apps** — budgeting, splitting expenses, investment tracking, credit monitoring — across separate platforms. **86% say they want a single solution**, but none exists. Meanwhile, the only dedicated couples/family finance tools (Zeta, Honeydue) have shut down or are declining, leaving the collaborative finance category **effectively vacant in 2025-2026**.

The result:
- **69% of Americans** live paycheck to paycheck
- **59%** cannot cover a $1,000 emergency
- Consumers **underestimate subscription spending by 2.5×**
- **34% of couples** identify money as a source of conflict
- **40% of millennials** argue about finances weekly

Existing tools force a choice: personal finance management OR collaborative expense tracking. PersonalFi refuses that tradeoff.

---

## Solution

**PersonalFi** is a self-hosted, web-based personal finance platform that combines:
1. **Personal finance management** — accounts, transactions, budgets, subscriptions, savings goals, financial health scoring
2. **Collaborative finance** — groups, expense splitting (equal/exact/percentage/shares), shared budgets, debt simplification and settlement

One app. Your data. Shared with exactly who you choose.

### Collaboration model

PersonalFi is self-hosted — all users in a household, friend group, or couple create accounts on the same instance. This is the same model as lifeflow's multi-user auth. The host runs the server; members register accounts and join groups. Non-registered people can be added to groups as display-name-only "guest" members for splitting purposes.

---

## Target Users (v1 focus)

v1 focuses on **two primary personas** that overlap most — young professionals and couples. Others are served by extension, not by dedicated features.

| Persona | Priority | Key Needs |
|---------|----------|-----------|
| **Young professionals (22-30)** | **v1 Primary** | Track spending, start budgeting, split with roommates, subscription awareness |
| **Couples** | **v1 Primary** | Shared household budget, "yours/mine/ours" model, transparency without conflict |
| **Friend groups** | v1 (via groups) | Trip expenses, shared dinners, settle up easily |
| **Freelancers** | v2 | Irregular income budgeting, personal vs business separation |
| **Families** | v2 | Permission levels, teach kids about money |

---

## Core Feature Domains

### 1. Accounts & Transactions
- Support 8 account types: checking, savings, credit_card, cash, investment, loan, wallet, other
- Manual transaction entry with rule-based auto-categorization (description → category mapping, e.g. "Swiggy" → Food & Dining)
- Income, expense, and transfer transactions
- **Transfers must be double-entry**: debit source account, credit destination account, link the two transaction records via `transfer_transaction_id`
- Search, filter by date/account/category/type
- Running balance updates on account (atomic with transaction creation)
- 21 default system categories seeded on registration

### 2. Budgets
- Monthly, weekly, quarterly, yearly, or custom period budgets
- Category-level allocation with rollover support
- **Budget vs actual tracking** — dedicated route that compares budget_items against actual spending for the budget's period, returning per-category allocated vs spent vs remaining
- Budget progress alerts (50%, 80%, 100% thresholds)

### 3. Subscriptions
- Dedicated subscription tracker
- Monthly cost normalization (weekly → monthly, yearly → monthly)
- Next billing date tracking
- Active/inactive toggle
- Total monthly burn rate calculation

### 4. Savings Goals
- Target amount with optional deadline
- Visual progress tracking (percentage, projected completion date)
- Multiple concurrent goals

### 5. Groups & Expense Splitting
- Create groups (couples, roommates, trips, friends)
- Add members by username (registered users) or display name (guest/non-users)
- Split methods: equal, exact amounts, percentage, shares
- Balance calculation (who owes whom)
- **Debt simplification** — greedy min-cash-flow algorithm to reduce N*(N-1) debts to at most N-1 settlement transactions
- Settlement recording
- Shared group budgets

### 6. Financial Health
- Gated: **requires 30+ days of transaction data** before showing a score (avoids meaningless numbers from empty/sparse data)
- Guard against edge cases: division by zero when expenses = 0, handle negative income months
- Composite score (0-100) based on:
  - Emergency fund ratio (liquid savings / avg monthly expenses → target 3-6 months)
  - Savings rate ((income - expenses) / income → target 20%+)
  - Debt-to-income ratio (monthly debt payments / gross monthly income → target < 36%)
- Contextual interpretation: score + plain-English explanation of what each ratio means and what to improve
- Net worth tracking (assets - liabilities)
- Monthly income vs expense trends
- Category breakdown analysis

### 7. Dashboard
- Net worth at a glance
- Monthly income/expense/savings summary
- Top 5 spending categories
- Recent transactions (last 10)
- Subscription burn rate alert (monthly total)

### 8. Recurring Transactions
- `recurring_rules` table defines templates (frequency: daily/weekly/biweekly/monthly/quarterly/yearly)
- **Scheduler** spawns transactions from active rules when `next_date` ≤ today
- Updates `next_date` after spawning
- Respects `end_date` to stop spawning
- Runs on server startup and then every 60 minutes (following lifeflow's scheduler pattern)

### 9. Data Export/Import
- **JSON export** — full account/transaction/category/budget/goal/subscription/group data
- **JSON import** — with ID remapping, password confirmation required (destructive)
- **CSV import** — bank statement import (date, description, amount, type columns) with category auto-matching
- CSV format auto-detection (date formats, delimiter, column mapping)

### 10. Rule-Based Auto-Categorization
- User-defined rules: if description contains "X" → assign category Y
- System-seeded default rules for common merchants (Swiggy, Zomato, Amazon, Uber, etc.)
- Rules evaluated on transaction creation, user can override
- No ML required — simple string matching, high value for low complexity

---

## Architecture

Following the same patterns as lifeflow:

```
┌────────────────────────────────┐
│   Browser (Vanilla JS SPA)    │
│   app.js + styles.css         │
│   No framework, no build step │
│   + Service Worker (PWA)      │
├────────────────────────────────┤
│         HTTP / JSON            │
├────────────────────────────────┤
│   Express 5 REST API           │
│   12 route modules             │
│   middleware → routes          │
├────────────────────────────────┤
│   better-sqlite3 (WAL mode)   │
│   20+ tables, FK ON           │
│   Scheduler (recurring txns)  │
└────────────────────────────────┘
```

### Backend layers (following lifeflow's layered architecture)

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Routes** | HTTP request/response, auth, input validation, calls services | `routes/transactions.js` |
| **Services** | Business logic, ownership verification, orchestration, transaction boundaries | `services/budget.service.js` |
| **Repositories** | Direct SQL queries, pre-compiled prepared statements, no business logic | `repositories/transaction.repository.js` |
| **Middleware** | Cross-cutting: auth, CSRF, validation, error handling, request logging | `middleware/auth.js` |
| **Schemas** | Zod validation schemas for request bodies | `schemas/transaction.schema.js` |

### Key architectural decisions

- **Self-hosted** — SQLite, no external dependencies
- **No build step** — edit files, restart server, refresh browser
- **Session-based auth** — bcrypt + cookie-based sessions (following lifeflow), with CSRF double-submit cookie
- **Security** — helmet, rate limiting, CSRF, Zod input validation, parameterized SQL
- **Dependency injection** — route factories receive `{ db, audit, ...helpers }` for testability
- **Server exports `{ app, db }`** — enables test suite to access both Express app and database
- **Password reconfirmation** — required for destructive operations (import, account deletion)

---

## Database (22+ tables)

### Identity
`users` · `sessions` · `settings`

### Financial Core
`accounts` · `transactions` · `categories` · `category_rules` · `recurring_rules` · `tags`

### Planning
`budgets` · `budget_items` · `savings_goals` · `subscriptions`

### Collaboration
`groups` · `group_members` · `shared_expenses` · `expense_splits` · `settlements` · `shared_budgets` · `shared_budget_items`

### Analytics
`net_worth_snapshots` · `financial_health_scores` · `audit_log`

### System
`_migrations`

---

## API Routes (50+ routes across 12 modules)

| Module | Routes | Covers |
|--------|--------|--------|
| `auth.js` | 4 | Register, login, logout, session check |
| `accounts.js` | 4 | Account CRUD |
| `transactions.js` | 5 | Transaction CRUD with filtering + transfer handling |
| `categories.js` | 4 | Category CRUD |
| `budgets.js` | 5 | Budget CRUD with items + budget vs actual comparison |
| `groups.js` | 5 | Group CRUD, membership management |
| `splits.js` | 5 | Shared expenses, balances (with simplification), settlements |
| `stats.js` | 4 | Dashboard, trends, breakdown, health score |
| `subscriptions.js` | 4 | Subscription CRUD |
| `goals.js` | 4 | Savings goal CRUD |
| `data.js` | 4 | JSON export, JSON import, CSV import, CSV template download |
| `rules.js` | 4 | Auto-categorization rule CRUD |

---

## Test-Driven Development (TDD) — Mandatory

Every feature MUST follow red-green-refactor: **write failing tests first, then implement, then refactor.**

### Test infrastructure (following lifeflow's proven patterns)

| Component | Implementation |
|-----------|---------------|
| **Framework** | `node:test` (built-in) + `node:assert/strict` |
| **HTTP testing** | `supertest` |
| **Test database** | Fresh temp directory per test run (`mkdtempSync`), SQLite on disk |
| **Execution** | `node --test --test-force-exit tests/*.test.js` |
| **Isolation** | `cleanDb()` in `beforeEach()` — deletes all rows in dependency order |
| **Auth helper** | `agent()` — Proxy-based supertest agent that auto-injects session cookie |
| **Unauth helper** | `rawAgent()` — supertest without auth, for testing 401 responses |
| **Fixtures** | Factory functions: `makeAccount()`, `makeTransaction()`, `makeGroup()`, etc. with override support |
| **Date helpers** | `today()`, `daysFromNow(n)` — UTC date strings matching SQLite's `date('now')` |

### Test file naming convention

```
tests/
  helpers.js                    — Setup, teardown, factories, agent(), cleanDb()
  auth.test.js                  — Register, login, logout, session, 401s
  accounts.test.js              — Account CRUD happy paths + validation + edge cases
  transactions.test.js          — Transaction CRUD, balance updates, transfers
  categories.test.js            — Category CRUD, system category protection
  budgets.test.js               — Budget CRUD, budget vs actual
  subscriptions.test.js         — Subscription CRUD, monthly normalization
  goals.test.js                 — Savings goal CRUD, progress calculation
  groups.test.js                — Group CRUD, membership, authorization
  splits.test.js                — Expense splitting (all 4 methods), balances, settlements, debt simplification
  stats.test.js                 — Dashboard, trends, category breakdown
  health.test.js                — Financial health score, edge cases, data gating
  data.test.js                  — JSON export/import, CSV import
  rules.test.js                 — Auto-categorization rules
  recurring.test.js             — Recurring transaction spawning
  security.test.js              — CSRF, auth guards, SQL injection prevention, input sanitization
  data-integrity.test.js        — Foreign key cascades, transaction atomicity, concurrent operations
  exhaustive-transactions.test.js — Edge cases: negative amounts, max values, special characters
  exhaustive-splits.test.js     — Complex group scenarios: 10+ members, rounding, mixed currencies
```

### Coverage requirements per route module

Every route module MUST have tests covering:

| Category | What to test | Example |
|----------|-------------|---------|
| **Happy path** | Create, read, update, delete succeed with valid input | POST /api/accounts returns 201 with account object |
| **Validation: missing fields** | Each required field omitted returns 400 | POST /api/accounts without name → 400 |
| **Validation: invalid types** | Wrong types return 400 | amount = "abc" → 400 |
| **Validation: boundary values** | Min/max lengths, zero/negative amounts, empty strings | title = "" → 400, amount = 0 → 400 |
| **Auth: unauthenticated** | All protected routes return 401 without session | rawAgent().get('/api/accounts') → 401 |
| **Auth: wrong user** | Cannot access another user's data | User B cannot see User A's accounts |
| **404: not found** | Non-existent resource IDs | GET /api/accounts/99999 → 404 |
| **404: invalid ID format** | Non-numeric IDs | GET /api/accounts/abc → 400 |
| **Cascade deletes** | Deleting parent removes children | Delete account → transactions cascade deleted |
| **Idempotency** | Double-create or double-delete behaves correctly | DELETE already-deleted → 404 |
| **Atomicity** | Multi-step operations roll back on failure | Transfer failure doesn't leave one-sided balance change |
| **Response format** | JSON structure matches expected shape | { accounts: [...] } not just [...] |
| **Pagination/filtering** | Query params work correctly | ?from=2026-01-01&to=2026-03-31 filters correctly |
| **Error messages** | No SQL leakage, user-friendly text | Error says "Account not found", not "SQLITE_ERROR" |

### Test-first workflow

```
1. Write test file (e.g. tests/accounts.test.js)
2. Run tests — all RED (no route implementation yet)
3. Implement the route (src/routes/accounts.js)
4. Run tests — all GREEN
5. Refactor route code (extract to service/repository if complex)
6. Run tests — still GREEN
7. Add edge case tests
8. Repeat
```

---

## Resolved Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Multi-currency | **Defer to v2.** Schema supports per-transaction currency, but reporting/conversion UI adds complexity. Ship INR-first. | Keeps v1 scope tight |
| Receipt storage | **Defer to v2.** File upload adds storage/serving complexity. | Not core workflow |
| AI categorization | **v1: Rule-based.** Simple description → category string matching. No ML. | High value, low complexity. "Swiggy" → Food is deterministic. |
| Mobile / PWA | **v1: Add service worker.** Network-first caching, following lifeflow's sw.js pattern (~200 lines). | Proven pattern, minimal effort |
| CSV import | **v1.** Highest-impact onboarding feature. Manual entry of 3 months of history kills retention. | Critical for day-1 value |
| Notifications | **Defer to v2.** Nice to have, not core. | Focus on core loop |
| Simplify debts | **v1.** Greedy min-cash-flow algorithm. Without it, groups with 3+ people are unusable. | Core collaboration feature |
| Recurring transactions | **v1.** Add scheduler.js following lifeflow's pattern. Without it, salary/rent entries require manual repetition. | Core usability gap |
| Budget vs actual | **v1.** Dedicated route comparing budget items against actual spending. Without it, budgets are a dead feature. | Core value prop |
| Transfer accounting | **v1.** Double-entry: debit source, credit destination, link via `transfer_transaction_id`. | Correctness requirement |
| Data export | **v1.** JSON export is the user's escape hatch. Password-confirmed import for restore. | Trust requirement for self-hosted |

---

## Non-Goals (v1)

- Bank syncing / Plaid integration (privacy-first, manual entry)
- Investment portfolio analysis (beyond balance tracking)
- Credit score monitoring
- Tax estimation / freelancer business separation
- Bill negotiation
- AI chatbot / LLM integration
- Multi-currency conversion and reporting
- Native mobile app
- Receipt image storage
- Push notifications

---

## Implementation Gaps (from v0.1 review)

These issues exist in the current v0.0.1 codebase and MUST be fixed:

| # | Gap | Current State | Required Fix |
|---|-----|--------------|--------------|
| 1 | Server doesn't export `{ app, db }` for tests | `module.exports = app` | Export `{ app, db }` like lifeflow |
| 2 | No test helpers or test files | `tests/` is empty | Create `tests/helpers.js` with setup/teardown/factories/agent |
| 3 | Transfer doesn't credit destination | Only adjusts source balance | Create paired transaction, link via `transfer_transaction_id`, update both balances atomically |
| 4 | No budget vs actual route | Budget CRUD only | Add GET `/api/budgets/:id/summary` comparing items to actual spending |
| 5 | No recurring transaction scheduler | `recurring_rules` table exists but unused | Add `scheduler.js` with session cleanup + recurring spawn jobs |
| 6 | No data export/import routes | Missing entirely | Add `routes/data.js` with JSON export, JSON import, CSV import |
| 7 | Financial health score edge cases | Division by zero when expenses=0, meaningless at 0 data | Gate behind 30+ days of data, handle all zero-division cases |
| 8 | No `category_rules` table for auto-categorization | Missing | Add table + `routes/rules.js` + apply on transaction creation |
| 9 | No migration runner | Schema only in `CREATE TABLE IF NOT EXISTS` | Add `db/migrate.js` + `_migrations` table (following lifeflow) |
| 10 | CSRF middleware is stub | Doesn't validate tokens properly | Implement double-submit cookie pattern (following lifeflow's csrf.js) |
| 11 | No service worker | No PWA support | Add `public/sw.js` with network-first caching |

---

## Success Metrics

- User can go from signup → first transaction in under 60 seconds
- Dashboard loads meaningful data after 5+ transactions
- Group expense split settles correctly for all 4 split methods
- Debt simplification reduces settlements to at most N-1 for N members
- Financial health score provides actionable context (not just a number)
- **100% of API routes have corresponding test files**
- **All tests pass on every commit** (`npm test` exit code 0)
- **Zero SQL injection vectors** (all queries use parameterized statements)
- **Zero auth bypass paths** (every protected route returns 401 without session)
