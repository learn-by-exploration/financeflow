# FinanceFlow v0.4.0 — Implementation Plan

**Source**: 55-expert panel review across 15 iterations (review-panel-findings.md)
**Current Grade**: C+ (5.3/10)
**Target Grade**: B- (6.5/10)
**Approach**: TDD — tests written BEFORE implementation for every item
**Test Command**: `node --test --test-force-exit tests/*.test.js`
**Current Tests**: 1,421 passing

---

## PHASE 1: SECURITY FOUNDATION (P0)

> These items fix real attack vectors in a financial application. No feature work proceeds until these are closed.

---

### 1.1 Self-Host All External Dependencies

**PM Perspective**: CDN dependencies (Google Fonts, Chart.js, Material Icons) leak user IP to Google/jsDelivr on every page load. This contradicts the core "self-hosted = private" value proposition. Privacy-conscious users — our primary audience — will reject the product on principle.

**Architect Perspective**: Download and bundle locally:
- `Inter` font WOFF2 files → `/public/fonts/`
- `chart.umd.min.js` v4 → `/public/js/vendor/chart.min.js`
- `Material Icons Round` → `/public/fonts/material-icons/`
- Update `@font-face` in `styles.css`, remove CDN `<link>` tags from `index.html` and `login.html`
- Update CSP `fontSrc` and `scriptSrc` to remove CDN domains

**UI/UX Perspective**: No visual change. Fonts and icons render identically. Faster first-paint on slow networks (no DNS lookup + CDN round-trip).

**QA Perspective (TDD)**:
```
File: tests/self-hosted-assets.test.js

Tests to write BEFORE implementation:
1. Verify /public/fonts/ directory contains Inter WOFF2 files
2. Verify /public/js/vendor/chart.min.js exists and is valid JS
3. Verify /public/fonts/material-icons/ contains icon font files
4. Verify index.html contains NO external https:// URLs (except CSP meta)
5. Verify login.html contains NO external https:// URLs
6. Verify styles.css @font-face rules reference local /fonts/ paths
7. Verify CSP fontSrc does NOT include fonts.googleapis.com or fonts.gstatic.com
8. Verify CSP scriptSrc does NOT include cdn.jsdelivr.net
9. Verify GET /fonts/inter-*.woff2 returns 200 with correct Content-Type
10. Verify GET /js/vendor/chart.min.js returns 200 with correct Content-Type
11. Verify GET /fonts/material-icons/*.woff2 returns 200
12. Grep all .html and .css files for external CDN domains — assert zero matches
```

**Files to Modify**: `public/index.html`, `public/login.html`, `public/css/styles.css`, `src/server.js` (CSP config)
**Files to Create**: `public/fonts/inter-*.woff2`, `public/js/vendor/chart.min.js`, `public/fonts/material-icons/`
**Effort**: S (2 hours)

---

### 1.2 Remove CSP `'unsafe-inline'` — Extract Login Scripts/Styles

**PM Perspective**: `'unsafe-inline'` in CSP allows any injected inline script to execute. For a financial app storing session tokens in localStorage, this is a direct path to account takeover via XSS.

**Architect Perspective**:
- Extract `login.html` inline `<script>` (95 lines) → `/public/js/login.js`
- Extract `login.html` inline `<style>` block → `/public/css/login.css`
- Link both via `<script src>` and `<link rel="stylesheet">`
- Remove `'unsafe-inline'` from `scriptSrc` in `server.js` Helmet config
- For `styleSrc`: if any remaining inline styles exist in `index.html`, extract those too. Otherwise remove `'unsafe-inline'` from `styleSrc` as well.
- Fix duplicate `module.exports` in `src/middleware/csrf.js` (copy-paste artifact)

**UI/UX Perspective**: No visual change. Login page renders identically.

**QA Perspective (TDD)**:
```
File: tests/csp-security.test.js

Tests to write BEFORE implementation:
1. Verify login.html contains no <script> tags with inline content
2. Verify login.html contains no <style> tags with inline content
3. Verify login.html has <script src="/js/login.js">
4. Verify login.html has <link rel="stylesheet" href="/css/login.css">
5. Verify GET /js/login.js returns 200 with application/javascript
6. Verify GET /css/login.css returns 200 with text/css
7. Verify server CSP header does NOT contain 'unsafe-inline' in script-src
8. Verify server CSP header does NOT contain 'unsafe-inline' in style-src
9. Verify login.js contains the form submission logic (check for addEventListener)
10. Verify login.css contains .auth-card styling
11. Verify POST /api/auth/login still works after script extraction
12. Verify POST /api/auth/register still works after script extraction
13. Verify csrf.js has exactly ONE module.exports statement
14. Verify CSP header includes 'self' in script-src
15. Verify CSP includes Permissions-Policy header (deny camera, microphone, geolocation)
```

**Files to Modify**: `public/login.html`, `src/server.js` (CSP), `src/middleware/csrf.js`
**Files to Create**: `public/js/login.js`, `public/css/login.css`
**Effort**: S (2 hours)

---

### 1.3 Restrict CORS Default from `'*'`

**PM Perspective**: Open CORS allows any website to make authenticated requests to the API. Combined with localStorage tokens readable by JS, this is a cross-origin attack vector.

**Architect Perspective**:
- Change `config.js`: `cors.origins` default from `'*'` to `''` (empty = same-origin only)
- Add startup warning in `server.js`: if `config.cors.origins === '*'` and `config.isProd`, log a WARN
- Update `.env.example` to document: `CORS_ORIGINS=https://your-domain.com`
- In CORS middleware setup, handle empty string as "same-origin only" (don't set `Access-Control-Allow-Origin` header, or set to the request origin if it matches)

**UI/UX Perspective**: No change for users accessing via the same origin (default deployment).

**QA Perspective (TDD)**:
```
File: tests/cors-default.test.js

Tests to write BEFORE implementation:
1. Verify config.cors.origins defaults to '' (or undefined) when CORS_ORIGINS env not set
2. Verify response does NOT include Access-Control-Allow-Origin: * by default
3. Verify CORS preflight (OPTIONS) returns 204 only when origin matches config
4. Verify cross-origin request from unknown origin is rejected
5. Verify cross-origin request from configured origin is allowed
6. Verify startup logs warning when CORS_ORIGINS='*' in production mode
7. Verify .env.example documents CORS_ORIGINS with example
```

**Files to Modify**: `src/config.js`, `src/server.js`, `.env.example`
**Effort**: S (15 minutes)

---

## PHASE 2: IDENTITY & FIRST IMPRESSIONS (P1)

> Fix the branding crisis and first-run experience that causes immediate user churn.

---

### 2.1 Unify Branding (PersonalFi → FinanceFlow)

**PM Perspective**: Login page says "PersonalFi", manifest says "FinanceFlow", README says "PersonalFi". Users and developers can't tell what the product is called. Pick FinanceFlow (matches the repo name) and unify everywhere.

**Architect Perspective**:
- `login.html`: Change `<h1>` from "PersonalFi" to config brand name or "FinanceFlow"
- `manifest.json`: Already says "FinanceFlow" — verify
- `index.html`: Verify `<title>` matches
- `config.js`: Change `brand.name` default from "PersonalFi" to "FinanceFlow"
- `sw.js`: Update cache name from `personalfi-v0.3.47` to `financeflow-v0.4.0`
- `package.json`: Verify `name` field
- Login page subtitle: Change to "Your money. Your server. Your rules." (distinctive tagline)

**UI/UX Perspective**: Consistent identity across all touchpoints. Tagline communicates the self-hosted value prop in one line.

**QA Perspective (TDD)**:
```
File: tests/branding-consistency.test.js

Tests to write BEFORE implementation:
1. Verify login.html does NOT contain "PersonalFi" (only FinanceFlow or brand config)
2. Verify manifest.json name and short_name say "FinanceFlow"
3. Verify index.html <title> says "FinanceFlow"
4. Verify config.brand.name defaults to "FinanceFlow"
5. Verify sw.js cache name starts with "financeflow-"
6. Verify sw.js cache version matches package.json version
7. Verify login page subtitle contains distinctive tagline (not generic)
8. Verify GET /api/branding returns name: "FinanceFlow" by default
9. Verify Settings version display matches package.json version (not hardcoded '0.1.7')
```

**Files to Modify**: `public/login.html`, `public/sw.js`, `src/config.js`, `public/js/views/settings.js`
**Effort**: S (30 minutes)

---

### 2.2 Fix Service Worker Cache Version

**PM Perspective**: SW cache at v0.3.47 while package.json is at v0.3.50+ means 3+ releases of stale assets served to PWA users. Users see old UI/bugs after updates.

**Architect Perspective**:
- Update `sw.js` `CACHE_NAME` to derive version from a single source
- Add all view JS files to `STATIC_ASSETS` array (currently missing `/js/views/*.js`)
- Add `chart.min.js` (once locally bundled) to static assets

**UI/UX Perspective**: PWA users always get the latest version after update.

**QA Perspective (TDD)**:
```
Covered in branding-consistency.test.js (test 6 above) + additional:
1. Verify sw.js STATIC_ASSETS includes /js/app.js
2. Verify sw.js STATIC_ASSETS includes /js/utils.js
3. Verify sw.js STATIC_ASSETS includes /css/styles.css
4. Verify sw.js STATIC_ASSETS includes view JS files
```

**Files to Modify**: `public/sw.js`
**Effort**: S (15 minutes)

---

### 2.3 Password Requirements on Registration Form

**PM Perspective**: Registration enforces uppercase, lowercase, number, special char, 8+ length via Zod schema — but the form shows zero hints. Users fail 3-4 times before guessing the policy.

**Architect Perspective**: Display requirements below password field when in register mode. Can be purely frontend — add a `<ul>` with requirements that shows/hides based on register toggle.

**UI/UX Perspective**: Bullet list below password field: "8+ characters, uppercase, lowercase, number, special character". Optionally: live checkmarks as user types (green check when criterion met).

**QA Perspective (TDD)**:
```
File: tests/registration-ux.test.js

Tests to write BEFORE implementation:
1. Verify login.html (or login.js) contains password requirement text
2. Verify requirements include: "8+ characters", "uppercase", "lowercase", "number", "special"
3. Verify requirements are only visible in register mode (not login mode)
4. Verify POST /api/auth/register with weak password returns descriptive error
5. Verify POST /api/auth/register with valid password succeeds
```

**Files to Modify**: `public/js/login.js` (after extraction), or `public/login.html` if not yet extracted
**Effort**: S (1 hour)

---

### 2.4 First-Run Onboarding Checklist

**PM Perspective**: After registration, users land on a blank dashboard with 18 sidebar items and zero data. Critical churn point. Show a dismissible onboarding card: "Add an account → Add a transaction → Set your first budget". Track completion in user settings.

**Architect Perspective**:
- Add `onboarding_completed` boolean to user settings/preferences (migration)
- Create GET `/api/users/onboarding` endpoint returning checklist status
- Create PUT `/api/users/onboarding` to mark steps complete
- Check at login: if `onboarding_completed = false`, show card on dashboard
- Checklist items: 1) Add an account, 2) Add a transaction, 3) Create a budget
- Auto-detect completion by checking if user has ≥1 account, ≥1 transaction, ≥1 budget

**UI/UX Perspective**: Dismissible card below greeting on dashboard. 3 items with checkboxes. Each item links to the relevant view. Card disappears after all 3 done or user dismisses.

**QA Perspective (TDD)**:
```
File: tests/onboarding.test.js

Tests to write BEFORE implementation:
1. GET /api/users/onboarding returns checklist for new user (all incomplete)
2. After creating an account, onboarding step 1 is auto-completed
3. After creating a transaction, onboarding step 2 is auto-completed
4. After creating a budget, onboarding step 3 is auto-completed
5. PUT /api/users/onboarding/dismiss marks onboarding as dismissed
6. GET /api/stats/overview includes onboarding status for new users
7. GET /api/stats/overview does NOT include onboarding for completed users
8. Onboarding state persists across sessions
9. Demo user (seed) has onboarding already completed
10. Second user gets their own independent onboarding state
```

**Files to Modify**: `src/routes/stats.js` or new `src/routes/onboarding.js`, `src/db/migrations/` (new migration), dashboard view
**Effort**: S-M (3 hours)

---

## PHASE 3: ACCESSIBILITY COMPLIANCE (P1)

> WCAG 2.1 AA compliance — required for inclusive access and enterprise adoption.

---

### 3.1 Make Nav Items Keyboard-Focusable

**PM Perspective**: 18 sidebar nav items are `<li>` with click handlers but no `tabindex` or ARIA role. Screen reader and keyboard-only users cannot navigate the app at all.

**Architect Perspective**:
- In `app.js` where nav items are created: add `tabindex="0"` and `role="button"` to each `.nav-item[data-view]`
- Add `keydown` listener for Enter/Space to trigger the same handler as click
- OR: Convert nav items from `<li>` to `<button>` elements (semantically correct)

**UI/UX Perspective**: Tab key now cycles through nav items. Enter/Space activates navigation. Visual focus ring (`:focus-visible`) already styled.

**QA Perspective (TDD)**:
```
File: tests/keyboard-nav.test.js

Tests to write BEFORE implementation:
1. Verify all .nav-item elements have tabindex="0" or are <button> elements
2. Verify all .nav-item elements have role="button" (if <li>) or are native <button>
3. Verify keydown handler exists for Enter key on nav items
4. Verify keydown handler exists for Space key on nav items
5. Verify :focus-visible styles apply to nav items
6. Verify tab order follows visual order of nav items
```

**Files to Modify**: `public/js/app.js`, possibly `public/index.html`
**Effort**: S (1 hour)

---

### 3.2 Fix Color Contrast (`--text-muted`)

**PM Perspective**: `--text-muted` (#64748b) on `--bg-primary` (#0f172a) has ~3.5:1 contrast ratio — below WCAG AA 4.5:1 minimum. Affects greetings, labels, timestamps throughout the app.

**Architect Perspective**: Change `--text-muted` from `#64748b` to `#8893a7` (or similar) to achieve ≥4.5:1 ratio.

**UI/UX Perspective**: Slightly brighter muted text. Maintains visual hierarchy while meeting accessibility requirements.

**QA Perspective (TDD)**:
```
File: tests/color-contrast.test.js

Tests to write BEFORE implementation:
1. Verify --text-muted CSS variable value has ≥4.5:1 contrast ratio against --bg-primary
2. Compute contrast ratio programmatically in test (parse hex, calculate relative luminance)
3. Verify --text-secondary also meets 4.5:1 minimum
4. Verify --green and --red meet 3:1 minimum against --bg-secondary (for non-text elements)
```

**Files to Modify**: `public/css/styles.css`
**Effort**: S (15 minutes)

---

### 3.3 Toast Notifications with `role="status"` + Non-Color Income/Expense Indicators

**PM Perspective**: Toasts are invisible to screen readers (no ARIA). Income/expense distinction is color-only (green/red) — 8% of males with red-green color blindness can't distinguish them.

**Architect Perspective**:
- Toast: Add `role="status"` and `aria-live="polite"` to toast container, or pipe toast messages through `announceToScreenReader()`
- Transactions: Add `+` prefix for income, `−` prefix for expense amounts. Optionally add ▲/▼ icons.

**UI/UX Perspective**: Screen reader users hear toast messages. All users can distinguish income/expense regardless of color vision.

**QA Perspective (TDD)**:
```
File: tests/a11y-indicators.test.js

Tests to write BEFORE implementation:
1. Verify toast container has role="status" or aria-live="polite"
2. Verify utils.js toast() function updates an aria-live region
3. Verify transaction amount display includes +/− prefix (not just color)
4. Verify income amounts have "+" or "▲" indicator
5. Verify expense amounts have "−" or "▼" indicator
6. Verify transfer amounts have distinct indicator (→ or ↔)
7. Verify budget progress uses icon alongside color (✅ under, ⚠️ near, ❌ over)
```

**Files to Modify**: `public/js/utils.js` (toast function), `public/js/views/transactions.js`, `public/index.html` (toast container)
**Effort**: S (1 hour)

---

## PHASE 4: DEVELOPER EXPERIENCE (P1)

> Enable community contributions and CI to sustain the project.

---

### 4.1 GitHub Actions CI + `c8` Coverage

**PM Perspective**: No CI means contributors can't see if their PR passes tests. No coverage badge in README. This blocks community growth.

**Architect Perspective**:
- Create `.github/workflows/ci.yml`: on push/PR → Node 22 → `npm ci` → `npm test`
- Add `c8` to devDependencies
- Update test script: `"test": "c8 node --test --test-force-exit tests/*.test.js"`
- Add coverage badge to README
- Add `npm audit --audit-level=high` step

**UI/UX Perspective**: N/A (developer tooling)

**QA Perspective (TDD)**:
```
File: tests/ci-config.test.js

Tests to write BEFORE implementation:
1. Verify .github/workflows/ci.yml exists
2. Verify ci.yml triggers on push and pull_request
3. Verify ci.yml uses Node.js 22
4. Verify ci.yml runs npm test
5. Verify package.json devDependencies includes c8
6. Verify npm audit exits cleanly (no high/critical vulnerabilities)
```

**Files to Create**: `.github/workflows/ci.yml`
**Files to Modify**: `package.json` (devDependencies, test script), `README.md` (badge)
**Effort**: S (1 hour)

---

### 4.2 CONTRIBUTING.md + Architecture Docs

**PM Perspective**: No contribution guide means no one knows how to submit PRs, run tests, or follow coding standards. Bus factor = 1 remains.

**Architect Perspective**:
- Create `CONTRIBUTING.md`: local setup, coding standards, test requirements, PR process
- Create `docs/architecture.md`: Mermaid diagram of layered architecture (routes → services → repositories → db), middleware stack, frontend SPA structure
- Add test category scripts to `package.json`: `test:auth`, `test:security`, `test:perf`
- Add `.vscode/launch.json` for Node.js debugging
- Update dev script to pipe through pino-pretty: `"dev": "node --watch src/server.js | npx pino-pretty"`

**UI/UX Perspective**: N/A

**QA Perspective (TDD)**:
```
File: tests/dev-experience.test.js

Tests to write BEFORE implementation:
1. Verify CONTRIBUTING.md exists and is non-empty
2. Verify docs/architecture.md exists and contains Mermaid diagram syntax
3. Verify package.json has test:auth, test:security, test:perf scripts
4. Verify .env.example documents all config options
```

**Files to Create**: `CONTRIBUTING.md`, `docs/architecture.md`, `.vscode/launch.json`
**Files to Modify**: `package.json`
**Effort**: S (2 hours)

---

## PHASE 5: INDIAN MARKET FIT (P2)

> The app defaults to INR but lacks core Indian financial features.

---

### 5.1 Indian Financial Year Toggle (April–March)

**PM Perspective**: All reports use calendar year (Jan–Dec). Indian tax filing, budgeting, and planning revolve around April–March FY. Without this, reports are useless for Indian users during tax season.

**Architect Perspective**:
- Add `financial_year_start` preference (default: 1 = January, option: 4 = April for Indian FY)
- Update report APIs to accept `fy=true` query param or use user preference
- Report date calculations: when FY mode, "current year" means Apr 1 current/previous → Mar 31 next
- Budget period selectors should offer FY option

**UI/UX Perspective**: Toggle in Settings: "Financial Year: Calendar (Jan-Dec) / Indian (Apr-Mar)". Reports view shows "FY 2025-26" instead of "2026" when Indian FY selected.

**QA Perspective (TDD)**:
```
File: tests/financial-year.test.js

Tests to write BEFORE implementation:
1. Verify preference accepts financial_year_start values 1-12
2. Verify reports API with FY=April returns Apr-Mar data
3. Verify reports API with FY=January returns Jan-Dec data (default)
4. Verify monthly trends in FY mode start from April
5. Verify budget summary respects FY boundaries
6. Verify "this year" filter uses FY start month
7. Verify FY label format: "FY 2025-26" for April-March
8. Verify transaction date filtering aligns with FY boundaries
9. Verify dashboard "this year" stats use FY preference
10. Verify export with date range respects FY selection
```

**Files to Modify**: `src/schemas/preferences.schema.js`, `src/routes/reports.js`, `src/routes/stats.js`, `public/js/views/reports.js`
**New Migration**: Add `financial_year_start` to user preferences
**Effort**: M (4 hours)

---

### 5.2 UPI Reference Field on Transactions

**PM Perspective**: UPI handles 10B+ monthly transactions in India. Users need to record UTR (12-digit reference) for payment disputes and reconciliation. Currently no reference field exists.

**Architect Perspective**:
- Add `reference_id` TEXT field to transactions table (migration)
- Add to transaction schema (Zod) as optional string
- Display in transaction form and transaction detail
- Support filtering/searching by reference_id

**UI/UX Perspective**: Optional "Reference / UPI ID" text field in transaction form. Shown in transaction detail view.

**QA Perspective (TDD)**:
```
File: tests/transaction-reference.test.js

Tests to write BEFORE implementation:
1. POST /api/transactions with reference_id stores it correctly
2. GET /api/transactions returns reference_id in response
3. reference_id is optional (null when not provided)
4. reference_id accepts alphanumeric strings up to 50 chars
5. reference_id is searchable via transaction search
6. reference_id is included in JSON export
7. reference_id is included in CSV export
8. reference_id survives import/export round-trip
```

**Files to Modify**: `src/db/migrations/` (new), `src/schemas/transaction.schema.js`, `src/repositories/transaction.repository.js`, `src/routes/transactions.js`, `public/js/views/transactions.js`
**Effort**: S (1 hour)

---

### 5.3 User Preference-Driven Date and Number Formatting

**PM Perspective**: Users set `date_format` and `number_format` preferences but they're ignored. Indian users expect DD/MM/YYYY dates and lakh/crore grouping. Currently hardcoded to `en-IN` regardless of preference.

**Architect Perspective**:
- Update `fmt()` in `utils.js` to read user's `number_format` preference
- Create `formatDate()` utility that reads `date_format` preference
- Replace all `toLocaleDateString()` calls in views with `formatDate()`
- Store user preferences in frontend state after login

**UI/UX Perspective**: Dates and numbers render according to user's chosen format across all views.

**QA Perspective (TDD)**:
```
File: tests/user-formatting.test.js

Tests to write BEFORE implementation:
1. Verify fmt() with en-IN locale formats ₹1,50,000 (lakh grouping)
2. Verify fmt() with en-US locale formats ₹150,000 (standard grouping)
3. Verify formatDate() with DD/MM/YYYY format renders "15/03/2026"
4. Verify formatDate() with YYYY-MM-DD format renders "2026-03-15"
5. Verify formatDate() with MM/DD/YYYY format renders "03/15/2026"
6. Verify preference changes are reflected in API responses
7. Verify CSV export respects date format preference
```

**Files to Modify**: `public/js/utils.js`, all 18 view files (replace `toLocaleDateString`)
**Effort**: M (3 hours)

---

## PHASE 6: CORE UX IMPROVEMENTS (P2)

---

### 6.1 Sidebar Navigation Grouping

**PM Perspective**: 18 sidebar items are overwhelming. Group into logical sections to reduce cognitive load and improve discoverability.

**Architect Perspective**: Restructure sidebar HTML/JS:
- **Core**: Dashboard, Transactions, Accounts, Categories
- **Planning**: Budgets, Subscriptions, Goals, Recurring
- **Social**: Groups, Split Expenses
- **Analysis**: Financial Health, Reports, Insights, Calendar
- **System**: Auto Rules, Export, What's New, Settings

**UI/UX Perspective**: Collapsible groups with section headers. Each group is toggle-expandable. "Core" expanded by default. Current view's group auto-expands.

**QA Perspective (TDD)**:
```
File: tests/sidebar-groups.test.js

Tests to write BEFORE implementation:
1. Verify index.html sidebar has group containers
2. Verify each nav item belongs to a group
3. Verify group headers are present (Core, Planning, Social, Analysis, System)
4. Verify group collapse/expand toggles exist
5. Verify active view's group is expanded by default
6. Verify group state persists across view changes
7. Verify all 18 nav items are still accessible
8. Verify keyboard navigation works across groups
```

**Files to Modify**: `public/index.html`, `public/js/app.js`, `public/css/styles.css`
**Effort**: M (3 hours)

---

### 6.2 Keyboard Shortcuts

**PM Perspective**: Power users have no quick-nav. Competitors (YNAB, Splitwise) offer keyboard shortcuts. Essential for efficiency.

**Architect Perspective**:
- `?` — Show shortcuts modal
- `d` — Dashboard
- `t` — Transactions
- `n` — New transaction (open modal)
- `b` — Budgets
- `g` — Groups
- `Escape` — Close modal/sidebar
- Only activate when no input/textarea is focused

**UI/UX Perspective**: `?` opens a help modal listing all shortcuts. Shortcuts shown as badges next to nav items.

**QA Perspective (TDD)**:
```
File: tests/keyboard-shortcuts.test.js

Tests to write BEFORE implementation:
1. Verify app.js registers keydown listener on document
2. Verify shortcuts are NOT active when input/textarea is focused
3. Verify '?' key handler exists (show help)
4. Verify 'd' key navigates to dashboard
5. Verify 't' key navigates to transactions
6. Verify 'n' key opens new transaction modal
7. Verify 'b' key navigates to budgets
8. Verify Escape closes any open modal
9. Verify shortcuts modal lists all available shortcuts
```

**Files to Modify**: `public/js/app.js`
**Effort**: S (2 hours)

---

### 6.3 Budget Threshold Notifications (80%/100%)

**PM Perspective**: Budget has visual progress bars but no proactive alert. Users discover they've overspent only when they manually check. A notification at 80% and 100% creates a behavioral nudge.

**Architect Perspective**:
- In the budget checking logic (scheduler or on transaction creation): compare spent vs limit
- When crossing 80% or 100% threshold, create a notification via existing notification system
- Avoid duplicate notifications (check if notification already sent for this budget+period+threshold)

**UI/UX Perspective**: Notification bell shows "Budget Alert: Food & Dining at 82% (₹8,200 / ₹10,000)". Yellow at 80%, red at 100%.

**QA Perspective (TDD)**:
```
File: tests/budget-notifications.test.js

Tests to write BEFORE implementation:
1. Creating a transaction that pushes budget to 80% triggers notification
2. Creating a transaction that pushes budget to 100% triggers notification
3. No duplicate notification for same budget+period+threshold
4. Notification includes budget name, percentage, amounts
5. 80% notification has warning level
6. 100% notification has alert/error level
7. Budget at 79% does NOT trigger notification
8. Multiple budgets can each trigger independently
9. Notification persists until dismissed
10. Budget recalculation after transaction deletion updates status correctly
```

**Files to Modify**: `src/routes/transactions.js` (or service layer), `src/routes/notifications.js`
**Effort**: S (2 hours)

---

### 6.4 Health Score Breakdown with Improvement Tips

**PM Perspective**: Users see a number (e.g., 72) but don't understand what drives it. Show each ratio's contribution with specific improvement tips.

**Architect Perspective**:
- Expand health score API response to include individual ratio scores and tips
- Each ratio (savings rate, expense ratio, debt ratio, etc.) gets a score + recommendation
- Structure: `{ total: 72, ratios: [{ name: "Savings Rate", score: 8, value: "25%", recommendation: "Aim for 20%+ — you're on track!" }] }`

**UI/UX Perspective**: Health score view shows expandable sections for each ratio. Green/yellow/red indicator per ratio. Each has a "How to improve" tip.

**QA Perspective (TDD)**:
```
File: tests/health-breakdown.test.js

Tests to write BEFORE implementation:
1. GET /api/stats/health returns ratios array
2. Each ratio has name, score, value, and recommendation
3. Savings rate ratio calculated correctly from test data
4. Expense ratio calculated correctly
5. Ratios sum to total score (or weighted average matches)
6. Recommendations are contextual (different tip based on value)
7. User with no data gets "insufficient data" response
8. User with only income gets appropriate partial score
```

**Files to Modify**: `src/routes/stats.js`, `public/js/views/health.js`
**Effort**: S (2 hours)

---

## PHASE 7: COLLABORATIVE FEATURES (P2)

---

### 7.1 Group Invite Links

**PM Perspective**: Adding members requires knowing their username on the same instance. A shareable join link/QR code eliminates friction.

**Architect Perspective**:
- Generate unique invite token per group (UUID or crypto.randomBytes)
- Store in `group_invites` table: group_id, token, created_by, expires_at, max_uses
- Create POST `/api/groups/:id/invite` — generates invite link
- Create POST `/api/groups/join/:token` — joins group via invite
- Invite URL format: `{baseUrl}/join/{token}`

**UI/UX Perspective**: "Invite" button in group view generates a copyable link. Optional QR code generation for in-person sharing.

**QA Perspective (TDD)**:
```
File: tests/group-invites.test.js

Tests to write BEFORE implementation:
1. POST /api/groups/:id/invite generates a unique token
2. Invite token is non-guessable (sufficient entropy)
3. POST /api/groups/join/:token adds user to group
4. Expired invite returns 410 Gone
5. Used-up invite (max_uses reached) returns 410
6. Invalid token returns 404
7. User already in group using invite returns appropriate error
8. Only group admin/creator can generate invites
9. Invite token is revocable (DELETE /api/groups/:id/invite/:token)
10. Multiple invites can exist per group
```

**Files to Create**: `src/routes/group-invites.js`, migration for `group_invites` table
**Files to Modify**: `src/server.js` (register route)
**Effort**: S-M (2 hours)

---

### 7.2 Dashboard Group Balance Widget

**PM Perspective**: Collaborative features are invisible from the dashboard. Users must navigate to Splits to see group balances. A dashboard summary surfaces collaborative value daily.

**Architect Perspective**:
- Add aggregate group balance to dashboard stats API
- Structure: `{ groups_owed: 800, groups_owing: 1200, net: -400, group_count: 2 }`
- Include in GET `/api/stats/overview` response

**UI/UX Perspective**: Card on dashboard: "Groups: You owe ₹1,200 across 2 groups" with "Settle Up" link. Shows "All settled up! ✓" when net = 0.

**QA Perspective (TDD)**:
```
File: tests/dashboard-groups.test.js

Tests to write BEFORE implementation:
1. GET /api/stats/overview includes groups_balance object
2. groups_balance shows correct net when user owes money
3. groups_balance shows correct net when user is owed money
4. groups_balance shows zeros when all settled
5. groups_balance shows zeros when user has no groups
6. groups_balance updates after new expense added
7. groups_balance updates after settlement
8. group_count reflects only active groups
```

**Files to Modify**: `src/routes/stats.js`, `public/js/views/dashboard.js`
**Effort**: M (2 hours)

---

### 7.3 Expense Comments

**PM Perspective**: Group members can't discuss expenses. "What was this ₹2,000 charge?" requires going outside the app.

**Architect Perspective**:
- Create `expense_comments` table: id, expense_id, user_id, comment, created_at
- POST `/api/groups/:gid/expenses/:eid/comments` — add comment
- GET `/api/groups/:gid/expenses/:eid/comments` — list comments
- Only group members can comment

**UI/UX Perspective**: Comment thread below each shared expense. Text input with send button. Timestamps and author names shown.

**QA Perspective (TDD)**:
```
File: tests/expense-comments.test.js

Tests to write BEFORE implementation:
1. POST comment on expense succeeds for group member
2. POST comment on expense fails for non-member
3. GET comments returns all comments for expense in chronological order
4. Comment includes author display_name and created_at
5. Empty comment is rejected (validation)
6. Comment length is capped (e.g., 500 chars)
7. Deleting expense cascades to comments
8. Comments are included in group activity log
```

**Files to Create**: `src/routes/expense-comments.js`, migration for `expense_comments` table
**Effort**: S (2 hours)

---

## PHASE 8: REPORTING & DATA (P2)

---

### 8.1 Net Worth History Chart

**PM Perspective**: `net_worth_snapshots` table exists but no chart shows the data. Net worth trend is the #1 most motivating personal finance visualization.

**Architect Perspective**:
- Ensure scheduler creates monthly net worth snapshots (or compute on demand from transaction history)
- Create GET `/api/reports/net-worth-history` returning monthly net worth values
- Return array: `[{ date: '2025-04', net_worth: 150000 }, ...]`

**UI/UX Perspective**: Line chart on Reports or Dashboard showing net worth over time. Y-axis is currency, X-axis is months.

**QA Perspective (TDD)**:
```
File: tests/net-worth-history.test.js

Tests to write BEFORE implementation:
1. GET /api/reports/net-worth-history returns array of snapshots
2. Snapshots are sorted chronologically
3. Each snapshot has date and net_worth fields
4. New user with no data returns empty array
5. User with accounts returns at least current month snapshot
6. Net worth calculation matches accounts sum (assets - liabilities)
7. Date range filter works (from/to params)
8. Excluded accounts (include_in_net_worth=false) are omitted
```

**Files to Modify**: `src/routes/reports.js`, `public/js/views/reports.js`
**Effort**: M (3 hours)

---

### 8.2 Per-Account Transaction List with Running Balance

**PM Perspective**: No way to see transactions scoped to one account with cumulative balance. Banks show this; users expect it.

**Architect Perspective**:
- GET `/api/accounts/:id/transactions` — returns transactions for that account with running_balance computed
- Use window function or application-level running sum
- Include account current balance in response header or meta

**UI/UX Perspective**: Click account card → opens account detail with transaction list showing running balance column.

**QA Perspective (TDD)**:
```
File: tests/account-transactions.test.js

Tests to write BEFORE implementation:
1. GET /api/accounts/:id/transactions returns only that account's transactions
2. Response includes running_balance for each transaction
3. Running balance starts from account's opening/first transaction
4. Running balance is cumulative (each row = previous + current)
5. Income adds to running balance, expense subtracts
6. Pagination works with running balance continuity
7. Date filtering works
8. Non-owner cannot access another user's account transactions
```

**Files to Modify**: `src/routes/accounts.js` or `src/routes/transactions.js`, `src/repositories/transaction.repository.js`
**Effort**: S (2 hours)

---

### 8.3 Custom Date Range for Reports

**PM Perspective**: Reports use fixed 12-month window. Users need to compare arbitrary periods (Q1 2025 vs Q1 2026, specific month ranges).

**Architect Perspective**:
- Add `from` and `to` query parameters to report endpoints
- Default to last 12 months if not specified (backward compatible)
- Validate date range (from < to, max range reasonable)

**UI/UX Perspective**: Date picker on Reports view: "From [date] To [date]" with presets: "Last 30 days", "Last 3 months", "This year", "Last year", "Custom".

**QA Perspective (TDD)**:
```
File: tests/custom-date-reports.test.js

Tests to write BEFORE implementation:
1. GET /api/reports/trends?from=2025-01-01&to=2025-03-31 returns 3 months
2. GET /api/reports/trends without params returns default 12 months
3. Invalid date range (from > to) returns 400
4. Single-day range works
5. Category breakdown respects date range
6. Income/expense totals match filtered period
```

**Files to Modify**: `src/routes/reports.js`
**Effort**: M (2 hours)

---

## PHASE 9: PERFORMANCE (P2)

---

### 9.1 SQLite FTS5 for Transaction Search

**PM Perspective**: Transaction search uses `LIKE '%term%'` — full table scan on every query. At 100K transactions, search takes 1-2 seconds. FTS5 makes it sub-millisecond.

**Architect Perspective**:
- Create migration: `CREATE VIRTUAL TABLE transactions_fts USING fts5(description, payee, note, content=transactions, content_rowid=id)`
- Add triggers to keep FTS in sync on INSERT/UPDATE/DELETE
- Replace `LIKE` query in search with FTS5 `MATCH` query
- Fallback gracefully if FTS5 extension not available

**UI/UX Perspective**: Search is instant regardless of data size.

**QA Perspective (TDD)**:
```
File: tests/fts-search.test.js

Tests to write BEFORE implementation:
1. Transaction search returns results for matching description
2. Transaction search returns results for matching payee
3. Transaction search returns results for matching note
4. Search is case-insensitive
5. Partial word search works (prefix matching)
6. Search with no results returns empty array
7. New transaction is immediately searchable
8. Updated transaction description is searchable with new text
9. Deleted transaction is no longer searchable
10. Search performance: 10K transactions, search completes in <100ms
11. FTS table exists after migration
12. Special characters in search don't cause errors
```

**Files to Create**: `src/db/migrations/` (new FTS migration)
**Files to Modify**: `src/repositories/transaction.repository.js`
**Effort**: S (2 hours)

---

### 9.2 Cache Size Limit + LRU Eviction

**PM Perspective**: In-memory cache in `cache.js` grows unboundedly. Long-running instances with multiple users risk OOM.

**Architect Perspective**:
- Add `MAX_CACHE_SIZE` config (default: 200 entries)
- Implement LRU eviction: track access timestamps, evict oldest when limit reached
- OR use a simple Map with size check before insertion

**UI/UX Perspective**: No visible change. Response times remain fast.

**QA Perspective (TDD)**:
```
File: tests/cache-limits.test.js

Tests to write BEFORE implementation:
1. Cache stores entries up to MAX_CACHE_SIZE
2. Adding entry beyond limit evicts oldest entry
3. Accessing an entry updates its recency (LRU)
4. Cache invalidation still works with LRU
5. Cache size is configurable via config
6. Default MAX_CACHE_SIZE is reasonable (100-500)
```

**Files to Modify**: `src/middleware/cache.js`, `src/config.js`
**Effort**: S (1 hour)

---

## PHASE 10: DATA MANAGEMENT (P3)

---

### 10.1 Transaction Templates / Quick-Add

**PM Perspective**: Adding "Coffee at Starbucks — ₹350 — Food & Dining" for the 50th time is tedious. Save frequent transactions as templates for one-tap add.

**Architect Perspective**:
- Create `transaction_templates` table: user_id, name, description, amount, category_id, account_id, type
- CRUD endpoints: POST/GET/PUT/DELETE `/api/transaction-templates`
- POST `/api/transactions/from-template/:id` — creates transaction from template with today's date

**UI/UX Perspective**: "Save as Template" option in transaction form. Templates shown as quick-add buttons above the form.

**QA Perspective (TDD)**:
```
File: tests/transaction-templates.test.js

Tests to write BEFORE implementation:
1. POST /api/transaction-templates creates template
2. GET /api/transaction-templates lists user's templates
3. POST /api/transactions/from-template/:id creates transaction with today's date
4. Template inherits all fields (description, amount, category, account, type)
5. DELETE /api/transaction-templates/:id removes template
6. Templates are per-user (isolation)
7. Invalid template ID returns 404
8. Template with deleted category/account still works (nullable)
9. 50 templates can exist per user
```

**Files to Create**: `src/routes/transaction-templates.js`, `src/repositories/transaction-template.repository.js`, migration
**Effort**: M (3 hours)

---

### 10.2 Cash Flow Forecast

**PM Perspective**: "Based on your recurring income and expenses, you'll have ₹X by end of month." Transforms app from tracker to planner.

**Architect Perspective**:
- GET `/api/reports/cashflow-forecast` — projects balance for next 30/60/90 days
- Based on: current balance + scheduled recurring income − scheduled recurring expenses
- Uses recurring rules and subscription data

**UI/UX Perspective**: Line chart showing projected balance trajectory. Dotted line for future projections vs solid for actuals.

**QA Perspective (TDD)**:
```
File: tests/cashflow-forecast.test.js

Tests to write BEFORE implementation:
1. GET /api/reports/cashflow-forecast returns daily projected balances
2. Projection includes recurring income scheduled in the period
3. Projection includes recurring expenses scheduled in the period
4. Starting balance matches current total balance
5. 30-day projection returns 30 data points
6. User with no recurring rules gets flat projection
7. Projection respects subscription amounts
8. Projection handles multiple accounts
```

**Files to Create**: `src/routes/cashflow.js` or add to `src/routes/reports.js`
**Effort**: M (4 hours)

---

### 10.3 Category Suggestion During Transaction Entry

**PM Perspective**: Auto-rules apply after transaction creation. Suggesting category while user types reduces entry friction.

**Architect Perspective**:
- GET `/api/categories/suggest?description=coffee` — returns matching categories based on auto-rules
- Check user's auto-rules: if any rule pattern matches the description, return that rule's category
- Fallback: return most frequently used category for similar descriptions

**UI/UX Perspective**: As user types transaction description, category dropdown auto-selects the suggested category. User can override.

**QA Perspective (TDD)**:
```
File: tests/category-suggest.test.js

Tests to write BEFORE implementation:
1. GET /api/categories/suggest returns matching category for known pattern
2. Returns empty when no rule matches
3. Case-insensitive matching
4. Partial description matching works
5. Returns most confident match (most specific rule)
6. Respects user isolation (user A's rules don't affect user B)
7. Performance: returns in <50ms
```

**Files to Modify**: `src/routes/categories.js`, `src/repositories/category-rule.repository.js`
**Effort**: M (2 hours)

---

## PHASE 11: SECURITY HARDENING (P3)

---

### 11.1 Active Sessions Management UI

**PM Perspective**: APIs exist (GET/DELETE sessions) but no Settings UI exposes them. Users can't see or revoke active sessions.

**Architect Perspective**: Surface existing APIs in Settings view with table of active sessions and "Revoke" buttons.

**UI/UX Perspective**: Settings → Security section: "Active Sessions" table showing device, IP, last used, created. "Revoke" button per session. "Revoke All Others" button.

**QA Perspective (TDD)**:
```
Tests are largely covered by existing session-management.test.js. Add:
1. Settings view JS contains session listing code
2. Settings view JS contains revoke button handler
3. Verify revoking a session invalidates that token
4. Verify "revoke all others" keeps current session active
```

**Files to Modify**: `public/js/views/settings.js`
**Effort**: S (2 hours)

---

### 11.2 Security Checkup Widget

**PM Perspective**: Users don't know what security features they can enable. A checkup widget in Settings surfaces actionable items.

**Architect Perspective**:
- GET `/api/auth/security-status` — returns: has_2fa, password_age_days, session_count, last_login_ip
- Display as checklist in Settings

**UI/UX Perspective**: "Security Checkup" card: ✅ Strong password, ❌ 2FA not enabled (Enable →), ℹ️ 3 active sessions (Manage →).

**QA Perspective (TDD)**:
```
File: tests/security-checkup.test.js

Tests to write BEFORE implementation:
1. GET /api/auth/security-status returns has_2fa boolean
2. Returns session_count integer
3. Returns password_age_days integer (null if just created)
4. Returns last_login_ip string
5. Unauthenticated request returns 401
```

**Files to Create**: endpoint in `src/routes/auth.js`
**Files to Modify**: `public/js/views/settings.js`
**Effort**: S (1 hour)

---

### 11.3 Auto-Backup Before Destructive Import

**PM Perspective**: Import deletes ALL data. An accidental import of an old file = total data loss. Auto-backup before import is essential safety.

**Architect Perspective**:
- Before running import logic in `src/routes/data.js`, call backup service to create timestamped backup
- Return backup_path in import response for undo
- Add confirmation field: require `confirm: "DELETE ALL DATA"` in request body

**UI/UX Perspective**: Import modal warns: "This will DELETE all current data (X transactions, Y accounts)." User types "DELETE ALL DATA" to confirm. Shows "Backup created at [path]" after success.

**QA Perspective (TDD)**:
```
File: tests/import-safety.test.js

Tests to write BEFORE implementation:
1. POST /api/data/import without confirm field returns 400
2. POST /api/data/import with wrong confirm returns 400
3. POST /api/data/import with correct confirm creates backup before import
4. Backup file exists after import
5. Backup contains pre-import data (verify by checking backup DB)
6. Import response includes backup_path
7. Failed import doesn't lose data (transaction rollback)
```

**Files to Modify**: `src/routes/data.js`
**Effort**: S (1 hour)

---

## PHASE 12: DOCUMENTATION & COMMUNITY (P3)

---

### 12.1 SECURITY.md + security.txt

**PM Perspective**: No vulnerability disclosure policy, no security documentation. Enterprise and security-conscious users need this.

**Architect Perspective**:
- Create `SECURITY.md`: authentication mechanism, data storage, encryption status, reporting vulnerabilities
- Create `public/.well-known/security.txt` with contact info
- Serve `.well-known/security.txt` via Express static

**QA Perspective (TDD)**:
```
Tests:
1. Verify SECURITY.md exists
2. Verify GET /.well-known/security.txt returns 200
3. Verify security.txt contains Contact field
```

**Files to Create**: `SECURITY.md`, `public/.well-known/security.txt`
**Effort**: S (30 minutes)

---

### 12.2 Expanded Seed Data

**PM Perspective**: Demo mode doesn't cover all features. Groups, budgets with varying utilization, goals, and notifications should have demo data.

**Architect Perspective**: Expand `src/db/seed.js` to create:
- 1 demo group with 3 members and 5 shared expenses
- 3 budgets at under/at/over utilization
- 2 active savings goals
- 5 notifications
- Tags on some transactions

**QA Perspective (TDD)**:
```
Tests:
1. After seeding, groups table has ≥1 group
2. After seeding, budgets include under/over budget examples
3. After seeding, goals table has ≥2 goals
4. After seeding, notifications table has ≥5 notifications
```

**Files to Modify**: `src/db/seed.js`
**Effort**: S (2 hours)

---

### 12.3 Settings Version Display Fix

**PM Perspective**: Settings view shows hardcoded `'0.1.7'` while app is at `0.3.50+`. Users see wrong version.

**Architect Perspective**: Read version from `/api/health/live` or a new `/api/version` endpoint that reads from `package.json`.

**QA Perspective (TDD)**:
```
Tests:
1. GET /api/health/live returns version matching package.json
2. Settings view JS fetches version from API (not hardcoded)
```

**Files to Modify**: `public/js/views/settings.js`
**Effort**: S (15 minutes)

---

## EXECUTION ORDER

| Order | Phase | Items | Est. New Tests | Effort |
|-------|-------|-------|----------------|--------|
| 1 | Security Foundation | 1.1, 1.2, 1.3 | ~35 | S (4-5h) |
| 2 | Identity & First Impressions | 2.1, 2.2, 2.3, 2.4 | ~30 | S-M (5h) |
| 3 | Accessibility | 3.1, 3.2, 3.3 | ~18 | S (2h) |
| 4 | Developer Experience | 4.1, 4.2 | ~12 | S (3h) |
| 5 | Indian Market | 5.1, 5.2, 5.3 | ~25 | M (8h) |
| 6 | Core UX | 6.1, 6.2, 6.3, 6.4 | ~35 | M (9h) |
| 7 | Collaboration | 7.1, 7.2, 7.3 | ~26 | M (6h) |
| 8 | Reporting & Data | 8.1, 8.2, 8.3 | ~22 | M (7h) |
| 9 | Performance | 9.1, 9.2 | ~18 | S (3h) |
| 10 | Data Management | 10.1, 10.2, 10.3 | ~24 | M (9h) |
| 11 | Security Hardening | 11.1, 11.2, 11.3 | ~18 | S (4h) |
| 12 | Docs & Community | 12.1, 12.2, 12.3 | ~10 | S (3h) |
| | **TOTAL** | **33 items** | **~273 tests** | **~60h** |

**Projected final test count**: 1,421 + ~273 = ~1,694 tests

---

## TDD WORKFLOW PER ITEM

```
1. Create test file with ALL tests for the item (tests FAIL — red)
2. Run `node --test tests/<new-file>.test.js` — confirm all tests fail
3. Implement the minimum code to pass each test
4. Run tests again — confirm all pass (green)
5. Run full suite: `node --test --test-force-exit tests/*.test.js` — confirm no regressions
6. Commit: "test: <item> + feat: <item>" or split into test commit + impl commit
7. Move to next item
```

---

## SUCCESS CRITERIA

- [ ] All 1,694+ tests pass
- [ ] Zero external CDN dependencies (grep public/ for https:// returns zero)
- [ ] CSP header has NO 'unsafe-inline'
- [ ] CORS default is NOT '*'
- [ ] All nav items are keyboard-focusable (Tab key)
- [ ] --text-muted contrast ratio ≥ 4.5:1
- [ ] Toasts have role="status"
- [ ] Income/expense have non-color indicators (+/−)
- [ ] GitHub Actions CI runs tests on PRs
- [ ] CONTRIBUTING.md exists
- [ ] Branding is consistently "FinanceFlow" everywhere
- [ ] SW cache version matches package.json version
- [ ] Indian FY toggle works in reports
- [ ] Overall panel review score ≥ 6.5/10 (B-)
