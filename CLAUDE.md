# CLAUDE.md — FinanceFlow Developer Context

## What is this?

FinanceFlow is a self-hosted personal finance manager. Zero cloud, zero telemetry, full data ownership. Built for privacy-conscious users who want budgeting, expense splitting, and financial health tracking on their own server.

## Tech Stack

- **Runtime**: Node.js 22+
- **Backend**: Express 5, better-sqlite3 (WAL mode)
- **Frontend**: Vanilla JS SPA (ES modules), no framework, no build step
- **Auth**: bcryptjs, SHA-256 hashed session tokens (X-Session-Token header), optional TOTP 2FA
- **Validation**: Zod v4 (uses `.issues` not `.errors`, `safeParse()`)
- **Testing**: node:test + supertest + c8 (coverage), 1767+ tests across 94 files
- **Logging**: Pino (structured JSON)
- **Container**: Docker multi-stage (node:22-slim), read-only filesystem, non-root user
- **CI/CD**: GitHub Actions (lint, test matrix, audit, coverage, Docker build)

## Quick Commands

```bash
# ─── Development ───
npm start                     # Start server (port 3457)
npm run dev                   # Dev mode with file watching + pino-pretty

# ─── Testing ───
npm run test:fast              # All 1767+ tests without coverage (~15s)
npm test                       # All tests with c8 coverage report
npm run test:auth              # Auth & session tests only
npm run test:security          # Security-focused tests
npm run test:perf              # Performance & stress tests
npm run test:frontend          # Frontend file-content tests (UX)
node --test tests/FILE.test.js # Single test file

# ─── Code Quality ───
npm run lint                   # ESLint on src/, tests/, public/
npm run lint:fix               # Auto-fix lint issues
npm run format                 # Prettier format all code
npm run format:check           # Check formatting without changing

# ─── Build & Deploy ───
npm run build:docker           # Build production Docker image
npm run docker:run             # Run container locally (port 3457)
npm run docker:stop            # Stop and remove container
docker compose up --build -d   # Build and run via compose

# ─── Data ───
npm run seed                   # Seed demo data
```

## Project Structure

```
src/
├── server.js              # Express app entry + middleware stack
├── config.js              # Centralized config (env vars, frozen object)
├── errors.js              # AppError hierarchy (NotFound, Validation, etc.)
├── logger.js              # Pino logger
├── db/
│   ├── index.js           # SQLite schema + migration runner
│   ├── seed.js            # Demo data seeder
│   └── migrations/        # 25 versioned SQL migrations
├── routes/                # 41 route modules
├── middleware/             # 13 middleware modules
├── services/              # 8 service modules
├── schemas/               # 19 Zod validation schemas
├── repositories/          # 20 data access modules
└── utils/                 # Password policy, etc.

public/                    # Frontend SPA (served by Express)
├── index.html             # SPA shell
├── login.html             # Auth page (tab-based login/register)
├── landing.html           # Public landing page
├── styles.css             # All CSS (6 themes, responsive, dark-first)
├── sw.js                  # Service worker (PWA offline + mutation queue)
├── manifest.json          # PWA manifest
├── js/
│   ├── app.js             # SPA routing, keyboard shortcuts, themes, vim mode
│   ├── utils.js           # Shared utilities (toast, fmt, API client, color picker)
│   ├── login.js           # Login page logic (tabs, remember-me, demo)
│   ├── charts.js          # Dashboard charts (dynamic theme colors, reduced motion)
│   ├── notifications.js   # Notification panel with click-to-navigate
│   ├── ui-states.js       # Loading, empty, error states, skeletons
│   ├── form-validator.js  # Client-side form validation
│   ├── pagination.js      # Reusable pagination component
│   ├── vendor/chart.min.js # Self-hosted Chart.js
│   └── views/             # 18 view modules
├── css/
│   ├── login.css          # Login page styles
│   └── landing.css        # Landing page styles
└── fonts/                 # Self-hosted Inter + Material Icons

tests/                     # 1767+ tests across 94 files
├── helpers.js             # setup(), agent(), makeAccount(), etc.
├── *-phase*.test.js       # Phased feature tests (12 phases)
├── ux-phase*.test.js      # UX improvement tests (3 phases)
└── *.test.js              # Domain-specific tests
```

## Architecture Patterns

- **Layered**: routes → services → repositories → db
- **Error handling**: Custom error classes (AppError, NotFoundError, ValidationError, ForbiddenError, ConflictError, UnauthorizedError) + global error middleware
- **Auth**: X-Session-Token header, SHA-256 hashed tokens in sessions table, optional TOTP 2FA
- **CSRF**: Disabled (token auth prevents CSRF inherently)
- **CSP**: Strict — no unsafe-inline, no CDN domains
- **CORS**: Same-origin by default (configurable via CORS_ORIGINS env)
- **Rate limiting**: Global 200/min on /api, per-user 100/min, auth 20/15min
- **Cache**: In-memory LRU with configurable max size (200 default)
- **Audit**: Security event logging with 90-day retention
- **PWA**: Service worker with cache-first static, offline mutation queue (IndexedDB)

## Database

- SQLite via better-sqlite3 (WAL mode, foreign keys ON)
- 25 migrations in src/db/migrations/ (001-025)
- Single file: `personalfi.db` (or `DB_DIR` env for custom location)
- Key tables: users, sessions, accounts, transactions, categories, budgets, goals, groups, splits, recurring_rules, subscriptions, notifications, audit_log, transaction_templates, transactions_fts (FTS5)

## Environment Variables

All optional with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3457 | Server port |
| NODE_ENV | development | Environment |
| DB_DIR | ./ | Database directory |
| LOG_LEVEL | info | Pino log level |
| CORS_ORIGINS | (empty) | Same-origin only |
| DEFAULT_CURRENCY | INR | Default currency |
| RATE_LIMIT_MAX | 200 | Requests per minute |
| BCRYPT_SALT_ROUNDS | 12 | Password hashing cost |
| SESSION_MAX_AGE_DAYS | 30 | Session TTL |

## Key Conventions

1. **Backend**: CommonJS (`require/module.exports`), **Frontend**: ES modules (`import/export`)
2. **Zod v4**: Use `result.issues` not `result.errors`; `safeParse()` returns `{success, data, error}`
3. **Test helpers**: `setup()` returns `{app, db}`, `agent(app)` creates authenticated supertest agent
4. **Error responses**: `{ error: { code: 'ERROR_CODE', message: '...' } }`
5. **Migrations**: Additive only, never drop tables. Named `NNN_description.sql`
6. **No build step**: Frontend JS served as-is from public/
7. **Self-hosted everything**: No CDN, no external fonts, no analytics
8. **CSS variables**: All colors via custom properties, 6 themes (dark, light, forest, ocean, rose, nord)
9. **Accessibility**: ARIA attributes, keyboard navigation, reduced motion support
10. **Security first**: No innerHTML with user data, textContent for dynamic content, token auth

## Testing Strategy

### Test Categories
| Category | Command | Scope |
|----------|---------|-------|
| Full suite | `npm run test:fast` | All 1767+ tests |
| With coverage | `npm test` | Full + c8 coverage report |
| Auth | `npm run test:auth` | Auth, sessions, tokens |
| Security | `npm run test:security` | CSRF, injection, hardening |
| Performance | `npm run test:perf` | Load, stress, benchmarks |
| Frontend UX | `npm run test:frontend` | UX phases 1-3 (100 tests) |
| Single file | `node --test tests/FILE.test.js` | One test file |

### Test Patterns
- **API tests**: supertest against Express app, in-memory SQLite
- **Frontend tests**: File content assertions (string/regex matching against source files)
- **Security tests**: Injection payloads, auth bypass attempts, rate limit verification
- **Performance tests**: Response time assertions, concurrent request handling
- Rate limiting disabled in test mode (`NODE_ENV=test`)
- Each test file gets a fresh database via `setup()`

## Production Checklist

- [ ] All tests pass: `npm run test:fast`
- [ ] Lint clean: `npm run lint`
- [ ] Format clean: `npm run format:check`
- [ ] Security audit: `npm audit --audit-level=high`
- [ ] Docker builds: `npm run build:docker`
- [ ] Health check responds: `GET /api/health/live`
- [ ] Service worker version bumped in `public/sw.js`
- [ ] No console.log in production code (use Pino logger)

## Docker

```bash
# Build
docker build -t financeflow:latest .

# Run (production)
docker run -d --name financeflow \
  -p 3457:3457 \
  -v financeflow-data:/app/data \
  --read-only \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp \
  --memory 512m \
  financeflow:latest

# Compose
docker compose up --build -d
```

Container runs as non-root user, read-only filesystem, memory-limited. Data persisted via named volume.
