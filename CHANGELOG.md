# Changelog

All notable changes to PersonalFi are documented here.

## [0.2.0] — 2025-01-20

### Added
- Comprehensive README with full API reference (55 endpoints documented)
- CHANGELOG tracking all iterations
- Complete project structure documentation

## [0.1.9] — 2025-01-20

### Added
- **Onboarding wizard** — 3-step welcome guide for new users (no accounts detected)
- **Quick-add FAB** — Floating action button for fast transaction entry
- **Keyboard shortcuts** — `N` = quick-add, `1-5` = navigate views, `Esc` = close modal
- **Mobile sidebar toggle** — Hamburger menu button with backdrop overlay
- `navigateTo()` helper for programmatic view switching

## [0.1.8] — 2025-01-20

### Added
- **49 exhaustive tests** (306 → 355 total)
  - Full user lifecycle journey (register → accounts → transactions → budgets → goals → export → logout)
  - Edge cases for all entities (accounts, transactions, budgets, goals, subscriptions, groups, splits, rules, settings)
  - Multi-user data isolation verification

## [0.1.7] — 2025-01-20

### Added
- **PWA support** — Service worker with cache-first static assets, network-only API, offline fallback
- **Data import/export UI** — JSON import with password confirmation, CSV template download, CSV import
- Web App Manifest with emoji SVG icon
- Service worker registration in index.html

## [0.1.6] — 2025-01-20

### Added
- **Reports view** — Health score card, financial ratios, personalized recommendations
- **Trends visualization** — Monthly income/expense bars with visual indicators
- **Category breakdown** — Spending distribution with color-coded bars
- **Auto Rules view** — CRUD interface for auto-categorization rules, system rule protection
- Auto Rules navigation item in sidebar

## [0.1.5] — 2025-01-20

### Added
- **Groups view** — Group CRUD, member management modal, guest support
- **Split Expenses view** — Group-scoped expense list, balance display, simplified debts, settle up modal

## [0.1.4] — 2025-01-20

### Added
- **Subscriptions view** — CRUD with active/inactive toggle, monthly burn rate, frequency normalization
- **Settings view** — Currency/date preferences, JSON export, user info display, app version

## [0.1.3] — 2025-01-20

### Added
- **Budgets view** — Budget cards with progress bars (green/yellow/red), category allocations, detail modal
- **Goals view** — Active/completed sections, progress visualization, contribute modal, deadline tracking

## [0.1.2] — 2025-01-20

### Added
- **Transactions view** — Filter bar (search, type, account, category, date range), paginated table, add/edit/delete with modals, transfer-aware forms
- **Categories view** — Grouped by income/expense type, system category guards, icon/color picker

## [0.1.1] — 2025-01-20

### Added
- **Frontend SPA foundation** — ES module architecture with lazy-loaded views
- **Shared utilities** (`utils.js`) — API client, currency formatter, toast notifications, modal system, safe DOM helpers, confirm dialog
- **Dashboard view** — Stats overview with net worth, income, expenses, savings, top categories, recent transactions
- **Accounts view** — Full CRUD with summary cards (net worth/assets/liabilities), icon picker, color selection
- Dark theme (Midnight) with complete design system

## [0.0.1] — 2025-01-20

### Added
- **Backend API** — 55 endpoints across 13 route modules
- **Auth** — Registration, login, logout with bcrypt + session tokens
- **Accounts** — CRUD for checking, savings, credit cards, cash, investments, loans
- **Transactions** — Double-entry transfers, auto-categorization, filtering, pagination
- **Categories** — System + custom categories, type-grouped (income/expense/transfer)
- **Budgets** — Period-based budgets with per-category allocation and spending summary
- **Subscriptions** — Frequency normalization (weekly/monthly/quarterly/yearly)
- **Goals** — Savings targets with auto-complete on target reached
- **Groups** — Multi-user groups with owner/admin/member roles
- **Splits** — Equal/exact splitting, balance calculation, debt simplification, settlements
- **Stats** — Dashboard overview, trends, category breakdown, financial health scoring
- **Rules** — Auto-categorization with pipe-delimited safe pattern matching
- **Settings** — Key/value user preferences
- **Data** — Full JSON export/import, CSV template/import
- **Scheduler** — Recurring transaction processor
- **Security** — Helmet CSP, rate limiting, input validation, audit logging, ReDoS mitigation
- **Testing** — 306 tests covering all modules
- Docker support (Dockerfile + docker-compose.yml)
- SQLite database with WAL mode, 23 tables, FK enforcement
