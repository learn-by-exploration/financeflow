# Changelog

All notable changes to PersonalFi are documented here.

## [0.3.25] — 2026-03-30

### Added
- Comprehensive API documentation (`docs/API.md`) — all 120+ endpoints
- Complete README rewrite with features, setup, Docker quickstart, configuration reference
- Multi-stage Docker build for smaller production images
- Startup configuration validation (data directory, DB writability)
- Graceful shutdown handler (SIGTERM/SIGINT) — closes server and database cleanly
- Startup validation tests

### Changed
- Optimized Dockerfile with non-root user, health check, layer caching
- Updated `.dockerignore` with comprehensive exclusions
- Bumped version to 0.3.25

## [0.3.24] — Health Check Enhancements & Monitoring

### Added
- `/api/health/ready` readiness probe
- `/api/health/live` liveness probe
- `/api/health/metrics` application metrics endpoint
- Request metrics middleware (response times, status code counts)
- ETag middleware for conditional responses
- Cache middleware with TTL support

## [0.3.23] — Database Backup & Recovery

### Added
- `POST /api/admin/backup` — create on-demand database backup
- `GET /api/admin/backups` — list available backups
- `GET /api/admin/backups/:filename` — download backup
- `DELETE /api/admin/backups/:filename` — delete backup
- Auto-backup on startup (configurable)
- Backup rotation with configurable retention count

## [0.3.22] — Session Management & Security Polish

### Added
- `GET /api/auth/sessions` — list active sessions
- `DELETE /api/auth/sessions/:id` — revoke specific session
- `POST /api/auth/sessions/revoke-others` — revoke all other sessions
- Account lockout after repeated failed login attempts
- Session token rotation on password change

## [0.3.21] — Accessibility & Frontend Polish APIs

### Added
- `GET /api/preferences` / `PUT /api/preferences` — user display preferences
- Date format, number format, timezone, theme, language settings

## [0.3.20] — Performance Optimization & Caching

### Added
- In-memory response cache with TTL for reports, insights, charts
- ETag-based conditional responses (304 Not Modified)
- Database query optimization (indexes, query plans)

## [0.3.19] — Recurring Transaction Auto-Detection

### Added
- `GET /api/recurring/suggestions` — auto-detected recurring patterns
- `POST /api/recurring/suggestions/accept` — accept suggestion
- `POST /api/recurring/suggestions/dismiss` — dismiss false positive

## [0.3.18] — Duplicate Transaction Detection

### Added
- `GET /api/transactions/duplicates` — detect potential duplicates
- `POST /api/transactions/duplicates/dismiss` — dismiss false positive pair

## [0.3.17] — CSV Export Enhancements

### Added
- `GET /api/export/transactions` — export transactions as CSV
- `GET /api/export/accounts` — export accounts as CSV
- `GET /api/export/budgets` — export budgets as CSV
- `GET /api/export/all` — export all data as ZIP archive

## [0.3.16] — Notifications System

### Added
- `GET /api/notifications` — paginated notifications
- `PUT /api/notifications/:id/read` — mark as read
- `POST /api/notifications/read-all` — mark all as read
- `DELETE /api/notifications/:id` — delete notification

## [0.3.15] — Transaction Attachments (Receipts)

### Added
- `POST /api/transactions/:id/attachments` — upload receipt/document
- `GET /api/transactions/:id/attachments` — list attachments
- `GET /api/attachments/:id` — download attachment
- `DELETE /api/attachments/:id` — delete attachment

## [0.3.14] — Advanced Charts & Visualization Data API

### Added
- 6 chart data endpoints: cashflow, balance-history, spending-pie, income-expense, net-worth, budget-utilization

## [0.3.13] — Personal API Tokens

### Added
- `POST /api/tokens` — create personal API token
- `GET /api/tokens` — list tokens
- `DELETE /api/tokens/:id` — revoke token
- Token-based auth via `X-API-Token` header

## [0.3.12] — Multi-Currency Display

### Added
- Exchange rate management (CRUD)
- Per-account currency support

## [0.3.11] — Spending Insights & Anomaly Detection

### Added
- 5 insight endpoints: trends, anomalies, velocity, categories, payees

## [0.3.10] — Monthly Summary Reports

### Added
- 4 report endpoints: monthly, yearly, categories, compare

## [0.3.9] — Integration Tests + Floating Point Currency Fix

### Fixed
- Floating point precision issues in currency calculations

### Added
- Comprehensive integration test suite

## [0.3.8] — Transaction Bulk Operations

### Added
- Bulk delete, bulk categorize, bulk tag, bulk untag

## [0.3.7] — Bill Reminders & Upcoming Expenses

### Added
- Bill reminders CRUD + upcoming expenses endpoint

## [0.3.6] — Pagination & Filtering for All List Endpoints

### Changed
- All list endpoints support `page`, `limit` parameters
- Transaction list supports comprehensive filtering

## [0.3.5] — Error Handling Standardization + Scheduler Resilience

### Changed
- Standardized error response format: `{ error, code, details }`
- Scheduler auto-recovery on job failure

## [0.3.4] — Repository Layer Extraction (Part 2)

### Changed
- Remaining routes extracted to repository layer

## [0.3.3] — Repository Layer Extraction (Part 1)

### Changed
- Database queries extracted from routes into repository modules

## [0.3.2] — Security Hardening

### Added
- Helmet CSP, rate limiting, Zod validation, CSRF protection, bcrypt hashing

## [0.3.1] — Zod Input Validation Schemas

### Added
- Zod validation schemas for all API inputs
- Consistent validation error responses

## [0.3.0] — 2025-07-18

### Added
- **Health check endpoint** — `GET /api/health` (public, returns status/version/uptime/db)
- **Request ID middleware** — UUID per request in `X-Request-Id` header
- **Dashboard settings** — `GET /api/settings/dashboard` with configurable card layout
- 8 new tests (health check, request ID, dashboard settings)
- 481 total tests passing

## [0.2.9] — 2025-07-18

### Added
- **Audit log viewer** — `GET /api/audit` with pagination, entity_type/action/date filters
- **Shared budgets** — Full CRUD under `/api/groups/:id/budgets` with access control
- Cross-user audit log isolation
- 17 new tests (audit + shared budgets + security sweep)

## [0.2.8] — 2025-07-18

### Added
- **Percentage splits** — `split_method: 'percentage'` with validation (sum must equal 100)
- **Shares splits** — `split_method: 'shares'` with positive shares validation
- Rounding with remainder for exact totals
- 11 new tests covering edge cases and balance calculations

## [0.2.7] — 2025-07-18

### Added
- **Budget rollover** — Toggle per budget item, carry forward under/overspend
- `PUT /api/budgets/:id/items/:itemId` for rollover toggle and amount update
- Enhanced budget summary with `rollover_amount` and `effective_allocated` fields
- 8 new tests

## [0.2.6] — 2025-07-18

### Added
- **Net worth tracking** — Current calculation, history snapshots, manual snapshot creation
- `GET /api/net-worth` respects `include_in_net_worth` account flag
- Idempotent same-day snapshots (upsert)
- 12 new tests

## [0.2.5] — 2025-07-18

### Added
- **Charts & visualization** — `GET /api/stats/daily-spending` for Chart.js sparklines
- Chart.js CDN integration, CSP updated for cdn.jsdelivr.net
- 8 new tests for chart-compatible data shapes

## [0.2.4] — 2025-07-18

### Added
- **Global search** — `GET /api/search?q=...` across transactions, accounts, categories, subscriptions
- Case-insensitive LIKE search, max 10 results per entity type
- SQL injection safety via parameterized queries
- 11 new tests

## [0.2.3] — 2025-07-18

### Added
- **Tags** — Full CRUD with duplicate name prevention
- Transaction tagging via `tag_ids` array, `tag_id` filter on transactions
- `transaction_tags` join table migration
- 12 new tests

## [0.2.2] — 2025-07-18

### Added
- **Recurring rules API** — Full CRUD + skip/advance date
- `advanceDate()` supporting daily/weekly/monthly/quarterly/yearly
- 15 new tests

## [0.2.1] — 2025-07-18

### Added
- **Password change** — `PUT /api/auth/password` with session rotation
- **Account deletion** — `DELETE /api/auth/account` with cascade
- `getUserFromToken()` auth helper
- 12 new tests (security + cascade verification)

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
