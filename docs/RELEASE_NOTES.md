# PersonalFi — Release Notes v1.0.0

**Stable Release — v1.0.0** | 22 July 2025

---

## Summary

PersonalFi v1.0.0 is the first stable release. This version completes 50 iterations of development, testing, and hardening since v0.7.0. The test suite now contains **1987+ tests** across 100+ test files, all passing with zero lint warnings.

---

## Highlights

### Financial Intelligence
- **EMI Calculator** — Compute monthly installments with full amortization schedules for any loan
- **Budget Variance Analysis** — See exactly where you're over/under budget with category-level breakdown
- **Subscription Savings** — Identify costly subscriptions and estimate annual savings potential
- **Debt Payoff Strategies** — Compare snowball vs avalanche payoff methods with timeline projections
- **Indian Tax Summary** — Track 80C and 80D deductions automatically from categorized transactions

### Reliability & Security
- OWASP Top 10 verified — SQL injection, XSS, IDOR, auth bypass all tested
- All 22 protected endpoints enforce authentication
- Password hashes never leaked in API responses
- Security headers (X-Content-Type-Options, CSP, X-Frame-Options) verified
- Performance benchmarks: all endpoints respond under 500ms with realistic data

### DevOps
- Docker Compose with health checks, auto-restart, and container naming
- Systemd service for auto-start on server reboot
- SQLite backup script with 10-backup rotation
- Zero-downtime deployment ready

---

## What Changed Since v0.7.0

### New Endpoints (5)
| Endpoint | Description |
|----------|-------------|
| `GET /api/stats/emi-calculator` | Loan EMI with amortization schedule |
| `GET /api/stats/subscription-savings` | Subscription cost analysis |
| `GET /api/stats/budget-variance` | Budget vs actual spending |
| `GET /api/stats/debt-payoff` | Snowball/avalanche strategies |
| `GET /api/stats/tax-summary` | Indian 80C/80D tax tracking |

### New Test Files (7)
| File | Tests | Coverage |
|------|-------|----------|
| `release-verification.test.js` | 42 | E2E, OWASP, performance, data integrity |
| `reliability.test.js` | 39 | Concurrent ops, error paths, large datasets |
| `financial-features.test.js` | 29 | EMI, variance, subscriptions, health score |
| `indian-market-ux.test.js` | 25 | Tax, debt payoff, onboarding, branding |
| `transaction-templates.test.js` | 24 | Template CRUD, from-template creation |
| `calendar.test.js` | 13 | Calendar view API |
| `whats-new.test.js` | 10 | Changelog API |

### Code Quality
- Eliminated all 45 ESLint warnings → **0 errors, 0 warnings**
- Removed dead code across 15+ files (unused imports, unreachable variables)
- Strict equality (`!==`) enforced throughout codebase
- `let` → `const` for all never-reassigned variables

---

## Previous Releases (v0.3.26 → v0.3.50)

### Security & Authentication
- v0.3.26 — Missing Zod schemas & input validation for all routes
- v0.3.27 — Session token hashing (SHA-256), API token expiry enforcement
- v0.3.34 — Audit log retention policies, per-user rate limiting middleware
- v0.3.36 — Admin password reset, TOTP two-factor authentication
- v0.3.45 — Backup encryption support, CORS origin configuration
- v0.3.48 — Fuzz testing & security sweep

### Backend & API
- v0.3.28 — Cache invalidation by tags, request timeout middleware
- v0.3.29 — Group & split repository extraction
- v0.3.37 — Goal-transaction linking, savings auto-allocation
- v0.3.38 — Demo mode with sample data seeding
- v0.3.40 — Report export (CSV/JSON), year-in-review endpoint
- v0.3.41 — Spending limits & smart spending alerts
- v0.3.42 — Split payment reminders, group activity feed
- v0.3.47 — Instance branding configuration, What's New changelog
- v0.3.49 — API v1 versioning, metrics dashboard, deployment docs

### UI & Frontend
- v0.3.30 — Notification UI with real-time unread badge
- v0.3.31 — Dashboard chart rendering with Chart.js
- v0.3.32 — Search UI & insights visualization
- v0.3.35 — Recurring transaction suggestions UI, financial calendar
- v0.3.39 — Responsive tables & mobile-first layout
- v0.3.43 — Loading, empty & error state components
- v0.3.44 — WCAG 2.1 AA accessibility compliance
- v0.3.46 — Client-side form validation & pagination controls

---

## Breaking Changes

None. All existing API endpoints maintain backward compatibility.

---

## Test Coverage Summary

| Metric | Value |
|--------|-------|
| Total tests | **1987+** |
| Test files | **100+** |
| Pass rate | **100%** |
| Lint errors | **0** |
| Lint warnings | **0** |

---

## Stack

- **Runtime:** Node.js 22
- **Framework:** Express 5
- **Database:** better-sqlite3 (SQLite, WAL mode)
- **Auth:** bcryptjs + SHA-256 session tokens + optional TOTP 2FA
- **Validation:** Zod 4
- **Testing:** Node.js built-in test runner + supertest + c8 coverage
- **Container:** Docker multi-stage (node:22-slim), read-only FS, non-root user

---

## Upgrade Path

From v0.7.0:
```bash
git pull origin main
npm install
npm run validate    # lint + format + test + audit
npm run build:docker
```

No database migrations needed. All changes are additive code-only.
