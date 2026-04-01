# PersonalFi — Release Notes v3.0.0

**Major Release — v3.0.0** | 1 April 2026

---

## Summary

PersonalFi v3.0.0 focuses on security hardening, architectural cleanup, and making existing features accessible through the UI. 10 expert-reviewed iterations delivered attachment path traversal fixes, silent error logging, schema validation for previously unvalidated routes, stats repository extraction, recurring pause/resume, subscription alerts, and two new frontend views (Calculators, Challenges). The test suite now contains **2219+ tests** across 114 test files, all passing with zero lint warnings.

---

## Highlights

### Security Hardening
- **Attachment path traversal blocked** — file paths validated against uploads directory before read/delete
- **Silent catches eliminated** — 10 catch blocks now log warnings via Pino structured logging
- **Rule schema validation** — category rules now validated with Zod (pattern max length, type checks)
- **Report schema** — year, month, date range params validated with Zod regex patterns

### Architecture
- **Stats repository extracted** — 13 SQL queries moved from stats.js to stats.repository.js (SRP principle)
- Overview, trends, and category-breakdown use repository layer

### New Features
- **Recurring pause/resume** — dedicated endpoints to deactivate/reactivate recurring rules
- **Subscription alerts** — GET /api/subscriptions/upcoming returns renewals within N days
- **Calculators UI** — tabbed SIP, Lumpsum, EMI, FIRE calculator frontend view
- **Challenges UI** — gamification dashboard with progress bars, create/delete challenges

### Testing
- 70 new tests across 2 test files
- All 20 frontend views verified to exist
- Scheduler edge cases (date advancement, month boundaries)
- Stats repository unit tests
- Total: **2219 tests, 0 failures, 0 lint warnings**

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
