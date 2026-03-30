# CLAUDE.md — FinanceFlow Developer Context

## What is this?

FinanceFlow is a self-hosted personal finance manager. Zero cloud, zero telemetry, full data ownership. Built for privacy-conscious users who want budgeting, expense splitting, and financial health tracking on their own server.

## Tech Stack

- **Runtime**: Node.js 22+
- **Backend**: Express 5, better-sqlite3 (WAL mode)
- **Frontend**: Vanilla JS SPA, no framework, no build step
- **Auth**: bcryptjs, SHA-256 hashed session tokens (X-Session-Token header)
- **Validation**: Zod v4 (uses `.issues` not `.errors`, `safeParse()`)
- **Testing**: node:test + supertest + c8 (coverage)
- **Logging**: Pino (structured JSON)
- **Container**: Docker multi-stage (node:22-slim)

## Quick Commands

```bash
npm start                    # Start server (port 3457)
npm run dev                  # Dev mode with file watching + pino-pretty
npm test                     # Run all tests with coverage (c8)
npm run test:fast             # Tests without coverage
npm run lint                 # ESLint on src/ and tests/
npm run lint:fix             # Auto-fix lint issues
npm run format               # Prettier format
npm run seed                 # Seed demo data
docker compose up --build -d # Build and run in Docker
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
├── login.html             # Auth page
├── styles.css             # All CSS (responsive, single dark theme)
├── sw.js                  # Service worker (PWA offline)
├── js/
│   ├── app.js             # SPA routing, keyboard shortcuts
│   ├── utils.js           # Shared utilities (toast, fmt, API client)
│   ├── login.js           # Login page logic
│   ├── vendor/chart.min.js # Self-hosted Chart.js
│   └── views/             # View modules (18 views)
├── css/login.css
└── fonts/                 # Self-hosted Inter + Material Icons

tests/                     # 1,667+ tests across 40+ files
├── helpers.js             # setup(), agent(), makeAccount(), etc.
└── *.test.js
```

## Architecture Patterns

- **Layered**: routes → services → repositories → db
- **Error handling**: Custom error classes (AppError, NotFoundError, ValidationError, ForbiddenError, ConflictError, UnauthorizedError) + global error middleware
- **Auth**: X-Session-Token header, SHA-256 hashed tokens in sessions table
- **CSRF**: Disabled (token auth prevents CSRF inherently)
- **CSP**: Strict — no unsafe-inline, no CDN domains
- **CORS**: Same-origin by default (configurable via CORS_ORIGINS env)
- **Rate limiting**: Global 200/min on /api, per-user 100/min, auth 20/15min
- **Cache**: In-memory LRU with configurable max size (200 default)
- **Audit**: Security event logging with 90-day retention

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

1. **CommonJS** (`require/module.exports`), not ESM
2. **Zod v4**: Use `result.issues` not `result.errors`; `safeParse()` returns `{success, data, error}`
3. **Test helpers**: `setup()` returns `{app, db}`, `agent(app)` creates authenticated supertest agent
4. **Error responses**: `{ error: { code: 'ERROR_CODE', message: '...' } }`
5. **Migrations**: Additive only, never drop tables. Named `NNN_description.sql`
6. **No build step**: Frontend JS served as-is from public/
7. **Self-hosted everything**: No CDN, no external fonts, no analytics

## Testing

```bash
# Run all (1,667+ tests)
npm run test:fast

# By category
npm run test:auth
npm run test:security
npm run test:perf

# Single file
node --test tests/transactions.test.js
```

Test database is in-memory per run. Rate limiting disabled in test mode.
