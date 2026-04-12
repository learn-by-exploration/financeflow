# FinanceFlow — Claude Code Configuration

> **Last updated:** 12 April 2026 · **Version:** 8.0.0
> **Metrics:** 94 test files | Port 3457 | ~TBD LOC

## Project Overview

FinanceFlow is a self-hosted personal finance manager. Zero cloud, zero telemetry, full data ownership. Budgeting, expense splitting, and financial health tracking on your own server.

Multi-user Express.js backend + vanilla JS SPA frontend. SQLite via better-sqlite3.

> **Shared standards** (git workflow, security rules, testing strategy, backend service architecture,
> error handling, anti-patterns, documentation requirements) are in the parent repo's `CLAUDE.md`.
> All standards defined there apply here. This file covers FinanceFlow-specific structure and conventions only.

## Quick Start

```bash
npm install
node src/server.js          # http://localhost:3457
npm test                    # via node:test + c8
# or with Docker:
docker compose up --build -d
```

## Quick Commands

```bash
npm start                     # Start server (port 3457)
npm run dev                   # Dev mode with file watching + pino-pretty
npm run test:fast              # All tests without coverage
npm test                       # All tests with c8 coverage report
npm run lint                   # ESLint on src/, tests/, public/
npm run format:check           # Check formatting
npm run validate               # lint + format + test + audit (full gate)
npm run build:docker           # Build production Docker image
npm run seed                   # Seed demo data (user: demo / pass: demo123)
docker compose up --build -d   # Build and run via compose
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
│   ├── seed.js            # Demo data seeder (demo/demo123)
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
├── js/
│   ├── app.js             # SPA routing, shortcuts, themes, vim mode
│   ├── utils.js           # Shared utilities (toast, API client, el())
│   ├── charts.js          # Dashboard charts (dynamic theme colors)
│   ├── views/             # 18 view modules
│   └── vendor/chart.min.js
├── css/                   # login.css, landing.css
└── fonts/                 # Self-hosted Inter + Material Icons

tests/                     # 94 test files
├── helpers.js             # setup(), agent(), makeAccount()
└── *.test.js              # Domain, phase, UX, security tests
```

## Architecture

- **Layered**: routes → services → repositories → db
- **Error classes**: AppError, NotFoundError, ValidationError, ForbiddenError, ConflictError, UnauthorizedError + global error middleware
- **Auth**: X-Session-Token header, SHA-256 hashed in sessions table
- **CSP**: Strict — no unsafe-inline, no CDN domains
- **CORS**: Same-origin default (configurable via CORS_ORIGINS)
- **Rate limiting**: Global 200/min, per-user 100/min, auth 20/15min
- **Cache**: In-memory LRU (200 default)
- **PWA**: Service worker with cache-first static, offline mutation queue (IndexedDB)

## Database

- SQLite — better-sqlite3, WAL mode, foreign keys ON
- 25 migrations (additive only, never drop tables, named `NNN_description.sql`)
- Single file: `personalfi.db` (location via `DB_DIR` env)
- Key tables: users, sessions, accounts, transactions, categories, budgets, goals, groups, splits, recurring_rules, subscriptions, notifications, audit_log, transactions_fts (FTS5)

## Key Conventions

1. **Backend**: CommonJS (`require/module.exports`). **Frontend**: ES modules (`import/export`).
2. **Zod v4**: `safeParse()` returns `{success, data, error}`. Use `result.issues` not `result.errors`.
3. **Test helpers**: `setup()` → `{app, db}`, `agent(app)` → authenticated supertest agent. Each file gets fresh in-memory DB.
4. **Error responses**: `{ error: { code: 'ERROR_CODE', message: '...' } }`
5. **Frontend state**: All user prefs use `pfi_*` localStorage keys (e.g., `pfi_theme`, `pfi_sidebar`, `pfi_token`, `pfi_shortcuts`, `pfi_vim`, `pfi_onboarding_done`, `pfi_privacy_accepted`).
6. **CSS**: All colors via custom properties across 6 themes (dark, light, forest, ocean, rose, nord). Transitions via `--transition-fast` / `--transition-medium` tokens.
7. **Accessibility**: ARIA attributes on all interactive elements, keyboard navigation, `prefers-reduced-motion` support.
8. **SW versioning**: Bump `CACHE_NAME` in `public/sw.js` on every release. Old caches auto-purge on activate.

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

## Testing

| Category | Command | Scope |
|----------|---------|-------|
| Full suite | `npm run test:fast` | All tests |
| With coverage | `npm test` | Full + c8 report |
| Auth | `npm run test:auth` | Auth, sessions, tokens |
| Security | `npm run test:security` | Injection, hardening |
| Performance | `npm run test:perf` | Load, stress |
| Frontend | `npm run test:frontend` | UX phases 1-3 |
| Single file | `node --test tests/FILE.test.js` | One file |

**Patterns:** API tests use supertest + in-memory SQLite. Frontend tests use file-content assertions. Rate limiting disabled in test mode.

## Production Checklist

- [ ] `npm run validate` passes (lint + format + test + audit)
- [ ] Docker builds: `npm run build:docker`
- [ ] Health check responds: `GET /api/health/live`
- [ ] SW `CACHE_NAME` version bumped in `public/sw.js`
- [ ] Demo user seeded if needed: `docker exec <container> node src/db/seed.js`

## Docker

```bash
# Production run
docker run -d --name financeflow \
  -p 3457:3457 \
  -v financeflow-data:/app/data \
  --read-only \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp \
  --memory 512m \
  financeflow:latest
```

Data persisted via named volume. Container: non-root user, read-only FS, memory-limited.

**Data is safe across:** container restarts, removal, rebuilds, system reboots.
**Data is lost only with:** `docker volume rm financeflow-data` or `docker system prune --volumes`.

## Documentation Update Requirements

**After every code change, update these docs as applicable:**

| Change Type | Must Update |
|-------------|------------|
| New/changed API endpoint | CLAUDE.md § Architecture |
| New DB table or column | CLAUDE.md § Database |
| New frontend view | CLAUDE.md § Key Conventions |
| New feature shipped | CLAUDE.md, CHANGELOG.md |
| New test file or 20+ tests added | CLAUDE.md § Testing metrics |
| Architecture change | CLAUDE.md § Architecture |
| Breaking change | CHANGELOG.md with migration notes |
| Version bump | CLAUDE.md header, `package.json` |

## Rules

- ALWAYS read a file before editing it
- ALWAYS update documentation after code changes (see Documentation Update Requirements)
- After changing backend files, restart: `pkill -f "node src/server" && node src/server.js &`
- After changing frontend files, hard-refresh browser (`Ctrl+Shift+R`) — browser caches aggressively
- Express route order matters: static routes MUST come before parameterized routes
- SQLite WAL files (`.db-shm`, `.db-wal`) and `backups/` are gitignored
- No build step, no bundler, no framework — edit and reload
- All API routes require authentication except `/api/auth/*`, `/api/health/*`
- All write endpoints validate input via Zod schemas
- Error responses follow `{ error: { code, message } }` format
- No new npm dependencies without explicit approval
- No `innerHTML` with user/dynamic data — use `textContent` or `el()` helper
- No CDN, no external resources, no analytics — self-hosted everything
- Run `npm test` after every change to ensure no regressions

---

## GAN Development Protocol (Optional)

> This protocol can be used for high-rigor feature development when explicitly requested.

### STAGE 1: Architectural Alignment
Before any new feature/system:
1. Analyze requirements → output plan (tech stack, data flow, component breakdown, test tools).
2. **Wait for explicit user approval** before proceeding to Stage 2.

### STAGE 2: GAN TDD Loop (Per Component)

| Step | Actor | Action |
|------|-------|--------|
| 1 | **Generator** | Write failing test suite (Red) |
| 2 | **Discriminator** | Review tests — comprehensive? Edge cases? → `[PASS]` or `[REJECT]` |
| 3 | **Generator** | Write minimal production code (Green) |
| 4 | **Discriminator** | Attack code — perf, coupling, security → `[PASS]` or `[REJECT]` with bullet points |

`[REJECT]` → Generator rewrites. Only dual `[PASS]` → present to user → approval → next component.
