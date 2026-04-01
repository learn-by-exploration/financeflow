# Changelog

All notable changes to PersonalFi are documented here.

## [4.0.0] — 2025-07-24

### Added — Architecture
- **Transaction Orchestrator** (`src/services/transaction-orchestrator.service.js`) — extracted 160+ lines of inline business logic from transactions route (budget checks, goal allocation, audit trail, balance sync) into a dedicated service (SRP)
- **Data Repository** (`src/repositories/data.repository.js`) — extracted N+1 query patterns from data export route; batch loading for groups, members, and splits
- **Stats Repository expansion** (`src/repositories/stats.repository.js`) — 18+ new reusable methods: budget recommendations, cashflow forecasting, debt payoff, spending velocity, anomaly detection, budget variance, category trends, subscription analysis
- **Tag Management UI** (`public/js/views/tags.js`) — full CRUD frontend for tag management with color picker, usage counts, and filtering

### Added — Database
- **Migration 028** (`028_settlements_group_indexes.sql`) — composite indexes on settlements(group_id) and group_members for faster group queries
- **Migration 029** (`029_recurring_rules_updated_at.sql`) — `updated_at` column on recurring_rules for execute-now tracking

### Added — Features
- **Budget Recommendations** — `GET /api/stats/budget-recommendations` suggests budget adjustments based on spending history
- **Cashflow Forecast** — `GET /api/stats/cashflow-forecast` projects future cashflow from recurring rules
- **Execute-now Endpoint** — `POST /api/recurring/:id/execute` triggers immediate execution of a recurring rule
- **Debt Payoff Enhancements** — snowball vs avalanche strategy comparison with payoff timeline

### Changed
- **Transactions route** — extracted 160+ lines of inline orchestration to transaction-orchestrator service (-135 lines)
- **Data export route** — replaced 42 inline `db.prepare()` calls with data repository (N+1 fix, -60 lines)
- **Stats route** — migrated budget-recommendations, cashflow-forecast, and 10+ endpoints to repository pattern (+191 lines of new endpoints)
- **Scheduler** — added error handling per cleanup job (no single failure crashes the scheduler), added recurring `updated_at` tracking
- **Recurring repository** — added `markExecuted()` method for execute-now support
- Service worker `CACHE_NAME` bumped to `financeflow-v4.0.0`
- App.js: registered tags view in SPA router

### Added — Testing (396 new tests)
- **Admin Tests** (`tests/admin.test.js`) — admin endpoint coverage (previously 0% coverage)
- **Migration 028 Tests** (`tests/migration-028-indexes.test.js`) — index existence and query performance validation
- **Scheduler Tests** (`tests/scheduler.test.js`) — scheduler hardening, error isolation, job execution
- **Transaction Orchestrator Tests** (`tests/transaction-orchestrator.test.js`) — service unit tests for orchestration logic
- **Data Repository Tests** (`tests/data-repository.test.js`) — batch loading, N+1 prevention
- **Tags Frontend Tests** (`tests/tags-frontend.test.js`) — tag UI file structure and patterns
- **Debt Payoff Tests** (`tests/debt-payoff.test.js`) — snowball vs avalanche, edge cases
- **Cashflow Forecast Tests** (`tests/cashflow-forecast.test.js`) — projection accuracy, empty state
- **Budget Recommendations Tests** (`tests/budget-recommendations.test.js`) — suggestion logic validation
- **Recurring Execute Tests** (`tests/recurring-execute.test.js`) — execute-now endpoint, balance sync
- **Frontend Patterns Tests** (`tests/frontend-patterns.test.js`) — 117 tests: XSS prevention, imports, exports, error handling, accessibility, view registration, SW caching, HTML structure
- **API Edge Cases Tests** (`tests/api-edge-cases.test.js`) — 46 tests: boundary conditions across all API endpoints
- **Security Hardening v2 Tests** (`tests/security-hardening-v2.test.js`) — 17 tests: auth enforcement, SQL injection, authorization, input validation, session security, CORS, lockout, audit
- **Cross-Feature Flow Tests** (`tests/cross-feature-flows.test.js`) — 13 tests: end-to-end integration across transactions, budgets, goals, tags, groups, splits, recurring, notifications
- **Calculator & Report Tests** (`tests/calculators-reports.test.js`) — 35 tests: all calculators (EMI, SIP, FIRE, lumpsum), reports, charts, insights
- **Middleware Validation Tests** (`tests/middleware-validation.test.js`) — 30 tests: middleware config, error classes, database structure, static serving, CSV, API tokens, preferences, net worth
- Test count: **2607 tests, 0 failures** (up from 2219)

### Security
- All new endpoints verified to require authentication
- SQL injection prevention verified across all new repository methods
- Cross-user data isolation verified for orchestrator and data repository
- Transaction orchestrator validates ownership before balance/budget operations
- OWASP Top 10 re-verified for all v4 endpoints

## [3.0.0] — 2026-04-01

### Security
- **Attachment path traversal fix** — validate file_path stays within uploads directory before read/delete
- **Silent catch logging** — all previously silent catch blocks now log warnings via Pino (audit.js, server.js, health.js, export.js, auth.js)
- OWASP re-verified: attachment security, cross-user isolation, input validation on all new endpoints

### Added — Validation
- **Rule schema** (`src/schemas/rule.schema.js`) — Zod validation for category rule create/update (pattern max 500 chars, integer category_id)
- **Report schema** (`src/schemas/report.schema.js`) — Zod validation for year, month, and date range parameters
- Rules route now uses Zod `safeParse()` instead of inline validation

### Added — Architecture
- **Stats repository** (`src/repositories/stats.repository.js`) — extracted 13 reusable SQL queries from stats route (SRP)
- Stats route overview, trends, category-breakdown now use repository layer

### Added — Features
- **Recurring pause/resume** — `POST /api/recurring/:id/pause` and `POST /api/recurring/:id/resume` endpoints
- **Subscription renewal alerts** — `GET /api/subscriptions/upcoming?days=7` returns subscriptions renewing within N days
- **Calculators frontend view** — SIP, Lumpsum, EMI, FIRE calculator UI with tabbed interface
- **Challenges frontend view** — savings challenges dashboard with progress bars, CRUD, gamification

### Added — Testing
- **v3 Security Hardening Tests** — 25 tests: attachment security, rule validation, pause/resume, upcoming alerts, repo integration
- **v3 Frontend QA Tests** — 45 tests: view file existence (20 views), module exports, navigation, scheduler, schema validation, repo unit tests
- Test count: **2219+ tests, 0 failures** (up from 2149)

### Changed
- Sidebar navigation: added Calculators and Challenges nav items
- Service worker: added calculators.js and challenges.js to static cache
- All 10 silent catch blocks now log warnings (improving debuggability)

## [2.0.0] — 2025-07-23

### Added — Financial Calculators & Analytics
- **SIP Calculator** (`GET /api/stats/sip-calculator`) — systematic investment plan projections with step-up support
- **Lumpsum Calculator** (`GET /api/stats/lumpsum-calculator`) — one-time investment growth projection
- **FIRE Calculator** (`GET /api/stats/fire-calculator`) — Financial Independence, Retire Early number with inflation adjustment
- **Spending Streak** (`GET /api/stats/spending-streak`) — daily spending streak tracking
- **Net Worth Trend** (`GET /api/stats/net-worth-trend`) — historical net worth snapshots
- **Financial Snapshot** (`GET /api/stats/financial-snapshot`) — comprehensive financial health overview
- **Savings Rate History** (`GET /api/stats/savings-rate-history`) — monthly savings rate tracking
- **Goal Milestones** (`GET /api/stats/goal-milestones`) — goal progress milestones and projections
- **Month Comparison** (`GET /api/stats/month-comparison`) — side-by-side month spending/income comparison

### Added — Gamification
- **Savings Challenges** (`GET/POST/DELETE /api/stats/challenges`) — create/track/delete savings challenges with progress calculation
- Migration `026_savings_challenges.sql` — savings challenges table

### Added — Testing & Quality
- **v2 Validation Tests** — 19 tests for bounded params, EMI bounds, budget dates, rate limiter
- **v2 Schema Hardening Tests** — 17 tests for transfer validation, CSV bounds, edge cases
- **v2 Financial Calculator Tests** — 19 tests for SIP/lumpsum/FIRE service unit tests
- **v2 New Feature Tests** — 21 tests for snapshot, savings rate, milestones, auth enforcement
- **v2 Gamification Tests** — 16 tests for challenges CRUD, progress, month comparison
- **v2 Performance Tests** — 26 tests for large datasets, concurrent requests, data integrity, fuzzing
- **v2 Regression Suite** — 44 tests for auth enforcement, cross-user isolation, OWASP, stress testing
- Test count: **2149+ tests, 0 failures** (up from 1987)

### Changed — Architecture
- **Stats Service extraction** (`src/services/stats.service.js`) — EMI, SIP, lumpsum, FIRE calculators moved to dedicated service (SOLID)
- **Split rounding fairness** — remainder pennies now distributed round-robin instead of always to last member
- **Stats endpoint caching** — `/api/stats/*` now cached (60s) with transaction/account invalidation
- **Budget schema refactored** — base schema separated from refinement for Zod v4 `.partial()` compatibility

### Changed — Validation Hardening
- EMI calculator: principal capped at 1e12, rate 0.01-50%, tenure 1-600 months
- Stats trends: `months` parameter capped at 120
- Transaction schema: transfer/category mutual exclusivity enforced via Zod refinements
- Account schema: currency validated with `/^[A-Z]{3}$/`, balance bounds ±1e15, account_number_last4 digits-only
- CSV import: date bounds (>=1900, <=tomorrow), amount bounds (>0, <=1e15)

### Added — Performance
- Migration `027_performance_indexes_v2.sql` — composite indexes for v2 query patterns
- Rate limiter cleanup job (hourly) added to scheduler

### Security
- All 12 new endpoints verified to require authentication (401 without token)
- Cross-user data isolation verified for all new features
- SQL injection protection verified on all parameter inputs
- No sensitive data leaked in error responses
- OWASP Top 10 re-verified for all new endpoints

## [1.0.0] — 2025-07-22

### Added — Financial Features
- **EMI Calculator** (`GET /api/stats/emi-calculator`) — loan EMI with full amortization schedule
- **Subscription Savings** (`GET /api/stats/subscription-savings`) — subscription cost analysis and savings potential
- **Budget Variance** (`GET /api/stats/budget-variance`) — planned vs actual spending analysis
- **Debt Payoff** (`GET /api/stats/debt-payoff`) — snowball and avalanche repayment strategies
- **Tax Summary** (`GET /api/stats/tax-summary`) — Indian 80C/80D tax deduction tracking

### Added — Testing & Quality
- **Release verification suite** — 42-test E2E covering full user journeys, OWASP security, performance benchmarks, auth enforcement, data integrity
- **Reliability tests** — 39 tests for concurrent operations, error paths, session edge cases, large datasets, scheduler verification
- **Financial feature tests** — 29 tests for EMI calculator, budget variance, subscription savings, health score, cash flow
- **Indian market tests** — 25 tests for tax summary, debt payoff, onboarding, branding, multi-currency INR
- **Transaction template tests** — 24 tests for template CRUD and from-template creation
- **Calendar tests** — 13 tests for calendar view API
- **What's new tests** — 10 tests for changelog API
- All 22 protected endpoints verified to require auth (401 without token)

### Added — DevOps
- `scripts/backup.sh` — SQLite backup script with automatic rotation (keeps last 10)
- `scripts/setup-autostart.sh` — systemd service installer for Docker auto-start on boot
- Docker Compose: healthcheck, container naming, `restart: always`
- Package.json docker scripts rewired to use compose

### Changed
- Eliminated all 45 ESLint warnings (0 errors, 0 warnings)
- Removed dead code: unused CSRF import, unused repository imports, unused schema imports
- Strict equality (`!==`) throughout — replaced all loose `!=` comparisons
- `let` → `const` where variables are never reassigned
- Catch block parameter naming: `catch(_e)` pattern for unused errors
- Test count: **1987+ tests, 0 failures** (up from 1757)

### Fixed
- `src/server.js` — removed unused CSRF middleware import
- `src/routes/accounts.js` — removed unused transaction repository imports
- `src/routes/net-worth.js` — removed unused exchange rate repository imports
- `src/routes/recurring.js` — removed unused VALID_FREQUENCIES constant
- `src/routes/recurring-suggestions.js` — removed unused computePatternHash import
- `src/routes/goals.js` — removed unused contributeSchema import
- `src/routes/auth.js` — removed unused accountDeleteSchema import
- `src/db/seed.js` — removed unused crypto import

### Security
- OWASP Top 10 verification: SQL injection, XSS, IDOR, auth bypass all tested
- All protected endpoints verified to return 401 without valid session token
- Password hashes never returned in API responses
- Security headers (X-Content-Type-Options, CSP) verified present

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
