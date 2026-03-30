# Contributing to FinanceFlow

Thank you for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/learn-by-exploration/financeflow.git
cd financeflow
npm install
npm run dev        # Start dev server (auto-restarts on file changes)
npm test           # Run all tests with coverage
npm run test:fast  # Run tests without coverage (faster)
```

## Project Structure

```
src/
├── server.js          # Express app setup + middleware
├── config.js          # Environment configuration
├── logger.js          # Pino logger
├── scheduler.js       # Background task scheduler
├── db/
│   ├── index.js       # Database schema + initialization
│   ├── migrate.js     # Migration runner
│   ├── migrations/    # SQL migration files (018 and counting)
│   └── seed.js        # Demo data seeder
├── middleware/         # Express middleware (auth, cache, CORS, rate-limit, etc.)
├── routes/            # API route handlers (37 files)
├── repositories/      # Database access layer (20 files)
├── schemas/           # Zod validation schemas
└── services/          # Business logic services

public/
├── index.html         # SPA shell
├── login.html         # Auth page
├── styles.css         # Global stylesheet
├── sw.js              # Service worker (PWA)
├── manifest.json      # PWA manifest
├── js/
│   ├── app.js         # SPA entry point + routing
│   ├── utils.js       # Shared utilities (API, toast, el, fmt)
│   └── views/         # Lazy-loaded view modules (18 views)
├── fonts/             # Self-hosted Inter + Material Icons
└── js/vendor/         # Chart.js (self-hosted)

tests/                 # node:test + supertest (1500+ tests)
docs/                  # API docs, deployment guide, design docs
```

## Architecture

FinanceFlow follows a layered architecture:

```
Frontend (Vanilla JS SPA)
    ↓ fetch() with X-Session-Token
API Routes (Express 5)
    ↓ Zod validation
Services (Business logic)
    ↓
Repositories (SQL queries)
    ↓
better-sqlite3 (WAL mode)
```

## Adding a Feature

1. Create a migration in `src/db/migrations/` if schema changes needed
2. Create/update repository in `src/repositories/`
3. Add Zod schema in `src/schemas/` if new input validation needed
4. Create/update route in `src/routes/`
5. Register route in `src/server.js`
6. Add frontend view in `public/js/views/`
7. Write tests in `tests/`

## Running Tests

```bash
npm test              # All tests with coverage
npm run test:fast     # All tests without coverage
npm run test:auth     # Auth tests only
npm run test:security # Security tests only
npm run test:perf     # Performance tests only

# Single file
node --test tests/auth.test.js
```

## Code Style

- Use Prettier (config in `.prettierrc`)
- CommonJS for backend (`require`/`module.exports`)
- ES Modules for frontend (`import`/`export`)
- Zod v4 for validation (use `.issues` not `.errors`)

## Pull Request Process

1. Write tests first (TDD)
2. Ensure all tests pass: `npm test`
3. Keep commits focused and descriptive
4. Update docs if adding new API endpoints
