# PersonalFi — Expert Panel Review

> **Reviewing:** spec.md v0.2 + plan.md  
> **Date:** 29 March 2026  
> **Panel:** UI/UX, Product Manager, Sales, Marketing, Architect, QA, Tester

---

## 1. UI/UX Review

### Strengths
- Midnight theme with Inter font is a strong visual identity — dark themes dominate finance apps (Cred, Mint dark mode)
- Vanilla JS SPA without a framework keeps bundle size near zero — fast first paint
- Material Icons Round is a good universal icon choice

### Concerns

**C1 — No onboarding flow defined.** The spec says "signup → first transaction in under 60 seconds" as a success metric, but neither the spec nor the plan defines what the user sees after registration. 21 categories get seeded silently. User lands on... the dashboard? With zero data it's an empty state. **Empty states are where finance apps die.** There's no mention of:
- Onboarding wizard ("Add your first account" → "Log your first transaction")
- Empty state illustrations / CTAs for each view
- Progressive disclosure (hide health score, trends, goals until they have data)

**Recommendation:** Add an onboarding task to Phase 6 that designs empty states for every view and a 3-step first-run wizard (create account → add transaction → set budget).

**C2 — No mobile-first responsive design spec.** The CSS mentions "responsive" but there's no breakpoint strategy, no touch target sizing, no mobile navigation pattern. Finance is a phone-first activity — 78% of personal finance interactions happen on mobile. A sidebar navigation is desktop-centric.

**Recommendation:** Define mobile breakpoints (<768px), switch sidebar to bottom tab bar on mobile, ensure all touch targets are ≥ 44px. Add this to the spec's architecture section.

**C3 — Split method selection UX is complex.** Four split methods (equal/exact/percentage/shares) is powerful but confusing for a first-time user. The plan's frontend task (6.2) just says "split method selector" with no wireframe or interaction model.

**Recommendation:** Default to "equal" with a single toggle to switch. Show exact/percentage/shares as an "Advanced" accordion. Design the split entry form before implementing.

**C4 — No loading states, error states, or optimistic UI patterns defined.** The SPA has an API client but no mention of:
- Skeleton screens during data fetch
- Toast notifications for success/error
- Offline indicators (service worker exists but no offline UX)
- Form validation feedback (inline vs toast vs alert)

**Recommendation:** Define a standard UX pattern doc before Phase 6: `{toast for success, inline for validation, skeleton for loading, banner for offline}`.

**C5 — Financial health score visualization undefined.** The backend returns a score 0-100 with ratios, but how is this presented? A gauge? A card? Color-coded? The "interpretation" text is backend-defined but no UI treatment is specified.

**Recommendation:** Define the health dashboard layout — score gauge (0-100 with red/yellow/green zones), ratio cards with progress bars, plain-English recommendations as expandable cards.

---

## 2. Product Manager Review

### Strengths
- Clear problem statement backed by real statistics
- Narrowed to 2 personas for v1 — avoids scope creep
- Non-goals list is explicit and disciplined
- Resolved design decisions table is excellent — tracks decisions + rationale

### Concerns

**C6 — No user stories or acceptance criteria.** The spec lists "feature domains" with technical bullet points, but there are no user stories. "As a young professional, I want to see how much I spent on food this month, so I can adjust my dining budget." Without user stories, the implementer makes UX assumptions. The plan's test cases are API-level, not user-journey-level.

**Recommendation:** Add 3-5 user stories per feature domain in the spec. Each story should have clear acceptance criteria that map to both API tests and frontend behavior.

**C7 — No prioritization within v1 scope.** All 10 feature domains are treated as equal priority. But a user who can't do basic expense tracking won't care about auto-categorization rules or CSV import. The plan phases roughly order them, but there's no MoSCoW or impact/effort analysis.

**Recommendation:** Rank features by "time to first value":
- **Must-have (launch blockers):** Accounts, Transactions, Categories, Budgets, Dashboard
- **Should-have (week 1):** Groups, Splits, Subscriptions, Goals
- **Nice-to-have (can ship after launch):** Rules, CSV import, Recurring, Health score, Data export

**C8 — CSV import is overscoped for v1.** The spec wants date format auto-detection, delimiter auto-detection, column mapping, and category auto-matching. This is a full data pipeline. Most v1 finance apps ship with a fixed CSV template and add auto-detection in v2.

**Recommendation:** v1 CSV import should accept YOUR template only (the one from GET /api/data/csv-template). Auto-detection is v2. This dramatically simplifies Task 4.1.

**C9 — "Shared budgets" feature is underspecified.** It has a database schema (shared_budgets, shared_budget_items) and a vague mention in groups, but:
- How do shared budgets relate to personal budgets?
- Who can edit? All members or only the creator?
- What transactions feed into "actuals" — shared_expenses? Personal transactions tagged to the group?
- The plan's Task 2.3 literally says "if shared budget routes don't exist yet, add them" — this is a planning gap.

**Recommendation:** Either fully specify shared budgets (permissions, data flow, UI) or explicitly defer to v2. Half-built features erode trust.

**C10 — No analytics or usage tracking plan.** The success metrics say "dashboard loads meaningful data after 5+ transactions" — who measures this? There's no telemetry, no usage logging, no way to know if users actually reach the health score page.

**Recommendation:** For a self-hosted app, add optional anonymous usage counters (page views per section, feature usage counts) stored locally. Not for monetization — for product iteration.

---

## 3. Sales Review

### Strengths
- Self-hosted angle is a genuine differentiator — privacy-first is a growing market segment
- "Your data, your server" messaging resonates with tech-savvy early adopters
- Free/open-source eliminates pricing objections for initial adoption

### Concerns

**C11 — No competitive positioning document.** The market research identified 15+ competitors but the spec doesn't articulate PersonalFi's 1-sentence differentiator. "Self-hosted Splitwise + YNAB" is the internal shorthand, but there's no clear positioning statement for external communication.

**Recommendation:** Add a positioning statement: "PersonalFi is the only self-hosted finance app that combines personal budgeting with collaborative expense splitting — your data never leaves your server."

**C12 — Self-hosted = niche audience.** The setup requires Docker, a server, and technical knowledge. The addressable market is developers and tech-savvy users. That's fine for v1, but the spec doesn't mention any path to broader accessibility (hosted offering, one-click deploy, etc.).

**Recommendation:** Acknowledge in the spec that v1 targets self-hosters. Add a v2/v3 roadmap item for "managed hosting" or "one-click Railway/Coolify deploy" to expand TAM.

**C13 — No demo or trial path.** A self-hosted app has no "try before you install" option. Potential users must spin up Docker, register, and add data before they can evaluate the product.

**Recommendation:** Create a read-only demo instance with sample data, or a 2-minute video walkthrough. Add this as a post-v1 deliverable.

---

## 4. Marketing Review

### Strengths
- Problem stats are compelling (69% paycheck-to-paycheck, 2.5x subscription underestimate)
- App name "PersonalFi" is clear, memorable, and domain-available-ish
- Collaborative angle fills a genuine market gap (Zeta/Honeydue shutdown)

### Concerns

**C14 — No landing page or README strategy.** The GitHub repo at `learn-by-exploration/financeflow` exists but there's no README content strategy. For open-source projects, the README IS the marketing page. It needs: hero screenshot, feature list, 1-command install, comparison table.

**Recommendation:** Write a marketing-grade README.md as part of Phase 6 or a dedicated Phase 7 task. Include: problem statement (2 lines), hero screenshot, feature grid with icons, `docker-compose up` quickstart, comparison table vs Splitwise/YNAB/Actual Budget.

**C15 — Name mismatch: repo is "financeflow" but app is "PersonalFi".** The GitHub repo URL is `financeflow` but everything else says PersonalFi. This will confuse early adopters, SEO, and link sharing.

**Recommendation:** Decide on ONE name. If PersonalFi, rename the GitHub repo. If FinanceFlow, update the spec and codebase.

**C16 — No screenshot/visual assets planned.** The plan has 10 frontend views but no task for creating screenshots, OG images, or social cards. For an open-source project, visual assets in the README drive more installs than feature lists.

**Recommendation:** Add a post-Phase 6 task: capture 4-6 key screenshots (dashboard, transactions, splits, budget vs actual), create a social card image.

---

## 5. Architect Review

### Strengths
- Following lifeflow's proven architecture is smart — it's battle-tested with 1,931 tests
- Dependency injection via route factories enables clean testing
- SQLite + WAL mode is the right choice for self-hosted (zero ops)
- Express 5 with Zod validation is a solid, minimal stack
- Migration system in Plan Phase 0 is correctly prioritized

### Concerns

**C17 — No service layer exists in the current codebase.** The spec mandates a 3-layer architecture (Route → Service → Repository), but reading the conversation history, ALL business logic is in route handlers. The plan tests routes directly but never creates service or repository files. There's no task for "extract transaction service" or "create budget repository."

**Recommendation:** Either:
- (a) Drop the 3-layer requirement from the spec — lifeflow itself only uses services for complex cross-cutting logic, not for every module. Simple CRUD in routes is fine.
- (b) Add refactoring tasks after each Phase 1-3 test suite is green: extract services for complex modules (transactions, splits, stats, health). Don't extract for simple CRUD (categories, goals, subscriptions).

Recommended: Option (b) — extract services only for modules with business logic: `transaction.service.js` (double-entry transfers), `split.service.js` (debt simplification), `health.service.js` (scoring algorithm), `scheduler.service.js` (recurring spawn).

**C18 — No API versioning strategy.** All routes are at `/api/`. When v2 adds multi-currency or bank sync, there's no path for breaking changes without disrupting existing clients.

**Recommendation:** Not needed for v1 (no external API consumers), but note in the spec that v2 should consider `/api/v2/` or header-based versioning.

**C19 — Audit log is write-only.** `audit.js` service writes to `audit_log` table, but there's no route to read it, no retention policy, and no tests. It could grow unbounded.

**Recommendation:** Add a 90-day retention cleanup job to the scheduler. Optionally add a read route for admin users in v2. For v1, just ensure the cleanup job exists.

**C20 — Settings table exists but has no routes.** The schema has a `settings` table (user_id, key, value) but neither the spec nor the plan mention settings routes. Where does the user set their default currency? Date format? Notification preferences?

**Recommendation:** Add GET/PUT `/api/settings` to the spec and plan (Phase 1). Simple key-value CRUD. This is where `default_currency: INR` lives.

**C21 — No rate limiting configuration documented.** The spec mentions `express-rate-limit` but doesn't specify limits. What's the threshold? Per-IP? Per-user? Global?

**Recommendation:** Define in spec: 100 requests/15 minutes per IP for auth endpoints, 1000 requests/15 minutes for authenticated API. Test in security.test.js.

**C22 — Transaction amount update is blocked but balance correction is needed.** Plan Task 1.4 says "cannot change amount/type (would break balance)." But what if a user enters the wrong amount? They have to delete and recreate the transaction? This is user-hostile.

**Recommendation:** Allow amount updates but recalculate the balance delta: `new_balance = old_balance - old_amount + new_amount`. Add tests for this. The delta approach is safe and bookkeeping-correct.

---

## 6. QA Review

### Strengths
- TDD mandate is exceptional — most projects defer testing
- 14 coverage categories per route module is thorough
- Test isolation via temp DB + cleanDb() is proper
- Security test sweep of all 50+ routes is the right approach

### Concerns

**C23 — No test for concurrent users.** All test scenarios use a single test user. The spec supports multi-user (household members), but there are no tests for:
- User A creates a group, invites User B → User B sees the group
- User A adds an expense, User B sees updated balance
- User A and User B both add expenses simultaneously

**Recommendation:** Add a `tests/multi-user.test.js` in Phase 2 or Phase 5. Create `makeSecondUser()` factory in helpers.js. Test cross-user interactions in groups/splits.

**C24 — No performance/load testing mentioned.** What happens with 10,000 transactions? 50,000? The dashboard overview queries SUM across all transactions — does it slow down? SQLite is fast, but unbounded aggregation can degrade.

**Recommendation:** Add a performance smoke test: seed 10,000 transactions, verify dashboard loads in < 500ms. Not a full load test suite, just a sanity check. Add to Phase 7.

**C25 — No test for the auth session expiration flow.** Tests check "401 for invalid/expired session" but don't test the actual expiration. Sessions presumably have a TTL, but:
- What is the TTL? Not specified in the spec.
- Is there a "remember me" option?
- Does the scheduler's session cleanup job actually work end-to-end?

**Recommendation:** Define session TTL in spec (e.g., 30 days). Test: create session, artificially age it past TTL, verify 401. Test: scheduler cleanup removes expired sessions.

**C26 — No negative testing for group permissions.** The plan tests "returns 403 for non-member" but doesn't test:
- Non-owner trying to remove a member
- Non-owner trying to delete the group
- Guest member (no user_id) trying to use the API
- Member leaving a group and then trying to access it

**Recommendation:** Expand Task 2.1 and 2.2 tests with explicit permission matrix: `{owner: can_delete_group, member: cannot, guest: N/A}`.

**C27 — Plan says "exhaustive splits tests" but doesn't test currency rounding.** The spec says INR-first with no multi-currency, but amounts still have decimal precision issues: splitting ₹100 three ways = 33.33 + 33.33 + 33.34. Who gets the extra paisa? This is a real-world source of bugs (and user complaints).

**Recommendation:** Define a rounding policy in spec: "remainder goes to the first member in the split" or "remainder goes to the payer." Test explicitly: split ₹100 three ways, verify splits sum to exactly 100.00.

---

## 7. Tester Review

### Strengths
- Test file naming convention is clean and predictable
- Factory functions with override support enable composable fixtures
- Separate exhaustive test files for edge cases is a good pattern
- `cleanDb()` in beforeEach is proper isolation

### Concerns

**C28 — No integration test for the full user journey.** All tests are route-level unit/integration tests. There's no end-to-end test that simulates:
1. Register → 2. Create account → 3. Add transactions → 4. Create budget → 5. Check budget vs actual → 6. View dashboard → 7. Export data

This would catch issues like "budget summary returns wrong data because transactions weren't categorized" — cross-module integration bugs.

**Recommendation:** Add `tests/journey.test.js` in Phase 5 or 7 with 2-3 user journeys:
- Journey 1: Solo user — register, setup, 30 days of transactions, check health score
- Journey 2: Couple — register 2 users, create group, add expenses, settle debts, verify
- Journey 3: Data portability — register, add data, export JSON, re-import, verify everything matches

**C29 — No test for the CSV import edge cases.** The plan's data.test.js mentions CSV import but the test cases are minimal. Real bank CSVs are messy:
- Headers with BOM characters
- Quoted fields with commas: `"Amazon, Inc.",1500.00`
- Negative amounts for credits vs positive for debits (varies by bank)
- Empty rows, footer totals, bank logos in the header

**Recommendation:** If sticking with "own CSV template only" (per C8 recommendation), test: correct template works, wrong column order fails gracefully, extra columns ignored, empty file returns 0 imported.

**C30 — Audit log coverage is absent.** The `audit.js` service exists and presumably logs create/update/delete operations, but there are no tests asserting that audit records are actually created. If audit logging is a feature, it needs verification.

**Recommendation:** Add audit assertions to existing tests: `after creating an account, verify audit_log has an entry with action='account_created'`. A few spot-checks across modules, not exhaustive per-route.

**C31 — No test for graceful shutdown.** The server has graceful shutdown code (close db, stop scheduler). This is untested and could cause data corruption if broken.

**Recommendation:** Add to Phase 5: send SIGTERM to test server, verify db is cleanly closed, inflight requests complete.

**C32 — Plan doesn't specify test run order or parallelism.** `node --test tests/*.test.js` runs all tests. With 18+ test files, sequential execution could be slow. But parallel execution with a shared SQLite file causes locks.

**Recommendation:** Each test file gets its own temp DB (already the case via setup/teardown), so parallel should work. Verify with `--test-concurrency` flag. Document expected test run time target (< 30 seconds for full suite).

---

## Summary: Critical Items to Address Before Implementation

| # | Issue | Severity | Owner | Recommendation |
|---|-------|----------|-------|----------------|
| C1 | No onboarding / empty states | **High** | UI/UX | Add onboarding wizard and empty state designs |
| C2 | No mobile responsive spec | **High** | UI/UX | Define breakpoints, bottom nav for mobile |
| C6 | No user stories | **Medium** | PM | Add 3-5 user stories per feature domain |
| C7 | No feature prioritization | **Medium** | PM | MoSCoW classification within v1 |
| C8 | CSV import overscoped | **Medium** | PM | v1 = own template only, auto-detect is v2 |
| C9 | Shared budgets underspecified | **High** | PM | Fully specify or defer to v2 |
| C15 | Name mismatch (PersonalFi vs financeflow) | **High** | Marketing | Pick one name, rename repo if needed |
| C17 | No service layer despite spec requiring it | **High** | Architect | Extract services for complex modules only |
| C20 | Settings routes missing | **Medium** | Architect | Add GET/PUT /api/settings |
| C22 | Transaction amount update blocked | **Medium** | Architect | Allow with delta-based balance recalculation |
| C23 | No multi-user tests | **High** | QA | Add multi-user interaction tests |
| C27 | No rounding policy for splits | **High** | QA/Architect | Define and test rounding policy |
| C28 | No user journey integration tests | **Medium** | Tester | Add 2-3 end-to-end journey tests |

### Items that are fine as-is
- Auth model (self-hosted, multi-user on same instance) — fits the audience
- SQLite + WAL — correct for self-hosted, no ops burden
- TDD approach with 14 coverage categories — thorough
- Phased implementation order — dependencies are correctly mapped
- Non-goals list — disciplined and justified
- INR-first, multi-currency deferred — correct scope cut

### Overall Verdict

**The spec is solid. The plan is well-structured and correctly ordered.** The main gaps are in UX specification (onboarding, mobile, empty states), a few underspecified features (shared budgets, settings, rounding), and test coverage blind spots (multi-user, journeys, performance). None of these are blocking — they can be addressed with spec addenda before the relevant phase begins.

**Recommendation:** Address C1, C9, C15, C17, C23, and C27 before starting implementation. The rest can be handled inline during their respective phases.
