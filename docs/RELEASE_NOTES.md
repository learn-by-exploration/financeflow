# PersonalFi — Release Notes v2.0.0

**Major Release — v2.0.0** | 23 July 2025

---

## Summary

PersonalFi v2.0.0 is a major release delivering financial calculators, analytics, gamification, and significant hardening across validation, performance, and security. 50 iterations of development since v1.0.0. The test suite now contains **2149+ tests** across 112+ test files, all passing with zero lint warnings.

---

## Highlights

### Financial Calculators
- **SIP Calculator** — Project systematic investment plan returns with step-up (annual increase) support
- **Lumpsum Calculator** — One-time investment growth projection with yearly breakdown
- **FIRE Calculator** — Calculate your Financial Independence number accounting for inflation
- **EMI Calculator** — Enhanced with tighter bounds and extracted to dedicated service

### Analytics & Insights
- **Spending Streak** — Track daily spending patterns and streaks
- **Net Worth Trend** — Historical net worth snapshots over time
- **Financial Snapshot** — Comprehensive single-endpoint financial health overview
- **Savings Rate History** — Monthly savings rate tracking for trend analysis
- **Goal Milestones** — Track progress milestones toward financial goals
- **Month Comparison** — Side-by-side comparison of any two months

### Gamification
- **Savings Challenges** — Create, track, and complete savings challenges with progress tracking

### Validation & Security Hardening
- All schema inputs validated with strict bounds (amounts, dates, currencies, rates)
- Transfer/category mutual exclusivity enforced at schema level
- Currency codes validated via regex, balance bounds enforced
- CSV import date/amount bounds prevent data corruption
- Split rounding improved: fair round-robin distribution of remainder pennies

### Performance
- Composite database indexes for v2 query patterns
- Stats endpoints cached (60s) with automatic invalidation
- Rate limiter cleanup job prevents memory leaks
- All endpoints benchmarked under load (500+ transactions, concurrent requests)

---

## New Endpoints (11)
| Endpoint | Description |
|----------|-------------|
| `GET /api/stats/sip-calculator` | SIP investment projection with step-up |
| `GET /api/stats/lumpsum-calculator` | Lumpsum investment growth |
| `GET /api/stats/fire-calculator` | FIRE number with inflation |
| `GET /api/stats/spending-streak` | Daily spending streak |
| `GET /api/stats/net-worth-trend` | Net worth time series |
| `GET /api/stats/financial-snapshot` | Full financial overview |
| `GET /api/stats/savings-rate-history` | Monthly savings rates |
| `GET /api/stats/goal-milestones` | Goal progress milestones |
| `GET /api/stats/month-comparison` | Month-to-month comparison |
| `GET/POST /api/stats/challenges` | Savings challenges CRUD |
| `DELETE /api/stats/challenges/:id` | Delete a challenge |

## New Test Files (7)
| File | Tests | Coverage |
|------|-------|----------|
| `v2-validation-fixes.test.js` | 19 | Bounded params, EMI bounds, budget dates |
| `v2-schema-hardening.test.js` | 17 | Transfer validation, CSV bounds |
| `v2-financial-calculators.test.js` | 19 | SIP, lumpsum, FIRE service tests |
| `v2-new-features.test.js` | 21 | Snapshot, savings rate, milestones |
| `v2-gamification.test.js` | 16 | Challenges CRUD, month comparison |
| `v2-performance.test.js` | 26 | Performance, integrity, fuzzing |
| `v2-regression.test.js` | 44 | Auth, OWASP, stress, edge cases |

## New Migrations (2)
| Migration | Description |
|-----------|-------------|
| `026_savings_challenges.sql` | Savings challenges table with indexes |
| `027_performance_indexes_v2.sql` | Composite indexes for v2 queries |

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
