# PersonalFi — Implementation Plan

> **Spec:** [spec.md](spec.md) v0.2 | **Date:** 29 March 2026 | **Status:** Ready for execution (revised post-panel review)
> **Review:** [review-panel.md](review-panel.md) — 32 findings incorporated below
> **Approach:** Test-driven development — every task writes tests FIRST, then implements

---

## Design Decisions (from Panel Review)

These decisions resolve the 13 high/medium-severity findings from the expert panel review before implementation begins.

| Review # | Finding | Decision |
|----------|---------|----------|
| C1 | No onboarding / empty states | Added Task 6.3 — onboarding wizard + empty states per view |
| C2 | No mobile responsive spec | Added Task 6.4 — mobile breakpoints, bottom tab bar, 44px touch targets |
| C8 | CSV import overscoped | **v1: own template only.** No auto-detection of date format/delimiter. Simplified Task 4.1 |
| C9 | Shared budgets underspecified | **Deferred to v2.** Removed Task 2.3. Schema stays, no routes until fully designed |
| C15 | Name mismatch (repo vs app) | **Action required before Phase 0:** rename GitHub repo to `personalfi` OR rename app to FinanceFlow. Owner decides. |
| C17 | No service layer despite spec | **Extract services for complex modules only** after tests are green: transactions, splits, health, scheduler. Simple CRUD stays in routes. Added Task 1.8, 2.3, 3.5 |
| C20 | Settings table has no routes | Added Task 1.8 — settings CRUD (key-value: default_currency, date_format) |
| C22 | Transaction amount update blocked | **Allow amount/type updates** with delta-based balance recalculation. Updated Task 1.4 |
| C23 | No multi-user tests | Added `makeSecondUser()` to Task 0.2. Added multi-user tests to Tasks 2.1, 2.2 |
| C25 | Session TTL undefined | **30-day TTL.** Scheduler cleanup removes expired. Added to Task 1.1 and 3.4 |
| C27 | No rounding policy for splits | **Remainder goes to the payer.** Round to 2 decimal places, last member absorbs remainder. Added to Task 2.2 |
| C28 | No user journey integration tests | Added Task 7.3 — 3 end-to-end journey tests |
| C30 | Audit log untested | Added spot-check audit assertions to Tasks 1.2, 1.4, 2.2 |

### Findings accepted but not blocking v1

| Review # | Finding | Disposition |
|----------|---------|-------------|
| C3 | Split method UX complex | UX detail — default to "equal", advanced accordion. Handled in Task 6.2 |
| C4 | No loading/error/offline state patterns | Define UX patterns at start of Phase 6 |
| C5 | Health score visualization undefined | Handled in Task 6.2 (health view) |
| C6 | No user stories | Spec-level addition — doesn't change plan tasks |
| C7 | No feature prioritization | Phase ordering IS the prioritization: core → collab → analytics → data |
| C10 | No usage analytics | v2 — self-hosted privacy priority conflicts |
| C11 | No positioning statement | Marketing artifact, not code task |
| C12 | Self-hosted = niche | Acknowledged — v2 roadmap item for one-click deploy |
| C13 | No demo path | Post-v1 deliverable |
| C14 | No README strategy | Added Task 8.1 |
| C16 | No screenshots | Added to Task 8.1 |
| C18 | No API versioning | Not needed for v1, noted for v2 |
| C19 | Audit log unbounded | Added 90-day cleanup to scheduler (Task 3.4) |
| C21 | Rate limiting unspecified | Defined: auth=100/15min, API=1000/15min per IP. Added to Task 0.4 |
| C24 | No performance testing | Added Task 7.4 — performance smoke test |
| C26 | Group permissions incomplete | Expanded Task 2.1 with permission matrix |
| C29 | CSV edge cases | Simplified by C8 decision — test template-only. Updated Task 4.1 |
| C31 | Graceful shutdown untested | Added to Task 5.2 |
| C32 | Test parallelism unspecified | Each file gets own temp DB — parallel safe. Document in helpers.js |

---

## Current State Assessment

The v0.0.1 scaffold has ~60% of the spec implemented as stubs. 10 of 12 route modules exist but with gaps. No tests exist. Key infrastructure (scheduler, migrations, CSRF, export/import) is missing.

| Area | Status |
|------|--------|
| Auth routes | ✅ Complete (4/4 routes) |
| Accounts routes | ✅ Complete (4/4 routes) |
| Categories routes | ✅ Complete (4/4 routes) |
| Subscriptions routes | ✅ Complete (4/4 routes) |
| Goals routes | ✅ Complete (4/4 routes) |
| Groups routes | ✅ Complete (5/5 routes) |
| Stats routes | ✅ Complete (4/4 routes) |
| Transactions routes | ⚠️ 4/5 — missing double-entry transfers |
| Budgets routes | ⚠️ 4/5 — missing budget vs actual summary |
| Splits routes | ⚠️ 4/5 — missing delete expense, debt simplification incomplete |
| Settings routes | ❌ Missing entirely |
| Data routes | ❌ Missing entirely |
| Rules routes | ❌ Missing entirely |
| Test infrastructure | ❌ Empty tests/ directory |
| Scheduler | ❌ Not implemented |
| Migration system | ❌ Not implemented |
| CSRF middleware | ❌ Stub only |
| Service worker | ❌ Not implemented |
| Server export | ❌ Exports `app` only, needs `{ app, db }` |

---

## Feature Priority (MoSCoW)

Per review finding C7 — features ranked by "time to first value":

| Priority | Features | Phase |
|----------|----------|-------|
| **Must-have** (launch blockers) | Auth, Accounts, Transactions, Categories, Budgets, Dashboard, Settings | Phase 0-1 |
| **Should-have** (core experience) | Groups, Splits, Subscriptions, Goals, Stats | Phase 1-2 |
| **Nice-to-have** (can ship after) | Rules, Recurring, Health Score, Data export/import, CSV import | Phase 3-4 |
| **Deferred to v2** | Shared budgets, multi-currency, bank sync, notifications, receipts | — |

---

## Implementation Phases

### Phase 0: Foundation (Test Infrastructure + Server Fixes)

Everything depends on this. No feature work starts until tests can run.

**Pre-requisite (C15):** Resolve name mismatch — rename GitHub repo to `personalfi` or rename app codebase to `financeflow`. This is a one-time manual action before starting.

---

#### Task 0.1 — Fix server.js exports for testability

**Files:** `src/server.js`

**Changes:**
- Change `module.exports = app` to `module.exports = { app, db }`
- Guard `app.listen()` behind `if (!config.isTest)` so tests don't start the HTTP server
- Move server start into a function that tests can skip

**Verify:** `node -e "const s = require('./src/server'); console.log(typeof s.app, typeof s.db)"` prints `function object`

---

#### Task 0.2 — Create test helpers (tests/helpers.js)

**Files:** `tests/helpers.js`

**Pattern:** Follow lifeflow's exact pattern (temp dir, lazy init, Proxy-based agent, cleanDb, factories)

**Must include:**
- `setup()` — creates temp DB dir, requires server, creates test user + session
- `teardown()` — closes db, removes temp dir
- `cleanDb()` — deletes all rows in reverse-dependency order across all 22+ tables
- `agent()` — Proxy-based supertest that auto-injects `X-Session-Token` header
- `rawAgent()` — supertest without auth
- `today()`, `daysFromNow(n)` — UTC date helpers
- `makeSecondUser()` — creates a second user with own session, returns `{ user, token, agent }` **(C23)**
- Factory functions with override support:
  - `makeAccount(overrides)` — creates account for test user
  - `makeCategory(overrides)` — creates category for test user
  - `makeTransaction(accountId, overrides)` — creates transaction
  - `makeBudget(overrides)` — creates budget with optional items
  - `makeSubscription(overrides)` — creates subscription
  - `makeGoal(overrides)` — creates savings goal
  - `makeGroup(overrides)` — creates group + adds test user as owner
  - `makeGroupMember(groupId, overrides)` — adds member to group
  - `makeSharedExpense(groupId, paidBy, overrides)` — creates shared expense with equal splits
  - `makeRecurringRule(accountId, overrides)` — creates recurring rule

**Test parallelism (C32):** Each test file gets its own temp DB directory via `setup()`/`teardown()`. Files can run in parallel safely. Add `--test-concurrency` note in package.json scripts. Target: full suite < 30 seconds.

**Verify:** `node -e "const h = require('./tests/helpers'); const {app,db} = h.setup(); console.log('ok'); h.teardown()"` succeeds

---

#### Task 0.3 — Migration system (db/migrate.js)

**Files:** `src/db/migrate.js`, `src/db/index.js` (edit)

**Changes:**
- Create `migrate.js` following lifeflow's pattern:
  - `CREATE TABLE IF NOT EXISTS _migrations (id, name, applied_at)`
  - Read `src/db/migrations/*.sql` files sorted by name
  - Skip already-applied migrations
  - Apply new ones inside try/catch, log errors
- Call `runMigrations(db)` from `initDatabase()` after schema creation
- Create initial migration `001_category_rules.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_system INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```

**Test file:** `tests/migrations.test.js`
- Migration table exists after init
- Migration files are applied once (idempotent)
- Re-running migrations doesn't duplicate

**Verify:** `npm test` passes migration tests

---

#### Task 0.4 — Fix CSRF middleware + rate limiting config

**Files:** `src/middleware/csrf.js`

**Changes:** Implement double-submit cookie pattern (following lifeflow's csrf.js):
- On GET requests: set `csrf_token` cookie with cryptographically random 64-hex value if not present
- On state-changing requests (POST/PUT/DELETE): compare `X-CSRF-Token` header against `csrf_token` cookie
- Exempt `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`
- Return 403 with `{ error: { code: 'CSRF_FAILED', message: '...' } }` on mismatch

**Rate limiting config (C21):**
- Auth endpoints (`/api/auth/*`): 100 requests / 15 minutes per IP
- Authenticated API (`/api/*`): 1000 requests / 15 minutes per IP
- Document thresholds in config.js

**Test file:** `tests/csrf.test.js`
- Blocks POST without CSRF token → 403
- Blocks POST with mismatched token → 403
- Allows POST with matching token
- GET sets csrf_token cookie
- Auth endpoints are exempt

**Note:** In test mode, bypass CSRF — test CSRF in isolation with mockReq/mockRes, disable in normal integration tests (following lifeflow's approach).

**Verify:** `npm test` passes csrf tests

---

### Phase 1: Core Personal Finance (TDD)

The bread and butter — accounts, transactions, categories, budgets. These are **must-have launch blockers**. Each task writes tests first.

---

#### Task 1.1 — Auth tests + hardening

**Test file:** `tests/auth.test.js`

**Tests to write:**
- POST /api/auth/register: creates user, returns token + user object (201)
- POST /api/auth/register: rejects duplicate username (409)
- POST /api/auth/register: rejects missing username (400)
- POST /api/auth/register: rejects missing password (400)
- POST /api/auth/register: rejects password shorter than 8 characters (400)
- POST /api/auth/register: seeds 21 default categories for new user
- POST /api/auth/login: returns token for valid credentials (200)
- POST /api/auth/login: rejects wrong password (401)
- POST /api/auth/login: rejects non-existent user (401)
- POST /api/auth/logout: invalidates session
- GET /api/auth/me: returns user for valid session
- GET /api/auth/me: returns 401 for invalid/expired session
- **Session TTL (C25):** session created 31 days ago → returns 401
- **Session TTL (C25):** session created 29 days ago → returns 200
- All protected routes: rawAgent() returns 401

**Implementation fixes:**
- Add password length validation (min 8)
- Add session TTL check: query `WHERE created_at > datetime('now', '-30 days')` or add `expires_at` column
- Set TTL constant in config: `SESSION_TTL_DAYS: 30`

**Verify:** `npm test` — auth tests green

---

#### Task 1.2 — Accounts tests + hardening

**Test file:** `tests/accounts.test.js`

**Tests to write:**
- GET /api/accounts: returns empty array for new user (200)
- GET /api/accounts: returns accounts ordered by position
- POST /api/accounts: creates account with all fields (201)
- POST /api/accounts: uses defaults for optional fields
- POST /api/accounts: rejects missing name (400)
- POST /api/accounts: rejects invalid type (400)
- POST /api/accounts: allows negative balance (credit cards)
- PUT /api/accounts/:id: updates fields
- PUT /api/accounts/:id: returns 404 for non-existent ID
- PUT /api/accounts/:id: cannot update another user's account
- DELETE /api/accounts/:id: deletes account (200)
- DELETE /api/accounts/:id: cascades to transactions
- DELETE /api/accounts/:id: returns 404 for non-existent ID
- GET/POST/PUT/DELETE: 401 without auth
- **Audit (C30):** after POST, verify audit_log has entry with action containing 'account' and entity_id

**Verify:** `npm test` — accounts tests green

---

#### Task 1.3 — Categories tests + hardening

**Test file:** `tests/categories.test.js`

**Tests to write:**
- GET /api/categories: returns system categories after registration (21 expected)
- GET /api/categories: ordered by type then position
- POST /api/categories: creates custom category (201)
- POST /api/categories: rejects missing name (400)
- POST /api/categories: rejects invalid type (400)
- PUT /api/categories/:id: updates custom category
- PUT /api/categories/:id: blocks update of system category (is_system=1)
- DELETE /api/categories/:id: deletes custom category
- DELETE /api/categories/:id: blocks deletion of system category
- Transactions referencing deleted category get category_id SET NULL

**Verify:** `npm test` — categories tests green

---

#### Task 1.4 — Transactions tests + fix double-entry transfers + amount updates

**Test file:** `tests/transactions.test.js`

**Tests to write (CRUD):**
- GET /api/transactions: returns empty initially
- GET /api/transactions: filters by account_id, category_id, type, from, to, search
- GET /api/transactions: pagination with limit + offset
- GET /api/transactions: ordered by date DESC, id DESC
- POST /api/transactions: creates expense, debits account balance (201)
- POST /api/transactions: creates income, credits account balance (201)
- POST /api/transactions: rejects missing required fields (400)
- POST /api/transactions: rejects invalid type (400)
- POST /api/transactions: rejects zero amount (400)
- POST /api/transactions: rejects negative amount (400)
- POST /api/transactions: rejects invalid date format (400)
- **Amount update (C22):** PUT /api/transactions/:id: updates amount, recalculates balance using delta
- **Amount update (C22):** PUT /api/transactions/:id: changing amount from 100→150 adjusts account balance by -50 (expense)
- **Amount update (C22):** PUT /api/transactions/:id: changing amount from 100→50 adjusts account balance by +50 (expense)
- PUT /api/transactions/:id: updates description, note, category, date
- DELETE /api/transactions/:id: reverses balance change
- DELETE /api/transactions/:id: returns 404 for non-existent
- **Audit (C30):** after POST, verify audit_log entry exists

**Tests to write (TRANSFERS — new):**
- POST /api/transactions type=transfer: creates TWO linked transactions
- POST /api/transactions type=transfer: debits source account, credits destination
- POST /api/transactions type=transfer: both transactions linked via transfer_transaction_id
- POST /api/transactions type=transfer: rejects missing transfer_to_account_id (400)
- POST /api/transactions type=transfer: rejects transfer to same account (400)
- DELETE transfer transaction: reverses both balance changes, deletes both records
- Atomicity: if destination update fails, source balance unchanged

**Implementation changes:** `src/routes/transactions.js`
- PUT handler: allow amount and type updates with delta-based balance recalculation:
  ```
  delta = new_amount - old_amount
  if (type === 'expense') account.balance -= delta
  if (type === 'income')  account.balance += delta
  ```  
- POST handler: when `type === 'transfer'`, wrap in `db.transaction()`:
  1. Create outgoing transaction (amount as expense from source)
  2. Create incoming transaction (amount as income to destination)
  3. Link both via `transfer_transaction_id`
  4. Update both account balances
- DELETE handler: if transaction has `transfer_transaction_id`, delete paired transaction and reverse both balances

**Verify:** `npm test` — transactions tests green, transfers + amount updates tested

---

#### Task 1.5 — Budgets tests + budget vs actual summary

**Test file:** `tests/budgets.test.js`

**Tests to write (CRUD):**
- GET /api/budgets: returns budgets ordered by created_at DESC
- GET /api/budgets/:id: returns budget with items (category names/icons)
- POST /api/budgets: creates budget with items (201)
- POST /api/budgets: rejects missing name (400)
- POST /api/budgets: rejects invalid period (400)
- PUT /api/budgets/:id: updates budget name, period
- DELETE /api/budgets/:id: cascades to budget_items

**Tests to write (SUMMARY — new route):**
- GET /api/budgets/:id/summary: returns per-category { allocated, spent, remaining }
- GET /api/budgets/:id/summary: spent calculated from actual transactions in budget period
- GET /api/budgets/:id/summary: categories with no spending show spent=0
- GET /api/budgets/:id/summary: spending without budget allocation shown as "unbudgeted"
- GET /api/budgets/:id/summary: total_allocated, total_spent, total_remaining
- GET /api/budgets/:id/summary: returns 404 for non-existent budget

**Implementation changes:** `src/routes/budgets.js`
- Add GET `/:id/summary` route:
  1. Load budget + items
  2. Calculate period date range (start_date to end_date, or derive from period type)
  3. Query transactions for user in that date range, grouped by category_id
  4. Join against budget_items to produce allocated vs spent per category
  5. Return structured response

**Verify:** `npm test` — budgets tests green, summary route tested

---

#### Task 1.6 — Subscriptions tests

**Test file:** `tests/subscriptions.test.js`

**Tests to write:**
- GET /api/subscriptions: returns subs with total_monthly normalized amount
- POST /api/subscriptions: creates subscription (201)
- POST /api/subscriptions: rejects missing name, amount, frequency (400)
- PUT /api/subscriptions/:id: updates fields including is_active toggle
- DELETE /api/subscriptions/:id: deletes subscription
- Monthly normalization: weekly (₹100) → monthly (₹433.33), quarterly (₹300) → monthly (₹100), yearly (₹1200) → monthly (₹100)

**Verify:** `npm test` — subscriptions tests green

---

#### Task 1.7 — Savings goals tests

**Test file:** `tests/goals.test.js`

**Tests to write:**
- GET /api/goals: returns goals ordered by position
- POST /api/goals: creates goal with target_amount (201)
- POST /api/goals: rejects missing name or target_amount (400)
- POST /api/goals: rejects zero/negative target_amount (400)
- PUT /api/goals/:id: updates current_amount, marks is_completed when current >= target
- DELETE /api/goals/:id: deletes goal

**Verify:** `npm test` — goals tests green

---

#### Task 1.8 — Settings routes + service extraction (C17, C20)

**Files:** `src/routes/settings.js`, `tests/settings.test.js`

**Tests to write:**
- GET /api/settings: returns all settings for user (default_currency: "INR", date_format: "YYYY-MM-DD")
- PUT /api/settings: upserts key-value pair
- PUT /api/settings: rejects unknown keys (400) — allowlist: `default_currency`, `date_format`
- GET /api/settings: returns 401 without auth
- Settings are per-user (user A's settings don't affect user B)

**Implementation:**
- `src/routes/settings.js`: GET (list all), PUT (upsert key-value)
- Mount in server.js: `app.use('/api/settings', requireAuth, createSettingsRoutes(deps))`
- Seed default settings on user registration (add to auth.js)

**Service extraction (C17):** After all Phase 1 tests are green, extract business logic from complex route handlers:
- `src/services/transaction.service.js` — double-entry transfer logic, balance delta recalculation
- Keep simple CRUD (accounts, categories, subscriptions, goals, settings) in routes

**Verify:** `npm test` — settings tests green, transaction service extracted without breaking tests

---

### Phase 2: Collaboration (TDD)

Groups, expense splitting, debt simplification. The differentiator.

**Note (C9):** Shared budgets are **deferred to v2** — the schema stays but no routes are implemented until permissions, data flow, and UI are fully specified. Former Task 2.3 is removed.

---

#### Task 2.1 — Groups tests + hardening + permission matrix (C26)

**Test file:** `tests/groups.test.js`

**Tests to write:**
- GET /api/groups: returns only groups user belongs to
- POST /api/groups: creates group, adds creator as owner (201)
- POST /api/groups: rejects missing name (400)
- GET /api/groups/:id: returns group with members list
- GET /api/groups/:id: returns 403 for non-member
- POST /api/groups/:id/members: adds registered user by username
- POST /api/groups/:id/members: adds guest member by display_name (no user_id)
- POST /api/groups/:id/members: rejects duplicate user (409)
- DELETE /api/groups/:id/members/:memberId: removes member
- DELETE /api/groups/:id/members/:memberId: cannot remove last owner

**Multi-user tests (C23):**
- User A creates group → User B (not member) cannot GET group (403)
- User A adds User B → User B can now GET group (200)
- User A and User B both see same member list
- User B can add expenses to group (member permission)

**Permission matrix (C26):**
- Owner can: delete group, remove members, edit group name
- Member cannot: delete group (403), remove other members (403)
- Non-member cannot: access any group route (403)
- Removed member: cannot access group after removal (403)

**Verify:** `npm test` — groups tests green, multi-user + permissions verified

---

#### Task 2.2 — Expense splitting + debt simplification + rounding policy (C27)

**Test file:** `tests/splits.test.js`

**Rounding policy (C27):** All split amounts rounded to 2 decimal places. Remainder (due to rounding) is assigned to the payer. Example: ₹100 split 3 ways = ₹33.33 + ₹33.33 + ₹33.34 (payer absorbs extra ₹0.01). Tests MUST verify: `sum(all splits) === expense amount` always.

**Tests to write (expense CRUD):**
- GET /api/splits/:groupId/expenses: returns expenses with paid_by name
- GET /api/splits/:groupId/expenses: returns 403 for non-member
- POST /api/splits/:groupId/expenses: creates with equal split (auto-calculate)
- POST /api/splits/:groupId/expenses: creates with exact split amounts
- POST /api/splits/:groupId/expenses: creates with percentage split
- POST /api/splits/:groupId/expenses: creates with shares split
- POST: rejects percentage split that doesn't sum to 100 (400)
- POST: rejects exact split that doesn't sum to expense amount (400)
- DELETE /api/splits/:groupId/expenses/:id: deletes expense and its splits
- **Audit (C30):** after POST expense, verify audit_log entry

**Tests to write (rounding — C27):**
- Equal split ₹100 / 3 members: splits = [33.33, 33.33, 33.34], sum = 100.00
- Equal split ₹10 / 3 members: splits = [3.33, 3.33, 3.34], sum = 10.00
- Percentage split 33.33% + 33.33% + 33.34% of ₹1000: sum = 1000.00
- Equal split ₹1 / 3 members: splits = [0.33, 0.33, 0.34], sum = 1.00

**Tests to write (balances + debt simplification):**
- GET /api/splits/:groupId/balances: 2 members, 1 expense → one owes the other
- GET /api/splits/:groupId/balances: 3 members, multiple expenses → simplified debts
- GET /api/splits/:groupId/balances: returns zero balances when all settled
- GET /api/splits/:groupId/balances: accounts for settlements
- Debt simplification: 4 members with circular debts reduced to ≤ 3 settlements

**Tests to write (settlements):**
- POST /api/splits/:groupId/settle: records settlement
- POST /api/splits/:groupId/settle: updates balances correctly

**Multi-user tests (C23):**
- User A pays expense → User B sees correct balance (owes User A)
- User A and User B both add expenses → simplified balances correct
- User B settles with User A → both see zero balance

**Implementation changes:**
- `src/routes/splits.js`: Add DELETE `/:groupId/expenses/:id` route
- `src/routes/splits.js`: Implement rounding — calculate each share as `Math.floor(amount / count * 100) / 100`, assign remainder to payer
- `src/routes/splits.js`: Implement debt simplification in GET balances:
  1. Calculate net balance per member (what they paid minus what they owe)
  2. Separate into creditors (positive balance) and debtors (negative balance)
  3. Greedy match: largest debtor pays largest creditor, repeat
  4. Return simplified list of `{ from, to, amount }` settlements needed

**Verify:** `npm test` — splits tests green, rounding verified, debt simplification verified

---

#### Task 2.3 — Service extraction for collaboration (C17)

**After Phase 2 tests are green**, extract:
- `src/services/split.service.js` — debt simplification algorithm, rounding logic, balance calculation
- Keep group CRUD and route-level auth checks in routes

**Verify:** `npm test` — all Phase 2 tests still green after extraction

---

### Phase 3: Analytics & Intelligence (TDD)

Dashboard, financial health, auto-categorization, recurring transactions.

---

#### Task 3.1 — Stats & dashboard tests

**Test file:** `tests/stats.test.js`

**Tests to write:**
- GET /api/stats/overview: returns net_worth, month_income, month_expense, month_savings
- GET /api/stats/overview: with no data returns all zeros (not nulls, not errors)
- GET /api/stats/overview: top_categories limited to 5
- GET /api/stats/overview: recent_transactions limited to 10
- GET /api/stats/overview: monthly_subscriptions calculated correctly
- GET /api/stats/trends: returns monthly income vs expense arrays
- GET /api/stats/trends: respects ?months= parameter (default 6)
- GET /api/stats/category-breakdown: groups by category with totals
- GET /api/stats/category-breakdown: filters by from, to, type

**Verify:** `npm test` — stats tests green

---

#### Task 3.2 — Financial health tests + 30-day gating + edge cases

**Test file:** `tests/health.test.js`

**Tests to write:**
- GET /api/stats/financial-health: returns 200 with score, ratios, averages
- Returns `{ gated: true, message: "..." }` when user has < 30 days of data
- emergency_fund_months = 0 when no savings accounts
- savings_rate handles zero income gracefully (returns 0, not NaN/Infinity)
- debt_to_income handles zero income gracefully (returns 0)
- Score of 50 baseline, up to 100 with good ratios
- Score interpretation text matches score range
- Score includes `interpretation` field with plain-English recommendations

**Implementation changes:** `src/routes/stats.js` — fix `/financial-health`:
- Check earliest transaction date; if < 30 days ago, return gated response
- Guard all divisions against zero denominators
- Add plain-English `interpretation` field: "Your emergency fund covers X months. Target is 3-6 months."

**Verify:** `npm test` — health tests green

---

#### Task 3.3 — Auto-categorization rules (new module)

**Files:** `src/routes/rules.js`, `tests/rules.test.js`

**Schema:** `category_rules` table (added in migration 001 from Task 0.3)

**Tests to write:**
- GET /api/rules: returns user's rules + system rules
- POST /api/rules: creates rule with pattern + category_id (201)
- POST /api/rules: rejects missing pattern (400)
- POST /api/rules: rejects non-existent category_id (400)
- PUT /api/rules/:id: updates pattern or category_id
- PUT /api/rules/:id: blocks update of system rules
- DELETE /api/rules/:id: deletes rule
- DELETE /api/rules/:id: blocks deletion of system rules
- Integration: POST /api/transactions with description matching a rule → auto-assigns category_id

**Implementation:**
- `src/routes/rules.js`: CRUD routes for category_rules
- Seed system rules on user registration (add to auth.js's `seedDefaultCategories`):
  - "swiggy|zomato|uber eats" → Food & Dining
  - "uber|ola|rapido" → Transport
  - "amazon|flipkart|myntra" → Shopping
  - "netflix|spotify|hotstar|prime" → Subscriptions
  - "electricity|water|gas|broadband" → Utilities
- `src/routes/transactions.js`: Before inserting, if no category_id provided, query category_rules for matching pattern (case-insensitive), assign first match by position
- Mount in server.js: `app.use('/api/rules', requireAuth, createRulesRoutes(deps))`

**Verify:** `npm test` — rules tests green, auto-categorization integration tested

---

#### Task 3.4 — Recurring transaction scheduler + session cleanup + audit cleanup

**Files:** `src/scheduler.js`, `tests/recurring.test.js`

**Tests to write:**
- Recurring rule with next_date = today → spawns transaction
- Recurring rule with next_date = yesterday → spawns transaction (catches up)
- Recurring rule with next_date = tomorrow → does NOT spawn
- Spawned transaction has correct amount, type, category, description
- Spawned transaction updates account balance
- next_date advanced correctly per frequency (daily→+1d, weekly→+7d, monthly→+1mo, quarterly→+3mo, yearly→+1y)
- Inactive rule (is_active=0) → no spawn
- Rule with end_date < today → no spawn, rule deactivated
- **Session cleanup (C25):** sessions older than 30 days are deleted
- **Audit cleanup (C19):** audit_log entries older than 90 days are deleted

**Implementation:**
```javascript
// src/scheduler.js — following lifeflow's pattern
module.exports = function createScheduler(db, logger) {
  const jobs = [];
  
  function register(name, intervalMs, fn) { ... }
  function start() { /* run immediately + setInterval */ }
  function stop() { /* clearInterval all */ }
  
  function registerBuiltinJobs() {
    // Job 1: Session + audit cleanup every 6 hours
    register('cleanup', 6 * 3600000, () => {
      db.prepare("DELETE FROM sessions WHERE created_at < datetime('now', '-30 days')").run();
      db.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')").run();
    });
    
    // Job 2: Recurring transaction spawn every 60 minutes
    register('recurring-spawn', 3600000, () => { ... });
  }
  
  return { register, registerBuiltinJobs, start, stop };
};
```

- Wire into `src/server.js`: create scheduler, register jobs, start (skip in test mode)

**Verify:** `npm test` — recurring tests green, cleanup verified

---

#### Task 3.5 — Service extraction for analytics (C17)

**After Phase 3 tests are green**, extract:
- `src/services/health.service.js` — scoring algorithm, ratio calculations, interpretation generation
- `src/services/scheduler.service.js` — recurring spawn logic, date advancement
- Keep stats route-level aggregation queries in routes (they're queries, not business logic)

**Verify:** `npm test` — all Phase 3 tests still green after extraction

---

### Phase 4: Data Portability (TDD)

Export/import is critical for user trust in a self-hosted app.

---

#### Task 4.1 — JSON export/import + CSV template import (simplified per C8)

**Files:** `src/routes/data.js`, `tests/data.test.js`

**Tests to write (JSON export):**
- GET /api/data/export: returns complete JSON with accounts, transactions, categories, budgets, goals, subscriptions, groups, settings, rules
- Export includes all nested data (budget_items within budgets, etc.)
- Export excludes password_hash, session tokens, audit_log

**Tests to write (JSON import):**
- POST /api/data/import: requires password confirmation in request body (403 without)
- POST /api/data/import: replaces all data (destructive)
- POST /api/data/import: remaps IDs correctly (category references in transactions)
- POST /api/data/import: atomic — failure rolls back everything
- POST /api/data/import: rejects malformed JSON (400)

**Tests to write (CSV import — template only, C8):**
- POST /api/data/csv-import: imports CSV matching OUR template format
- Template columns: date (YYYY-MM-DD), description, amount, type (income/expense), category (optional)
- Rejects CSV with wrong column headers (400)
- Auto-categorizes using rules engine when category column empty
- Creates transactions in specified account_id (required query param)
- Returns `{ imported: N, categorized: N, uncategorized: N }`
- Empty file returns `{ imported: 0 }`
- Extra columns in CSV are ignored (graceful)

**Tests to write (CSV template):**
- GET /api/data/csv-template: returns CSV file with header row + 2 example rows
- Content-Type is text/csv
- Content-Disposition sets filename

**Implementation:** `src/routes/data.js` — 4 routes
- Mount in server.js: `app.use('/api/data', requireAuth, createDataRoutes(deps))`

**Verify:** `npm test` — data tests green

---

### Phase 5: Security & Integrity (TDD)

Comprehensive security and data integrity validation.

---

#### Task 5.1 — Security tests

**Test file:** `tests/security.test.js`

**Tests to write:**
- Every protected route returns 401 without auth (systematic sweep of all 50+ routes)
- User A cannot access User B's accounts, transactions, budgets, etc.
- SQL injection in search params: `?search='; DROP TABLE users;--` → safe
- XSS in description fields: stored as-is, no script execution (CSP headers verify)
- Rate limiting: 200+ rapid auth requests → 429
- Invalid JSON body → 400 (not 500)
- Oversized body (> 1MB) → 413
- Error responses never leak SQL errors or stack traces (check for "SQLITE" in response body)

**Verify:** `npm test` — security tests green

---

#### Task 5.2 — Data integrity tests + graceful shutdown (C31)

**Test file:** `tests/data-integrity.test.js`

**Tests to write:**
- Foreign key cascades: delete user → all accounts, transactions, categories, budgets, goals, subs, groups membership deleted
- Foreign key cascades: delete account → transactions deleted, recurring_rules referencing it deleted
- Foreign key cascades: delete group → members, expenses, splits, settlements deleted
- Transaction atomicity: transfer creation is all-or-nothing
- Balance consistency: after 100 random transactions, account balance matches SUM(income) - SUM(expense)
- Concurrent operations: two transactions on same account → correct final balance
- **Graceful shutdown (C31):** spawn server process, send SIGTERM, verify process exits cleanly (exit code 0)

**Verify:** `npm test` — integrity tests green

---

### Phase 6: Frontend & PWA

Frontend views and service worker. This is the only phase without TDD (frontend is vanilla JS, tested manually).

**Before starting Phase 6, define UX patterns (C4):**
- Success feedback: toast notification (auto-dismiss 3s)
- Validation errors: inline below field
- Loading states: skeleton shimmer
- Offline indicator: top banner
- Modals: centered overlay with backdrop

---

#### Task 6.1 — Service worker

**File:** `public/sw.js`

**Implementation:** Network-first caching strategy (following lifeflow's sw.js):
- Cache static assets (css, js, fonts) on install
- Network-first for API calls, cache-first for static
- Offline fallback page showing banner "You're offline — data may be stale"
- Register from index.html

---

#### Task 6.2 — Frontend views (iterative)

Build views incrementally. **Each view must handle its empty state (C1)** — show helpful CTA, not blank space.

1. **Dashboard** — wire to /api/stats/overview. Empty state: "Welcome! Add your first account to get started" with CTA button
2. **Accounts** — list with balances, add/edit modal. Empty: "No accounts yet — add your checking, savings, or credit card"
3. **Transactions** — list with filters, add/edit modal, transfer form. Empty: "No transactions — log your first expense"
4. **Categories** — management view, show system vs custom. Empty: N/A (21 system categories always exist)
5. **Budgets** — list, create with category allocation, summary view (budget vs actual chart). Empty: "Create a budget to start tracking spending"
6. **Subscriptions** — list with monthly burn total, add/edit modal. Empty: "Track your subscriptions to see your monthly burn rate"
7. **Goals** — progress cards with percentage bars. Empty: "Set a savings goal — emergency fund, vacation, gadget?"
8. **Groups** — member list, add member form. Empty: "Create a group to start splitting expenses"
9. **Splits** — expense list, add expense form. Split method defaults to "equal" — exact/percentage/shares behind "Advanced" toggle **(C3)**. Balances/settle view.
10. **Financial Health** — score gauge (red 0-40, yellow 40-70, green 70-100) **(C5)**, ratio cards with progress bars, interpretation text as expandable cards. Gated message when < 30 days data.
11. **Reports** — trends chart (line), category breakdown (donut chart)
12. **Settings** — currency picker, date format, category rule management
13. **Data** — export button, import file picker, CSV import with account selector

**Mobile responsive (C2):**
- Breakpoints: `<768px` (mobile), `768-1024px` (tablet), `>1024px` (desktop)
- `<768px`: sidebar collapses to bottom tab bar (5 tabs: Dashboard, Transactions, Budgets, Groups, More)
- All touch targets ≥ 44px
- Forms stack vertically on mobile
- Modals become full-screen sheets on mobile

**Each view follows the pattern already in app.js:**
```javascript
async function renderTransactions(el) {
  el.innerHTML = '<div class="skeleton">...</div>'; // loading state
  try {
    const data = await api('/transactions?limit=50');
    if (!data.transactions.length) {
      el.innerHTML = `<div class="empty-state">...</div>`;
      return;
    }
    el.innerHTML = `...`;
  } catch (err) {
    showToast('Failed to load transactions', 'error');
  }
}
```

---

#### Task 6.3 — Onboarding wizard (C1)

**File:** `public/js/onboarding.js`

**Implementation:** 3-step first-run wizard shown after registration (when user has 0 accounts):
1. **"Add your first account"** — form: name, type (checking/savings/credit_card), initial balance
2. **"Log your first transaction"** — form: description, amount, category (from seeded list)
3. **"Set a monthly budget"** — optional: create budget with 3-5 category allocations

- Wizard shown as full-screen overlay on first login (check: user has 0 accounts)
- Each step calls existing API endpoints
- Skip button on steps 2-3
- After completion or skip, never shown again (store `onboarding_completed` in settings)

---

### Phase 7: Exhaustive Testing + Integration Journeys

Final hardening pass with edge case tests and end-to-end journeys.

---

#### Task 7.1 — Exhaustive transaction tests

**File:** `tests/exhaustive-transactions.test.js`

- Very large amounts (999999999.99)
- Very small amounts (0.01)
- Unicode in descriptions (emoji, CJK, RTL)
- Extremely long descriptions (at max allowed length)
- Rapid sequential creates (timing/ordering)
- Filter combinations: account + category + type + date range + search simultaneously
- Pagination boundary: exactly at limit, offset beyond data
- Amount update edge: update to same amount → balance unchanged
- Amount update on transfer → both sides recalculated

---

#### Task 7.2 — Exhaustive splits tests

**File:** `tests/exhaustive-splits.test.js`

- Group with 10+ members, equal split rounding — **verify sum = expense amount** (C27)
- Percentage split rounding (33.33% + 33.33% + 33.34% → sum matches total)
- Multiple expenses from different payers, verify simplified debts are minimal
- Settlement followed by new expense, verify balances update correctly
- Guest members (no user_id) in splits
- Split ₹0.01 between 2 people → one gets 0.01, other gets 0.00 (remainder to payer)

---

#### Task 7.3 — User journey integration tests (C28)

**File:** `tests/journey.test.js`

**Journey 1 — Solo user lifecycle:**
1. Register → verify 201 + categories seeded
2. Create checking account (₹50,000) → verify balance
3. Add 30 days of transactions (income + expenses across categories)
4. Create monthly budget with 5 category allocations
5. GET budget summary → verify allocated vs spent matches transaction data
6. GET financial health → verify score returned (not gated, 30 days met)
7. GET dashboard overview → verify net_worth, income, expenses, top_categories

**Journey 2 — Couple splitting expenses:**
1. User A registers, User B registers (via `makeSecondUser()`)
2. User A creates "Household" group
3. User A adds User B to group
4. User A adds expense ₹1000 (dinner), equal split
5. User B adds expense ₹500 (groceries), equal split
6. GET balances → verify simplified: one payment needed
7. Settle up → GET balances → all zero

**Journey 3 — Data portability round-trip:**
1. Register, create accounts, add 20 transactions, create budget, create group with expenses
2. GET /api/data/export → save JSON
3. Register new user (or wipe data via import)
4. POST /api/data/import with exported JSON
5. GET all entities → verify counts and values match original

**Verify:** `npm test` — journey tests green

---

#### Task 7.4 — Performance smoke test (C24)

**File:** `tests/performance.test.js`

- Seed 10,000 transactions across 5 accounts
- GET /api/stats/overview → response time < 500ms
- GET /api/transactions?limit=50 → response time < 100ms
- GET /api/stats/category-breakdown → response time < 500ms
- GET /api/stats/financial-health → response time < 500ms

**Note:** Not a load test — just ensures key queries don't degrade at realistic data volumes. If any query exceeds threshold, add SQLite index.

**Verify:** `npm test` — performance assertions pass

---

### Phase 8: Launch Prep

---

#### Task 8.1 — README + visual assets (C14, C16)

**File:** `README.md`

**Contents:**
- Problem statement (2 lines)
- Hero screenshot (dashboard view)
- Feature grid with icons (6 features: track, budget, split, health, export, recurring)
- Quickstart: `docker-compose up` (3 commands max)
- 4 screenshots: dashboard, transactions, budget vs actual, splits/balances
- Comparison table: PersonalFi vs Splitwise vs YNAB vs Actual Budget
- Tech stack badges
- License

**OG image:** Create a 1200x630 social card with logo + tagline for GitHub/social sharing.

---

## Execution Order Summary

```
Pre-requisite: Resolve name (C15) — rename repo or app

Phase 0 — Foundation
  0.1  Fix server exports
  0.2  Create test helpers (with makeSecondUser)
  0.3  Migration system + category_rules table
  0.4  Fix CSRF middleware + rate limiting config
  ── checkpoint: `npm test` runs, helpers work ──

Phase 1 — Core Personal Finance (TDD) — MUST-HAVE
  1.1  Auth tests + session TTL
  1.2  Accounts tests + audit spot-check
  1.3  Categories tests
  1.4  Transactions tests + transfers + amount updates  ← largest task
  1.5  Budgets tests + budget vs actual summary
  1.6  Subscriptions tests
  1.7  Goals tests
  1.8  Settings routes + transaction service extraction
  ── checkpoint: all personal finance CRUD tested ──

Phase 2 — Collaboration (TDD) — SHOULD-HAVE
  2.1  Groups tests + multi-user + permission matrix
  2.2  Splits tests + rounding policy + debt simplification
  2.3  Split service extraction
  ── checkpoint: collaboration features tested ──
  ── NOTE: shared budgets deferred to v2 ──

Phase 3 — Analytics & Intelligence (TDD) — NICE-TO-HAVE
  3.1  Stats & dashboard tests
  3.2  Financial health + 30-day gating
  3.3  Auto-categorization rules (new module)
  3.4  Recurring scheduler + session/audit cleanup
  3.5  Health + scheduler service extraction
  ── checkpoint: intelligence features tested ──

Phase 4 — Data Portability (TDD) — NICE-TO-HAVE
  4.1  JSON export/import + CSV template import
  ── checkpoint: data portability tested ──

Phase 5 — Security & Integrity (TDD)
  5.1  Security tests (auth sweep, injection, rate limiting)
  5.2  Data integrity tests + graceful shutdown
  ── checkpoint: security hardened ──

Phase 6 — Frontend & PWA
  6.1  Service worker
  6.2  Frontend views (13 views, mobile responsive, empty states)
  6.3  Onboarding wizard
  ── checkpoint: usable app ──

Phase 7 — Exhaustive Testing + Journeys
  7.1  Exhaustive transactions
  7.2  Exhaustive splits + rounding
  7.3  User journey integration tests (3 journeys)
  7.4  Performance smoke test (10K transactions)
  ── checkpoint: production-ready ──

Phase 8 — Launch Prep
  8.1  README + screenshots + social card
  ── checkpoint: ready to share ──
```

---

## Dependencies Between Tasks

```
0.1 (server exports) ← 0.2 (test helpers) ← ALL test tasks
0.3 (migrations) ← 3.3 (rules module needs category_rules table)
1.4 (transactions) ← 3.3 (rules auto-assign on transaction create)
1.4 (transactions) ← 3.4 (scheduler spawns transactions)
1.1-1.7 (Phase 1 tests) ← 1.8 (service extraction after tests green)
2.1 (groups) ← 2.2 (splits depend on groups)
2.1-2.2 (Phase 2 tests) ← 2.3 (service extraction after tests green)
3.1-3.4 (Phase 3 tests) ← 3.5 (service extraction after tests green)
1.1-1.8 (all CRUD) ← 4.1 (export/import needs all entities)
1.1-3.5 (all features) ← 5.1 (security sweep of all routes)
5.1-5.2 (security) ← 6.x (frontend assumes secure API)
6.2 (views) ← 6.3 (onboarding uses view components)
1.1-5.2 (all backend) ← 7.3 (journeys test full stack)
6.2 (views) ← 8.1 (README needs screenshots)
```

---

## Review Findings Traceability

Every panel finding maps to a plan task:

| Finding | Severity | Addressed In |
|---------|----------|-------------|
| C1 Onboarding | High | Task 6.2 (empty states), 6.3 (wizard) |
| C2 Mobile | High | Task 6.2 (breakpoints + bottom nav) |
| C3 Split UX | Low | Task 6.2 (default equal, advanced accordion) |
| C4 Loading/error states | Low | Phase 6 preamble (UX pattern definition) |
| C5 Health visualization | Low | Task 6.2 (gauge + ratio cards) |
| C6 User stories | Medium | Spec-level, not plan |
| C7 Prioritization | Medium | MoSCoW table + phase labels |
| C8 CSV overscoped | Medium | Task 4.1 simplified |
| C9 Shared budgets | High | Deferred to v2 |
| C10 Usage analytics | Low | v2 |
| C11 Positioning | Low | Marketing, not code |
| C12 Niche audience | Low | Acknowledged, v2 roadmap |
| C13 Demo path | Low | Post-v1 |
| C14 README | Medium | Task 8.1 |
| C15 Name mismatch | High | Pre-requisite action |
| C16 Screenshots | Low | Task 8.1 |
| C17 Service layer | High | Tasks 1.8, 2.3, 3.5 |
| C18 API versioning | Low | v2 |
| C19 Audit unbounded | Medium | Task 3.4 (90-day cleanup) |
| C20 Settings missing | Medium | Task 1.8 |
| C21 Rate limiting | Medium | Task 0.4 |
| C22 Amount update | Medium | Task 1.4 (delta recalculation) |
| C23 Multi-user tests | High | Tasks 0.2, 2.1, 2.2, 7.3 |
| C24 Performance test | Medium | Task 7.4 |
| C25 Session TTL | Medium | Tasks 1.1, 3.4 |
| C26 Group permissions | Medium | Task 2.1 (permission matrix) |
| C27 Rounding policy | High | Task 2.2 (remainder to payer) |
| C28 Journey tests | Medium | Task 7.3 |
| C29 CSV edge cases | Low | Task 4.1 (template-only simplifies) |
| C30 Audit untested | Medium | Tasks 1.2, 1.4, 2.2 (spot-checks) |
| C31 Graceful shutdown | Low | Task 5.2 |
| C32 Test parallelism | Low | Task 0.2 (documented) |

---

## Handoff

This plan is ready for the **implementer** agent. Execute tasks in order, following the TDD workflow:

1. Write tests (RED)
2. Implement (GREEN)
3. Refactor (extract services where marked)
4. `npm test` must pass before moving to next task

Start with **resolving C15 (name mismatch)**, then **Phase 0, Task 0.1**.
