# PersonalFi — Design Spec

> **Version:** 0.1 | **Date:** 28 March 2026 | **Status:** Draft

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

---

## Target Users

| Persona | Key Needs |
|---------|-----------|
| **Young professionals (22-30)** | Track spending, manage student loans, start budgeting, split with roommates |
| **Couples** | Shared household budget, "yours/mine/ours" model, transparency without conflict |
| **Friend groups** | Trip expenses, shared dinners, group activities, settle up easily |
| **Freelancers** | Irregular income budgeting, personal vs business separation, subscription tracking |
| **Families** | Household budgets, teach kids about money, track family expenses |

---

## Core Feature Domains

### 1. Accounts & Transactions
- Support 8 account types: checking, savings, credit_card, cash, investment, loan, wallet, other
- Manual transaction entry with auto-categorization (21 default categories)
- Income, expense, and transfer transactions
- Search, filter by date/account/category/type
- Running balance updates on account

### 2. Budgets
- Monthly, weekly, quarterly, yearly, or custom period budgets
- Category-level allocation with rollover support
- Budget vs actual tracking

### 3. Subscriptions
- Dedicated subscription tracker
- Monthly cost normalization (weekly → monthly, yearly → monthly)
- Next billing date tracking
- Active/inactive toggle

### 4. Savings Goals
- Target amount with optional deadline
- Visual progress tracking
- Multiple concurrent goals

### 5. Groups & Expense Splitting
- Create groups (couples, roommates, trips, friends)
- Add members by username (registered users) or display name (non-users)
- Split methods: equal, exact amounts, percentage, shares
- Balance calculation (who owes whom)
- Settlement recording
- Shared group budgets

### 6. Financial Health
- Composite score (0-100) based on:
  - Emergency fund ratio (savings / monthly expenses → target 3-6 months)
  - Savings rate (income - expenses / income → target 20%+)
  - Debt-to-income ratio (liabilities / annual income → target < 36%)
- Net worth tracking (assets - liabilities)
- Monthly income vs expense trends
- Category breakdown analysis

### 7. Dashboard
- Net worth at a glance
- Monthly income/expense/savings summary
- Top 5 spending categories
- Recent transactions
- Subscription burn rate alert

---

## Architecture

Following the same patterns as lifeflow:

```
┌────────────────────────────────┐
│   Browser (Vanilla JS SPA)    │
│   app.js + styles.css         │
│   No framework, no build step │
├────────────────────────────────┤
│         HTTP / JSON            │
├────────────────────────────────┤
│   Express 5 REST API           │
│   10 route modules             │
│   middleware → routes          │
├────────────────────────────────┤
│   better-sqlite3 (WAL mode)   │
│   20+ tables, FK ON           │
└────────────────────────────────┘
```

- **Self-hosted** — SQLite, no external dependencies
- **No build step** — edit files, restart server, refresh browser
- **Session-based auth** — bcrypt + token in header
- **Security** — helmet, rate limiting, CSRF, input validation

---

## Database (20+ tables)

### Identity
`users` · `sessions` · `settings`

### Financial Core
`accounts` · `transactions` · `categories` · `recurring_rules` · `tags`

### Planning
`budgets` · `budget_items` · `savings_goals` · `subscriptions`

### Collaboration
`groups` · `group_members` · `shared_expenses` · `expense_splits` · `settlements` · `shared_budgets` · `shared_budget_items`

### Analytics
`net_worth_snapshots` · `financial_health_scores` · `audit_log`

---

## API Routes (41 routes across 10 modules)

| Module | Routes | Covers |
|--------|--------|--------|
| `auth.js` | 4 | Register, login, logout, session check |
| `accounts.js` | 4 | Account CRUD |
| `transactions.js` | 4 | Transaction CRUD with filtering |
| `categories.js` | 4 | Category CRUD |
| `budgets.js` | 4 | Budget CRUD with items |
| `groups.js` | 5 | Group CRUD, membership management |
| `splits.js` | 4 | Shared expenses, balances, settlements |
| `stats.js` | 4 | Dashboard, trends, breakdown, health score |
| `subscriptions.js` | 4 | Subscription CRUD |
| `goals.js` | 4 | Savings goal CRUD |

---

## Open Questions

1. **Multi-currency** — Should we support multi-currency transactions from v1, or start with single currency (INR) and add later?
2. **Receipt storage** — Schema has `receipt_path` but no file upload route yet. Worth adding in v1?
3. **AI categorization** — Auto-categorize transactions based on description patterns? (research shows 89-95% accuracy achievable)
4. **Mobile** — PWA with service worker, or native app later?
5. **Data import** — CSV import from bank statements? Which formats to support first?
6. **Notifications** — Upcoming bill reminders, budget overspend alerts?
7. **Simplify debts** — Implement Splitwise-style debt simplification algorithm for groups?

---

## Non-Goals (v1)

- Bank syncing / Plaid integration (privacy-first, manual entry)
- Investment portfolio analysis (beyond balance tracking)
- Credit score monitoring
- Tax estimation
- Bill negotiation
- AI chatbot

---

## Success Metrics

- User can go from signup → first transaction in under 60 seconds
- Dashboard loads meaningful data after 5+ transactions
- Group expense split settles correctly for all 4 split methods
- Financial health score provides actionable context (not just a number)
- Day-30 retention > 20% (beating the 4-9% industry average)
