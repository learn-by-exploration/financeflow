# FinanceFlow v7 — Expert Review & Implementation Plan

> **Date:** 2 April 2026  
> **Baseline:** v6.2.0 (3044 tests, 41 routes, 200+ endpoints, 21 views)  
> **Method:** 10-expert panel gap analysis between research document and current system

---

## Part 1: What We Researched

### 1.1 Source Documents Reviewed

| Document | Location | Content |
|----------|----------|---------|
| Personal Finance Research | `docs/research/personal_finance.md` | 300+ lines covering 15+ bestselling books, academic behavioral economics research, global financial frameworks, ratios, and app design principles |
| Design Spec | `docs/design/personalfi/spec.md` | v0.2 spec with 10 feature domains, architecture, database schema, test strategy |
| Implementation Plan | `docs/design/personalfi/plan.md` | Phased implementation with 32 review findings incorporated |
| Review Panel v1 | `docs/design/personalfi/review-panel.md` | 7-expert review (UI/UX, PM, Sales, Marketing, Architect, QA, Tester) — 32 findings |
| Review Panel v2 | `docs/design/personalfi/review-panel-findings.md` | 55-expert review across 4 iterations (Onboarding, Core Workflows, Collaboration, Reporting) |
| Roadmap | `docs/design/personalfi/v0.3.1-v0.5.5-roadmap.md` | 25 iterations planned across 3 phases |

### 1.2 Key Research Findings

#### From Academic Research (Behavioral Economics)

1. **Automation is the #1 intervention.** Madrian & Shea (2001) showed auto-enrollment in 401(k) plans increases participation by 50+ percentage points. Thaler & Benartzi's Save More Tomorrow raised savings rates from 3.5% to 13.6%.

2. **84% of budgeters exceed their budget** (Bankrate). Primary failure modes: unrealistic expectations, excessive complexity, decision fatigue, all-or-nothing thinking. The research suggests **hybrid approach**: automate savings + simplified discretionary tracking.

3. **Contextual education is 48% more effective** than arbitrary tips (Kaiser et al. 2022, meta-analysis of 76 RCTs across 33 countries).

4. **The ostrich effect** — 1 in 3 people would rather deep-clean a bathroom than check savings. Making financial checking easy and non-threatening reduces avoidance.

5. **Mental accounting is a feature, not a bug** — Thaler's research shows people naturally categorize money into buckets. Apps that leverage this (YNAB envelopes, Barefoot's named accounts) outperform those that fight it.

6. **Financial stress = 13–15 IQ point cognitive tax** (Mullainathan & Shafir). People who need budgeting most are least cognitively equipped to do detailed tracking. This means: the app must offer tiered complexity.

#### From Financial Frameworks (Books)

| Framework | Key Allocation | Source |
|-----------|---------------|--------|
| **50/30/20** | 50% needs, 30% wants, 20% savings | Elizabeth Warren |
| **80/20** | 80% everything, 20% savings first | Pay-yourself-first |
| **Conscious Spending** | 50-60% fixed, 20-35% guilt-free, 10% invest, 5-10% save | Ramit Sethi |
| **Barefoot Buckets** | 60% daily, 10% splurge, 10% smile, 20% fire extinguisher | Scott Pape |
| **Ramsey** | 25% housing, detailed category percentages, zero-based | Dave Ramsey |
| **Kakeibo** | Needs, Wants, Culture, Unexpected — handwritten journal | Hani Motoko (Japan) |

All converge on: **spend less than you earn, invest the difference, automate wherever possible.**

#### From Financial Ratios & Thresholds

| Ratio | Target | Source |
|-------|--------|--------|
| Housing DTI (front-end) | ≤ 28% of gross income | 28/36 rule |
| Total DTI (back-end) | ≤ 36% of gross income | 28/36 rule |
| Emergency fund | 3–6 months expenses (6–12 for self-employed) | Industry standard |
| Savings rate | 10% minimum, 15% recommended, 20%+ optimal | Fidelity / 50-30-20 |
| Credit utilization | < 30% (good), < 10% (optimal) | FICO |
| Life insurance | 10–12× annual income | Industry standard |
| Vehicle (20/4/10) | 20% down, 4-year max loan, 10% gross for transport | Dave Ramsey |
| FIRE number | Annual expenses × 25 | 4% rule (Bengen/Trinity) |
| Expected Net Worth | Age × Pre-tax Income ÷ 10 | Thomas Stanley |
| Retirement milestones | 1× salary by 30, 3× by 40, 6× by 50, 10× by 67 | Fidelity |

#### From Competitive Analysis

| Feature | FinanceFlow | YNAB ($99/yr) | Monarch ($99/yr) | Splitwise (Free) | Actual Budget (FOSS) |
|---------|-------------|---------------|-------------------|-------------------|---------------------|
| Self-hosted | **Yes** | No | No | No | **Yes** |
| Free | **Yes** | No | No | Free tier | **Yes** |
| Budgeting | **Yes** | **Best** | **Yes** | No | **Yes** |
| Expense splitting | **Yes** | No | No | **Best** | No |
| Financial health score | **Yes** | No | **Yes** | No | No |
| Budget templates | **No** | **Yes** | **Yes** | N/A | **Yes** |
| Bank sync | No | **Yes** | **Yes** | No | **Yes** |
| Onboarding wizard | **No** | **Yes** | **Yes** | **Yes** | Partial |
| Net worth history | **No** | No | **Yes** | N/A | **Yes** |
| Notifications/alerts | Partial | **Yes** | **Yes** | **Yes** | No |

**Key differentiator:** FinanceFlow is the **only** self-hosted app combining budgeting + expense splitting + financial health scoring. No competitor does all three.

---

## Part 2: What We Found — System Audit vs Research

### 2.1 Expert Panel Composition

| # | Expert | Background |
|---|--------|-----------|
| 1 | Behavioral Finance Researcher | Nudges, defaults, decision architecture |
| 2 | Personal Finance Coach | CFP — budgeting methodologies, debt payoff |
| 3 | Fintech Product Manager | Ex-Monarch, ex-YNAB — competitive landscape |
| 4 | UX Researcher | Consumer finance apps — onboarding, retention |
| 5 | Security & Privacy Architect | OWASP, self-hosted software hardening |
| 6 | Data Integrity Engineer | Financial systems — reconciliation, accuracy |
| 7 | Indian Market Specialist | UPI, Indian banking, regulatory context |
| 8 | Couples/Collaborative Finance Expert | Relationship + money psychology |
| 9 | Mobile & Performance Engineer | PWA, offline-first, perceived performance |
| 10 | Open Source Strategist | Self-hosted product adoption, community |

### 2.2 Category A — What We Have But Isn't Done Right (9 Issues)

#### A1. No Behavioral Automation (Behavioral Finance Researcher)

**Research says:** Automation is the most reliably effective intervention. Smart defaults, escalation commitments, and timely nudges are the top 3 evidence-based techniques.

**System has:** Recurring transactions and auto-categorization rules (mechanical automation).

**Missing:** Budget templates (84% of budgeters fail from blank-slate start), budget threshold alerts (80%/100%), contextual financial tips at decision points, inactivity nudges. No defaults, no commitment devices, no timely education.

#### A2. Financial Health Score Is a Dead Number (Personal Finance Coach)

**Research says:** CFPB Financial Well-Being Scale (0–100, validated), FinHealth Score with 4 pillars. Score should include benchmarks, improvement roadmap, and connection to action.

**System has:** `overall_score`, `savings_rate`, `debt_to_income`, `emergency_fund_months`, `budget_adherence`. Recommendations list. Score ring with grade.

**Missing:** No benchmark context ("is 65 good?"), no per-ratio improvement tips with action buttons, no Expected Net Worth (Stanley's formula), FIRE calculator disconnected from goals. Score tells you where you are but not how to improve.

#### A3. 21 Sidebar Items — Feature Bloat (Fintech PM)

**Research says:** YNAB has 5 nav items. Monarch has 6. Splitwise has 3. Feature discoverability requires hierarchy, not enumeration.

**System has:** Dashboard, Transactions, Accounts, Categories, Budgets, Subscriptions, Goals, Recurring, Groups, Split Expenses, Financial Health, Reports, Auto Rules, Insights, Calendar, Calculators, Challenges, Export, What's New + 3 footer items = 24 interactive nav elements.

**Problem:** No progressive disclosure. First-time user sees everything. Calculators (226 lines), Challenges (90 lines), Tags (170 lines), Rules (165 lines), Export (61 lines), What's New (39 lines), Calendar (229 lines) are low-frequency features occupying prime real estate.

#### A4. Onboarding Exists But Doesn't Onboard (UX Researcher)

**Research says:** Competitors onboard in 3 clicks. Splitwise asks "Who do you split with?" within 30 seconds. YNAB teaches its methodology during setup.

**System has:** `pfi_onboarding_done` flag, `onboarding.js` route, empty states with CTAs. Privacy banner (`pfi_privacy_accepted`) as first-time friction.

**Missing:** No guided account creation, no methodology picker, no income input, no budget template during setup, no collaborative feature surfacing. Privacy banner is unnecessary for self-hosted (data never leaves user's server).

#### A5. No Reconciliation (Data Integrity Engineer)

**Research says:** Flagged by banker experts in 3 separate review panels. Users who import CSVs have no way to verify accuracy.

**System has:** Account balances calculated from transactions. Manual entry only.

**Missing:** No statement balance comparison, no reconciled/pending transaction states, no balance adjustment transaction type.

#### A6. Missing Indian Financial Year (Indian Market Specialist)

**Research says:** India's fiscal year is April–March. Tax-saving investments (80C/80D) are tracked by FY, not calendar year.

**System has:** Calendar-year-based reports and year-in-review.

**Missing:** Configurable fiscal year start month. All reports, budget periods, and year-in-review should support FY.

#### A7. Splitting Without Shared Life (Couples Finance Expert)

**Research says:** 34% of couples say money causes conflict. Barefoot Investor recommends "date nights" for joint review. "Yours/Mine/Ours" model is standard for couples finance.

**System has:** Groups, splits, settlements, shared budgets, expense comments, invite links.

**Missing:** No shared savings goals, no combined household dashboard, no privacy controls within groups (do members see all transactions or only shared ones?).

#### A8. PWA Gaps (Mobile/Performance Engineer)

**System has:** SW with cache-first assets, IndexedDB offline mutation queue, online/offline banner.

**Missing:** No Background Sync API usage, no PWA manifest shortcuts for quick-add, no conflict resolution for offline mutations. Stats endpoints (22 of them) do full table scans with no caching layer.

#### A9. Dead Security Code (Security Architect)

**System has:** CSRF middleware file (`src/middleware/csrf.js`) that is completely disabled because auth uses X-Session-Token headers (immune to CSRF). API tokens have no scope restrictions (full access).

**Missing:** CSRF file should be removed (confuses audits). API tokens need scopes (read-only, transactions-only, etc.). Backup download should require password re-confirmation.

### 2.3 Category B — What's Completely Missing (10 Features from Research)

| # | Feature | Research Evidence | Priority |
|---|---------|-------------------|----------|
| B1 | **Budget templates** (50/30/20, zero-based, conscious spending) | Every framework recommends a starting template. 84% of budgeters fail from blank slate | **HIGH** |
| B2 | **Save More Tomorrow commitment device** | Thaler/Benartzi: most evidence-backed savings intervention ever studied | HIGH (deferred — complex) |
| B3 | **Net worth trend over time** | Dashboard shows snapshot, no history. Flagged in 3 review panels | **MEDIUM** |
| B4 | **Kakeibo-style journal** (Needs/Wants/Culture/Unexpected) | Japan's 120-year method — 35% savings improvement claimed | LOW (deferred — niche) |
| B5 | **Real hourly wage calculator** | Robin's YMOYL: transforms spending perspective by showing true compensation | LOW (deferred — needs commute data) |
| B6 | **Expected Net Worth benchmark** | Stanley's formula: Age × Income ÷ 10 — PAW/UAW classification | **MEDIUM** |
| B7 | **"Age of Money" metric** | YNAB's killer feature — measures financial buffer without explicit budgeting | MEDIUM (deferred — schema change) |
| B8 | **Reconciliation** | Bank statement balance comparison. Flagged by 3 panels | **MEDIUM** |
| B9 | **Category hierarchy** (parent → child) | 30+ flat categories unwieldy. Food → Groceries/Dining/Coffee. Schema has `parent_id` already | **MEDIUM** |
| B10 | **Monthly digest notification** | In-app monthly summary drives re-engagement | **LOW** |

### 2.4 Category C — What to Remove or Deprecate (9 Items)

| Feature | Reason | Action |
|---------|--------|--------|
| **Privacy banner** (`pfi_privacy_accepted`) | Self-hosted = your data never leaves. A privacy banner for your own server is unnecessary friction | Remove |
| **CSRF middleware file** | Fully disabled — using header-auth which is CSRF-immune. Dead code confuses audits | Remove file, add comment in server.js |
| **Calculators as standalone view** | EMI/SIP/FIRE are contextual tools — belong inside Financial Health view | Merge into Health |
| **Challenges as standalone view** | Challenges ARE goals with game mechanics. Fragments the "saving" story | Merge into Goals |
| **Tags as standalone view** | Power-user config task, not a daily workflow. 170 lines | Move to Settings |
| **Auto Rules as standalone view** | Config, not workflow. Set-and-forget. 165 lines | Move to Settings |
| **What's New as full view** | Changelog is a modal/popover, not a daily-use destination. 39 lines | Convert to modal |
| **Calendar as standalone view** | Dashboard can show "upcoming this week." Full calendar grid rarely used | Merge into Dashboard widget |
| **Export as standalone view** | Admin task done rarely. 61 lines | Move to Settings |

---

## Part 3: What We Decided — Implementation Plan

### 3.1 Guiding Principles

1. **Removal before addition** — Reduce cognitive load first, then add smarter features into the simplified structure.
2. **User journey ordering** — Adoption → Onboarding → Daily engagement → Power-user mastery.
3. **Each phase independently shippable** — Every phase is a tagged release that works standalone.
4. **Test-driven** — Every phase ships with dedicated tests. Baseline: 3044 tests.
5. **No new npm dependencies** — All changes use existing stack.

### 3.2 Phase 1: SIMPLIFY — Information Architecture Cleanup

**Goal:** Reduce sidebar from 21 to 13 items (38% reduction). Remove dead code.

| Task | Description | Effort |
|------|-------------|--------|
| 1.1 | **Remove Privacy Banner** — Delete `pfi_privacy_accepted` logic from app.js, banner HTML from index.html, related CSS | S |
| 1.2 | **Remove CSRF Dead Code** — Delete `src/middleware/csrf.js`, add header-auth explanation comment in server.js | S |
| 1.3 | **Merge Calculators → Financial Health** — Add "Planning Tools" section to health view with 4 collapsible calculator cards. Remove calculators nav item | M |
| 1.4 | **Merge Challenges → Goals** — Add "Challenges" tab/section inside goals view. Remove challenges nav item | S |
| 1.5 | **Move Tags, Rules, Export → Settings** — Add 3 collapsible sections in settings that lazy-load these views. Remove from sidebar | M |
| 1.6 | **Convert What's New → Modal** — Trigger from settings "About" section. Show badge dot when new version available | S |
| 1.7 | **Merge Calendar → Dashboard Widget** — Add "Upcoming This Week" card + **"Group Balances" card** (you owe/you're owed summary) + **time period selector** (7d/30d/90d/1y) for charts. Remove calendar nav item | M |
| 1.8 | **Update Nav Structure** — Remove 8 nav items from index.html. Bump SW cache | S |

**New nav structure:**

| Group | Items |
|-------|-------|
| Core (4) | Dashboard, Transactions, Accounts, Categories |
| Planning (4) | Budgets, Subscriptions, Goals (+Challenges), Recurring |
| Social (2) | Groups, Split Expenses |
| Analysis (3) | Financial Health (+Calculators), Reports, Insights |
| Footer (3) | Theme Toggle, Settings (+Tags, Rules, Export, What's New), Logout |

**Commit:** `v7.0.0` — Major (breaking nav change)  
**Tests:** +40

### 3.3 Phase 2: GUIDE — Onboarding & Budget Templates

**Goal:** Time to first value under 60 seconds. Actionable health score.

| Task | Description | Effort |
|------|-------------|--------|
| 2.1 | **Redesign Onboarding Wizard** — 4-step full-screen modal: (1) Income + currency, (2) Methodology pick (50/30/20, Zero-Based, Just Track), (3) First account, (4) Optional: Create first group. Auto-generates budget from template | M |
| 2.2 | **Budget Templates** — New endpoint `POST /api/budgets/from-template`. Three templates: 50/30/20, Zero-Based (Ramsey), Conscious Spending (Sethi). Pre-fill budget items from income | M |
| 2.3 | **Health Score Enhancement** — Per-ratio benchmark bars with recommended ranges, status indicators (✅/⚠️/❌), improvement tips with action buttons, Stanley's Expected Net Worth, FIRE progress display | M |
| 2.4 | **Net Worth History Chart** — Auto-snapshot via monthly scheduler job. Sparkline on dashboard. Full chart in reports. Trend projection from savings rate | S |
| 2.5 | **Live Category Suggestion** — As user types transaction description, suggest category from auto-rules via existing `/api/categories/suggest` endpoint. Show suggestion chip in the transaction form | S |
| 2.6 | **Verify Cash Flow Forecast Rendering** — `cashflow-forecast` endpoint exists in reports route. Ensure it renders in the Reports view with 30/60/90-day projections based on recurring rules and income | S |

**Commit:** `v7.1.0`  
**Tests:** +45

### 3.4 Phase 3: NUDGE — Behavioral Finance Features

**Goal:** Make the right thing automatic. Proactive over reactive.

| Task | Description | Effort |
|------|-------------|--------|
| 3.1 | **Contextual Financial Tips** — `financialTip(context, data)` function. Rules: rent > 28% income → 28/36 tip, subscriptions > 5% → awareness, vehicle purchase → 20/4/10 rule. Surfaces as info card after transaction creation | M |
| 3.2 | **Budget Threshold Alerts** — After expense transaction creation, check category budget utilization. Notify at 80% and 100% via existing notification system. **Include top 3 transactions that caused the overrun** in the alert | S |
| 3.3 | **Inactivity Nudge** — Scheduler daily job: if > 3 days since last transaction, create notification. Configurable via settings preference | S |
| 3.4 | **Monthly Digest Notification** — Scheduler monthly job: income, expenses, savings rate, top 3 categories, comparison to previous month. Rich expandable notification | M |
| 3.5 | **Financial Year Support** — "Fiscal Year Start" preference (default: January, options: April/July/October). Reports, year-in-review, yearly budgets respect this setting | S |
| 3.6 | **New-IP Login Notification** — When a login occurs from an IP not seen in last 30 days, create notification: "New login from IP X.X.X.X on [date]" | S |
| 3.7 | **Financial Milestones** — Detect and celebrate via notifications: net worth milestones (₹1L/5L/10L), savings streaks (3/6/12 months on track), 100th/500th/1000th transaction, first budget adherence month | S |

**Commit:** `v7.2.0`  
**Tests:** +40

### 3.5 Phase 4: DEEPEN — Advanced Features & Security Hardening

**Goal:** Reward power users, build trust, close security gaps.

| Task | Description | Effort |
|------|-------------|--------|
| 4.1 | **Shared Goals** — Add nullable `group_id` to savings_goals. Group members can view/contribute. Per-member contribution tracking | M |
| 4.2 | **API Token Scopes** — Add `scopes` column to api_tokens table. Scopes: read, write, transactions, reports, full. Middleware enforces scope on each endpoint | M |
| 4.3 | **Reconciliation Mode** — `reconciled_at` column on transactions. Per-account reconcile: enter statement balance, mark transactions, create balance adjustment | M |
| 4.4 | **Category Hierarchy** — Activate `parent_id` in categories UI. Tree view in management. Grouped dropdown in transaction form. Parent-level aggregation in reports | M |
| 4.5 | **Session Management & Password Recovery** — (a) Verify/fix: all sessions killed on password change. (b) Session listing/revocation UI in settings (device, IP, last used, "Revoke" button). (c) Verify admin password reset route exists and is documented | M |
| 4.6 | **Backup Re-authentication** — Admin backup download requires password re-confirmation | S |
| 4.7 | **Guest Group Members** — Verify backend supports nullable `user_id` in `group_members` for non-user participants. If so, add UI to add members by display name only (no account required). If not, add backend support | M |
| 4.8 | **Account Archiving** — Replace CASCADE delete on accounts with `is_archived` soft-delete. Archived accounts hidden from forms but historical transactions preserved for reports | S |
| 4.9 | **Chart Drill-Down** — Clicking a category slice in dashboard/report charts navigates to transactions filtered by that category + time period | S |
| 4.10 | **Transaction Template UI** — Verify `transaction-templates` route is surfaced in the transaction modal. Add "From Template" button for quick-add from saved templates | S |
| 4.11 | **PWA Manifest Shortcuts** — Add shortcuts array (Add Transaction, Dashboard) to manifest.json. Bump SW cache | S |

**Commit:** `v7.3.0`  
**Tests:** +50

### 3.6 Explicitly Deferred to v2/v3 (with reasoning)

| Feature | Deferred To | Reason |
|---------|-------------|--------|
| Save More Tomorrow commitment device | v3 | Requires income change detection + automated savings increase — substantial behavioral system |
| Kakeibo journal view | v3 | Novel but niche — research interest, low user demand for v1 |
| Real hourly wage calculator | v3 | Requires income + commute + work-hours data we don't collect |
| "Age of Money" metric | v3 | Requires transaction-level aging tracking — substantial schema change |
| Bank statement import (OFX/QIF) | v2 | Format parsing complexity — CSV is sufficient |
| Household combined dashboard | v2 | Cross-user data aggregation is architecturally complex |
| UPI settle-up deep link | v2 | Platform-specific (Android intent), limited scope |
| Gold/SIP asset tracking with NAV | v2 | Requires price feed integration |
| Import from Splitwise/YNAB | v2 | Each competitor's export format needs dedicated parser |
| E2E browser tests (Playwright) | v2 | High effort — API tests cover logic, manual visual QA for now |
| TypeScript migration | v3 | High effort, low bug-prevention ROI at current maturity |

---

## Part 4: Cross-Reference Audit

After reviewing the v7 plan against ALL findings from the 55-expert review panel (8 iterations), the original 32-finding review, and the v0.3.1-v0.5.5 roadmap, 13 gaps were identified and incorporated above. Here is the complete traceability:

### Findings → Task Mapping

| Source | Finding | Addressed By |
|--------|---------|-------------|
| Iter 1 PM — No onboarding wizard | Task 2.1 | ✅ |
| Iter 1 PM — Branding inconsistency | Already fixed (codebase says FinanceFlow) | ✅ |
| Iter 1 UI/UX — Password requirements on register | Already implemented | ✅ |
| Iter 1 UI/UX — Sidebar grouping/collapsing | Already implemented + Task 1.8 | ✅ |
| Iter 1 UI/UX — Keyboard shortcuts | Already implemented | ✅ |
| Iter 2 PM — Transaction templates/quick-add | Task 4.10 | ✅ NEW |
| Iter 2 PM — Category suggestion during entry | Task 2.5 | ✅ NEW |
| Iter 2 Finance — Cash flow forecast | Task 2.6 | ✅ NEW |
| Iter 2 Finance — Budget threshold notifications | Task 3.2 | ✅ |
| Iter 2 Finance — Net worth history chart | Task 2.4 | ✅ |
| Iter 2 Banker — Reconciliation mode | Task 4.3 | ✅ |
| Iter 3 PM — Guest/non-user group members | Task 4.7 | ✅ NEW |
| Iter 3 Marketing — Dashboard group balance widget | Task 1.7 (expanded) | ✅ NEW |
| Iter 3 Finance — Shared goals | Task 4.1 | ✅ |
| Iter 4 UI/UX — Interactive chart drill-down | Task 4.9 | ✅ NEW |
| Iter 4 UI/UX — Time period selector for charts | Task 1.7 (expanded) | ✅ NEW |
| Iter 4 Finance — Health score breakdown with tips | Task 2.3 | ✅ |
| Iter 4 Finance — Budget overrun detail | Task 3.2 (enhanced) | ✅ NEW |
| Iter 4 Marketing — Financial milestones | Task 3.7 | ✅ NEW |
| Iter 4 Architect — Bundle Chart.js locally | Already done | ✅ |
| Iter 5 PM — Password recovery/admin reset | Task 4.5 (expanded) | ✅ NEW |
| Iter 5 PM — Active sessions management UI | Task 4.5 (expanded) | ✅ NEW |
| Iter 5 Architect — Remove unsafe-inline CSP | Already fixed in v6.x | ✅ |
| Iter 5 Banker — New-IP login notification | Task 3.6 | ✅ NEW |
| Iter 5 Banker — Restrict CORS default | Already configured | ✅ |
| Iter 6 Architect — Self-host fonts | Already done | ✅ |
| Iter 7 Finance — Soft-delete for accounts | Task 4.8 | ✅ NEW |
| Iter 8 Finance — Budget templates/methodology | Task 2.2 | ✅ |
| Iter 8 Finance — Net worth trend | Task 2.4 | ✅ |
| Research — Budget templates | Task 2.2 | ✅ |
| Research — Contextual education | Task 3.1 | ✅ |
| Research — Ostrich effect / inactivity | Task 3.3 | ✅ |
| Research — Indian FY (Apr-Mar) | Task 3.5 | ✅ |
| Research — Stanley's Net Worth formula | Task 2.3 | ✅ |
| Research — Category hierarchy | Task 4.4 | ✅ |
| Research — Reconciliation | Task 4.3 | ✅ |
| Original C1 — Onboarding | Task 2.1 | ✅ |
| Original C9 — Shared budgets | Already implemented | ✅ |
| Original C15 — Name mismatch | Resolved (FinanceFlow) | ✅ |
| Original C17 — Service layer | Already implemented (10 services) | ✅ |
| Original C19 — Audit log retention | Already implemented (90-day cleanup) | ✅ |

### Findings Explicitly Deferred (with reasoning in plan)

| Finding | Deferred To | Reason |
|---------|-------------|--------|
| Iter 2 Sales — Bank sync via Plaid | v2 | External dependency, privacy implications |
| Iter 3 Sales — Cross-instance federation | v3 | Architecturally complex |
| Iter 5 Architect — HttpOnly cookie session token | v2 | Requires API auth refactor |
| Iter 5 UI/UX — WebAuthn/passkey login | v2 | Requires client-side crypto setup |
| Iter 6 Competitor — Bottom tab bar for mobile | v2 | Major responsive redesign |
| Iter 7 Competitor — OFX/QIF import | v2 | Format parsing complexity |
| Iter 7 Sales — Import from Splitwise/YNAB | v2 | Competitor format parsing |
| Iter 7 Banker — General Ledger export | v2 | Accounting format complexity |
| Iter 8 Architect — PostgreSQL adapter option | v3 | Major database abstraction effort |
| Iter 8 Sales — OpenAPI/Swagger spec | v2 | Documentation tooling |

---

## Part 5: Expected Outcomes (Revised)

| Metric | Before (v6.2.0) | After (v7.3.0) |
|--------|-----------------|-----------------|
| Sidebar items | 21 | 13 (38% reduction) |
| Time to first value | Unknown (no guided onboarding) | < 60 seconds (wizard + template) |
| Budget creation success | Low (blank slate) | High (3 templates pre-fill from income) |
| Health score actionability | Number only | Per-ratio benchmark + improvement tip + action button |
| Net worth tracking | Snapshot only | Monthly history chart with trend projection |
| Behavioral nudges | None | 7 systems (tips, alerts, inactivity, digest, milestones, new-IP, FY) |
| Dead code files | 2 (csrf.js, privacy banner) | 0 |
| Security gaps | 3 (session kill, token scopes, backup auth) | 0 (+ session UI, admin PW reset, new-IP alerts) |
| Guest group members | Not available | Supported (add by name, no account needed) |
| Account deletion | Cascade (data loss) | Archive (history preserved) |
| Chart interactivity | Static display | Click-to-drill-down to transactions |
| Review panel findings covered | — | 40+ findings traced, 10+ explicitly deferred with rationale |
| Total tasks | — | 35 (up from 28) |
| Test count | ~3044 | ~3219 (+175) |
| Tagged releases | v6.2.0 | v7.0.0, v7.1.0, v7.2.0, v7.3.0 |
