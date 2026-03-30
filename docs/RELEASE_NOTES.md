# PersonalFi — Release Notes (v0.3.26 → v0.3.50)

**Release Candidate — v0.3.50** | 30 March 2026

---

## Summary

PersonalFi v0.3.50 is the release candidate, completing 25 iterations of backend hardening, security improvements, UI polish, and comprehensive test coverage. The test suite now contains **1440 tests** across 80+ test files, all passing.

---

## Features by Category

### Security & Authentication
- **v0.3.26** — Missing Zod schemas & input validation for all routes
- **v0.3.27** — Session token hashing (SHA-256), API token expiry enforcement
- **v0.3.34** — Audit log retention policies, per-user rate limiting middleware
- **v0.3.36** — Admin password reset, TOTP two-factor authentication (setup/verify/disable)
- **v0.3.45** — Backup encryption support, CORS origin configuration
- **v0.3.48** — Fuzz testing & security sweep (input boundary testing)

### Backend & API
- **v0.3.28** — Cache invalidation by tags, request timeout middleware
- **v0.3.29** — Group & split repository extraction (repository pattern)
- **v0.3.37** — Goal-transaction linking, savings auto-allocation on income
- **v0.3.38** — Demo mode with sample data seeding
- **v0.3.40** — Report export (CSV/JSON), year-in-review endpoint
- **v0.3.41** — Spending limits & smart spending alerts
- **v0.3.42** — Split payment reminders, group activity feed
- **v0.3.47** — Instance branding configuration, What's New changelog endpoint
- **v0.3.49** — API v1 versioning (`/api/v1/` prefix), metrics dashboard, deployment docs

### UI & Frontend
- **v0.3.30** — Notification UI with real-time unread badge
- **v0.3.31** — Dashboard chart rendering with Chart.js integration
- **v0.3.32** — Search UI & insights visualization
- **v0.3.35** — Recurring transaction suggestions UI, financial calendar view
- **v0.3.39** — Responsive tables & mobile-first layout
- **v0.3.43** — Loading, empty & error state components (frontend polish)
- **v0.3.44** — WCAG 2.1 AA accessibility compliance
- **v0.3.46** — Client-side form validation & pagination controls

### Testing & Quality
- **v0.3.33** — Stress tests with 10,000+ transaction datasets
- **v0.3.48** — Fuzz testing for all input surfaces
- **v0.3.50** — **Full integration E2E sweep** — 28 end-to-end tests covering:
  - Complete user lifecycle (register → login → CRUD → reports → logout)
  - TOTP 2FA full cycle (enable → login with code → disable)
  - Budget → transaction → utilization tracking
  - Spending limits → transaction → alert verification
  - Goal → transaction linking → progress tracking
  - Group expense splitting → settlement → balance verification
  - Recurring rules → calendar view integration
  - Cross-feature search (transactions, accounts, categories, tags)
  - Transaction export → CSV content verification
  - Year-in-review calculations with real data
  - Data integrity (cascading deletes, category deletion handling)
  - Chart & insight data updates on transaction creation
  - Multi-user data isolation
  - Concurrent operations on shared resources
  - Large batch operations (50+ transactions)
  - Invalid/expired token rejection across all endpoints
  - API v1 prefix complete workflow
  - Subscription → dashboard stats integration
  - Net worth calculation across account types
  - Settings & preferences persistence roundtrip
  - Health & version endpoint validation

---

## Breaking Changes

None. All API endpoints maintain backward compatibility. The `/api/v1/` prefix aliases all `/api/` routes transparently.

---

## Test Coverage Summary

| Metric | Value |
|--------|-------|
| Total tests | **1440** |
| Test suites | **436** |
| Test files | **80+** |
| Pass rate | **100%** |
| Runtime | ~15s |

### Test categories
- Unit & repository tests
- Route-level API tests (all endpoints)
- Schema validation tests
- Security & auth tests (CSRF, session, token, 2FA)
- Performance & stress tests
- Fuzz tests
- Integration & E2E workflow tests
- Accessibility tests
- Data integrity & migration tests

---

## Stack

- **Runtime:** Node.js 22
- **Framework:** Express 5
- **Database:** better-sqlite3 (SQLite)
- **Auth:** bcryptjs + SHA-256 session tokens + TOTP (otpauth)
- **Validation:** Zod 4
- **Testing:** Node.js built-in test runner + supertest
