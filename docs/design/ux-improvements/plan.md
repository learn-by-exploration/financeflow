# TDD Implementation Plan: 28 UX Improvements

## Codebase Summary

| Aspect | Current State |
|--------|--------------|
| Tests | 1667 passing, `node:test` + `supertest` + `c8` |
| Lint | ESLint 10 flat, 0 errors / 41 warnings |
| CSS | `styles.css` (1677 LOC), dark "Midnight" theme via `:root` CSS vars |
| JS | Vanilla ES modules, no build step; `app.js` (449 LOC), `utils.js` (166 LOC) |
| Test pattern | `tests/helpers.js` with `setup()`, `cleanDb()`, `teardown()`, `agent()`, factory fns |
| Frontend tests | File-reading assertions (fs.readFileSync + string/regex matching on HTML/CSS/JS) |
| API tests | `supertest` against Express app with in-memory SQLite |

### Test Pattern Reference

**Frontend feature tests** (see `phase6-core-ux.test.js`, `responsive.test.js`):
```js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
assert.ok(html.includes('some-class'));
```

**API tests** (see `ui-states.test.js`, `notification-ui.test.js`):
```js
const { setup, cleanDb, teardown, agent } = require('./helpers');
before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());
const res = await agent().get('/api/endpoint').expect(200);
```

---

## Dependency Graph

```
P1 (Theme Toggle) ──────────────────┐
                                     ├─→ P16 (Multiple Theme Presets)
P2 (Sidebar Collapse)               │
P3 (Toast Undo)                     │
P4 (Mobile Bottom Nav)              │
P5 (Reduced Motion) ────────────────┘
P6 (Keyboard Shortcuts Modal) ──────→ P26 (Shortcut Customization) ──→ P27 (Vim Nav)
P7 (Tab Auth)
P8 (Remember Me)
P9 (Onboarding Wizard)
P10 (Error Boundary)
P11 (Backdrop Blur)
P12 (Expandable Stats)
P13 (Privacy Banner)
P14 (Enhanced Skeletons)
P15 (Notification Enhancements)
P17 (Quick Setup Presets)
P18 (Demo Quick-Fill)
P19 (Landing CTA)
P20 (Color Swatch Picker)
P21 (Hover Actions) ────────────────→ P24 (Multi-Select Transactions)
P22 (Search Filters) 
P23 (Breadcrumbs)
P25 (PWA Offline Queuing)
P28 (NLP Quick Capture)
```

**Hard dependencies:**
- P16 requires P1 (theme system must exist before adding presets)
- P26 requires P6 (shortcuts modal must exist before customization)
- P27 requires P26 (vim navigation builds on customizable shortcuts)
- P24 builds on P21 (multi-select extends per-row action patterns)

**No other cross-dependencies.** All other items can be implemented in any order within their phase.

---

## Phase 1: Critical + Quick Wins

---

### P1 — Dark/Light Theme Toggle

**Test file:** `tests/theme-toggle.test.js`

#### Tests to Write First

```
1. styles.css contains [data-theme="light"] CSS variable block
2. [data-theme="light"] defines --bg-primary as a light color (not dark)
3. [data-theme="light"] defines --text-primary as a dark color (not light)
4. [data-theme="light"] block covers all custom properties from :root
5. styles.css contains prefers-color-scheme media query
6. index.html sidebar-footer contains a theme toggle button
7. Theme toggle button has aria-label
8. login.html contains theme toggle or uses same CSS variable system
9. landing.html uses CSS variables (not hardcoded colors) — already true
10. app.js or utils.js contains theme toggle function referencing localStorage
11. Theme preference key is stored as 'pfi_theme' in localStorage logic
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/styles.css` | Add `[data-theme="light"]` variable block (~30 vars), add `@media (prefers-color-scheme: light)` default |
| `public/index.html` | Add theme toggle button in `.sidebar-footer` before settings |
| `public/js/app.js` | Add `initTheme()` on load (read localStorage/prefers-color-scheme), toggle handler |
| `public/login.html` | Add small theme toggle button (corner) |
| `public/landing.html` | Add theme toggle in nav |
| `public/css/login.css` | Ensure all colors use CSS variables (already mostly true) |
| `public/css/landing.css` | Ensure all colors use CSS variables (already mostly true) |
| `public/js/charts.js` | Replace hardcoded `COLORS`/`CHART_DEFAULTS` with CSS variable reads via `getComputedStyle` |

#### Acceptance Criteria
- [ ] Toggle switches between `data-theme="dark"` and `data-theme="light"` on `<html>`
- [ ] Preference persists via `PUT /api/preferences { theme }` (API is source of truth); localStorage `pfi_theme` is a fast-read cache
- [ ] On load, read localStorage cache first for instant apply, then verify against `/api/preferences`
- [ ] System preference (`prefers-color-scheme`) is used as default when no localStorage value
- [ ] All 3 pages (index, login, landing) respect the theme
- [ ] Toggle button has accessible label and icon changes with state
- [ ] No hardcoded color values remain outside CSS variables

#### Risk Assessment
- **High risk**: Missed CSS selectors that hardcode colors (especially in `landing.css`, `login.css`). Audit every color property.
- **Medium risk**: Chart.js colors — chart text/grid colors are set in JS (`charts.js` COLORS constant). Must read CSS variable or pass theme-aware colors. `public/js/charts.js` MUST be modified: `COLORS` and `CHART_DEFAULTS` should read CSS variables via `getComputedStyle(document.documentElement)`.
- **Mitigation**: Add a test that greps for hardcoded hex colors outside `:root` / `[data-theme]` blocks.

#### LOC Estimate
- Tests: ~80
- Implementation: ~120 (CSS vars ~50, JS ~40, HTML ~30)

---

### P2 — Sidebar Collapse to Icon Rail

**Test file:** `tests/sidebar-collapse.test.js`

#### Tests to Write First

```
1. index.html contains a sidebar collapse toggle button with id="sidebar-collapse"
2. Collapse button has aria-label and aria-expanded attribute
3. styles.css contains .sidebar.collapsed styles
4. .sidebar.collapsed width is ~56px
5. .sidebar.collapsed .nav-label is hidden (display:none)
6. styles.css has CSS transition on sidebar width
7. .sidebar.collapsed ~ .main-content has adjusted margin-left
8. app.js contains sidebar collapse toggle handler
9. app.js references localStorage for sidebar collapse state (pfi_sidebar_collapsed)
10. styles.css contains tooltip styles for collapsed sidebar items
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/styles.css` | Add `.sidebar.collapsed` rules (~40 lines): width, hide labels, tooltips |
| `public/index.html` | Add collapse toggle button in sidebar-header or sidebar-footer |
| `public/js/app.js` | Add collapse toggle handler, localStorage persistence, init on load |

#### Acceptance Criteria
- [ ] Toggle button collapses sidebar to 56px icon rail
- [ ] Nav labels are hidden, only icons visible
- [ ] Hovering collapsed nav items shows tooltip with label text
- [ ] Main content margin adjusts smoothly (CSS transition)
- [ ] State persists via localStorage
- [ ] On mobile (<768px), collapse has no effect (sidebar uses slide-in pattern)
- [ ] Keyboard accessible (button + Enter/Space)

#### Risk Assessment
- **Medium risk**: Sidebar footer buttons (Settings, Logout) need label hiding too.
- **Medium risk**: The `.logo` text needs to collapse to just the emoji 💰 only.
- **Low risk**: Transition timing conflicts with mobile sidebar slide animation.

**Decision**: Collapsed sidebar shows only the 💰 emoji from `.logo`. Nav labels hidden, icon-only with tooltips.

#### LOC Estimate
- Tests: ~70
- Implementation: ~100 (CSS ~50, JS ~30, HTML ~20)

---

### P3 — Toast with Undo Action

**Test file:** `tests/toast-undo.test.js`

#### Tests to Write First

```
1. utils.js toast function accepts a third options parameter
2. utils.js toast function signature includes destructured undo property
3. When undo callback is provided, toast contains a button element
4. Toast undo button has class 'toast-undo-btn'
5. styles.css contains .toast-undo-btn styling
6. Toast with undo has extended display time or pauses on hover
7. Toast without undo works exactly as before (regression test)
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/utils.js` | Extend `toast(message, type, options)` — add undo button rendering, 5s timeout |
| `public/styles.css` | Add `.toast-undo-btn` styles |

#### Acceptance Criteria
- [ ] `toast('Deleted', 'success', { undo: () => restore(id) })` renders toast with "Undo" button
- [ ] Clicking "Undo" calls the callback and dismisses the toast
- [ ] Toast auto-dismisses after 5s if undo not clicked
- [ ] Existing `toast('msg', 'type')` calls remain unchanged (backwards compatible)
- [ ] Screen reader announces "Undo available" when undo toast appears

#### Risk Assessment
- **Low risk**: Simple additive change. `toast()` callers don't pass 3rd arg today.
- **Medium risk**: Must not break the ~20+ existing `toast()` calls across views.

#### LOC Estimate
- Tests: ~50
- Implementation: ~40 (JS ~25, CSS ~15)

#### Existing Tests to Update
- None — existing toast calls don't test DOM output (they're API tests that don't render).

---

### P4 — Mobile Bottom Navigation Bar

**Test file:** `tests/mobile-bottom-nav.test.js`

#### Tests to Write First

```
1. index.html contains element with class 'bottom-nav'
2. Bottom nav has exactly 5 child items
3. Bottom nav items include Dashboard, Transactions, Accounts, Budgets
4. Bottom nav has 5th "More" item
5. Each bottom nav item has an icon and label
6. Each bottom nav item has data-view attribute (except More)
7. styles.css contains .bottom-nav with position:fixed and bottom:0
8. .bottom-nav is display:none by default (desktop)
9. @media max-width:768px shows .bottom-nav as flex
10. @media max-width:768px hides sidebar completely (not just off-screen)
11. .main-content has padding-bottom for bottom nav at mobile
12. Bottom nav has proper z-index (above content, below modals)
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/index.html` | Add `<nav class="bottom-nav">` with 5 tab items |
| `public/styles.css` | Add bottom-nav styles: fixed, hidden desktop, flex mobile, tab sizing |
| `public/js/app.js` | Wire bottom-nav click handlers to `navigateTo()`, "More" opens menu |

#### Acceptance Criteria
- [ ] Bottom nav visible only at <768px
- [ ] Tapping a tab navigates to that view
- [ ] Active tab is visually highlighted
- [ ] "More" tab opens a small menu with remaining nav items
- [ ] Sidebar is fully hidden on mobile (bottom nav replaces it)
- [ ] Main content has enough bottom padding to not be obscured
- [ ] FAB button repositions above bottom nav

#### Risk Assessment
- **High risk**: Conflicts with existing mobile sidebar slide-in behavior. The sidebar backdrop/hamburger flow needs to be reconsidered for mobile.
- **Medium risk**: FAB positioning — needs to stack above bottom nav.
- **Mitigation**: Keep sidebar for tablet (768-1024px), only replace at <768px.

**"More" Menu Spec**: The 5th "More" tab opens a **bottom sheet** overlay with remaining nav items (Settings, Goals, Groups, Splits, Rules, Calendar, etc.) displayed as a 2-column icon+label grid. Dismiss: tap outside, swipe down, or tap More again. Animation: slide up 250ms ease-out.

#### LOC Estimate
- Tests: ~70
- Implementation: ~130 (HTML ~30, CSS ~60, JS ~40)

#### Existing Tests to Update
- `responsive.test.js` — may need to acknowledge bottom nav in mobile layout assertions. Check assertions about mobile menu button.

---

### P5 — Reduced Motion Support

**Test file:** `tests/reduced-motion.test.js`

#### Tests to Write First

```
1. styles.css contains @media (prefers-reduced-motion: reduce) — ALREADY EXISTS
2. charts.js respects reduced motion preference (animation:false conditional)
3. Reduced motion query covers all animation properties (animation-duration, transition-duration)
4. app.js does not force-trigger animations when reduced motion is preferred
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/charts.js` | Add `const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches` and set `animation: !reducedMotion` on Chart.js configs |
| `public/styles.css` | Already has the media query (line 111). Verify completeness. |

#### Acceptance Criteria
- [ ] `@media (prefers-reduced-motion: reduce)` disables all CSS animations/transitions (already done)
- [ ] Chart.js charts render with `animation: false` when reduced motion is preferred
- [ ] No JS-triggered `animation = 'none'; offsetHeight; animation = ''` reflow hack runs when reduced motion is on

#### Risk Assessment
- **Low risk**: CSS part already implemented. JS part is small and isolated.
- **Note**: The `container.style.animation = 'none'; container.offsetHeight; container.style.animation = ''` hack in `app.js:render()` should be wrapped in a reduced-motion check.

#### LOC Estimate
- Tests: ~30
- Implementation: ~15

---

### P6 — Keyboard Shortcuts Help Modal

**Test file:** Already partially covered in `phase6-core-ux.test.js`

#### Tests to Write First

```
1. app.js contains showShortcutsHelp function — ALREADY PASSES
2. Pressing ? key calls showShortcutsHelp — ALREADY PASSES
3. Shortcuts modal lists all current shortcuts — verify completeness
4. Shortcuts modal is accessible (has modal-title, close button)
5. Shortcuts modal shows when openModal() is called with shortcuts content
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/app.js` | Already implemented. Minor polish: add grouping headers, improve styling. |

#### Acceptance Criteria
- [ ] `?` key opens shortcuts modal — DONE
- [ ] Modal lists all shortcuts — DONE
- [ ] Modal is keyboard-dismissable with Esc — DONE

#### Risk Assessment
- **None**: Already implemented. This is polish only.

#### LOC Estimate
- Tests: ~20 (verify completeness)
- Implementation: ~10 (polish)

---

## Phase 2: High Impact

---

### P7 — Tab-Based Auth

**Test file:** `tests/tab-auth.test.js`

#### Tests to Write First

```
1. login.html contains elements with class 'auth-tabs' or 'auth-tab'
2. login.html has a Sign In tab button
3. login.html has a Register tab button
4. Auth tab buttons have aria-selected attribute
5. Auth tab buttons have role="tab"
6. Tab container has role="tablist"
7. login.css contains .auth-tab styling
8. login.css contains .auth-tab.active styling
9. login.js handles tab click to switch between login/register
10. Toggle link (old mechanism) is removed or replaced by tabs
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/login.html` | Replace `.toggle` div with `role="tablist"` containing two tab buttons |
| `public/js/login.js` | Refactor toggle logic from link-click to tab-click, manage aria-selected |
| `public/css/login.css` | Add `.auth-tabs`, `.auth-tab`, `.auth-tab.active` styles |

#### Acceptance Criteria
- [ ] Two tab buttons replace the "Don't have an account? Register" link
- [ ] Active tab has visual indicator (underline or background)
- [ ] Switching tabs shows/hides the display_name field
- [ ] `aria-selected` toggles correctly
- [ ] `role="tablist"` and `role="tab"` are present
- [ ] Keyboard: Arrow keys switch between tabs (a11y pattern)

#### Risk Assessment
- **Medium risk**: Must preserve all existing login.js logic (password validation, form submission, session expiry message). Careful refactor.
- **Low risk**: No API changes needed.

#### LOC Estimate
- Tests: ~60
- Implementation: ~60 (HTML ~15, CSS ~20, JS ~25)

---

### P8 — Remember Me Checkbox

**Test file:** `tests/remember-me.test.js`

#### Tests to Write First

```
1. login.html contains an input[type="checkbox"] with id="remember-me"
2. Remember me checkbox has associated label
3. login.js reads remember-me checkbox state on form submit
4. When remember-me is checked, token is stored in localStorage (current behavior)
5. When remember-me is unchecked, token is stored in sessionStorage
6. login.css contains styling for remember-me row
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/login.html` | Add checkbox + label before submit button |
| `public/js/login.js` | Conditional: checked → localStorage, unchecked → sessionStorage |
| `public/js/utils.js` | `token()` function must check sessionStorage as fallback |
| `public/css/login.css` | Style the checkbox row |

#### Acceptance Criteria
- [ ] Checkbox visible on login form, checked by default
- [ ] Checked: token goes to localStorage (persists across browser close)
- [ ] Unchecked: token goes to sessionStorage (cleared on browser close)
- [ ] `utils.js` `token()` reads from both storages (localStorage first, then sessionStorage)
- [ ] Existing auth flow works unchanged when checkbox is checked

#### Risk Assessment
- **High risk**: `token()` in `utils.js` is used everywhere.
- **Architecture**: Use module-level `_token` variable populated at init. Add `setToken(token, persistent)` that writes to localStorage (persistent=true) or sessionStorage (persistent=false) and updates `_token`. Add `clearToken()` that clears both storages and sets `_token = null`. The existing `token()` function returns `_token` (single lookup, no double storage reads). On module load, `_token = localStorage.getItem('pfi_token') || sessionStorage.getItem('pfi_token')`.
- **Medium risk**: `localStorage.clear()` on logout must also clear sessionStorage — use `clearToken()` instead.
- **Mitigation**: Write regression tests for the full auth flow first.

#### LOC Estimate
- Tests: ~50
- Implementation: ~35 (HTML ~5, JS ~25, CSS ~5)

#### Existing Tests to Update
- `auth.test.js` — token storage tests may need updating if they assert on localStorage specifically.

---

### P9 — First-Run Onboarding Wizard

**Test file:** `tests/onboarding-wizard.test.js`

#### Tests to Write First

```
1. app.js or a new onboarding.js contains wizard rendering logic
2. Wizard checks localStorage for 'pfi_onboarding_done' flag
3. Wizard has 3 steps visible in DOM
4. Each step has a progress indicator (dots)
5. Wizard has a Skip button
6. Clicking Skip sets localStorage flag and dismisses
7. Step 1: Welcome/privacy message
8. Step 2: Shows account creation form or link
9. Step 3: Shows budget creation form or link
10. Completing step 3 sets localStorage flag
11. Wizard only appears on first login (not subsequent)
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/app.js` | Add onboarding check after first successful render, before dashboard displays |
| `public/styles.css` | Add `.onboarding-wizard`, `.wizard-step`, `.wizard-dots` styles |

**Note**: The current codebase already has an `renderOnboarding()` function in `app.js` that shows when no accounts exist. The wizard would be a more structured version triggered by a localStorage flag rather than empty accounts.

#### Acceptance Criteria
- [ ] On first login (no `pfi_onboarding_done` in localStorage), wizard modal appears
- [ ] 3 steps with progress dots
- [ ] Skip button available at every step
- [ ] Completing or skipping sets `pfi_onboarding_done = '1'`
- [ ] Subsequent logins skip the wizard entirely
- [ ] Each step has actionable content (not just text)

#### Risk Assessment
- **Medium risk**: Conflicts with existing `renderOnboarding()` which shows when accounts list is empty. Need to decide: wizard replaces it, or wizard is step one and onboarding remains as fallback.
- **Recommendation**: Show wizard on first-ever login (localStorage flag). Keep the existing empty-state onboarding as a separate fallback for returning users who deleted all accounts.

#### LOC Estimate
- Tests: ~70
- Implementation: ~120 (JS ~80, CSS ~40)

---

### P10 — Error Boundary / View Recovery

**Test file:** `tests/error-boundary.test.js`

#### Tests to Write First

```
1. ui-states.js showError renders a container with retry button — ALREADY EXISTS
2. showError renders a "Go to Dashboard" button when options.showDashboard is true
3. app.js render() catch block calls showError with retry AND dashboard options
4. Error UI has class 'ui-error' — ALREADY EXISTS
5. Error recovery button (dashboard) calls navigateTo('dashboard')
6. Error state includes error message display — ALREADY EXISTS
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/ui-states.js` | Extend `showError()` to accept optional `dashboardHandler` for "Go to Dashboard" button |
| `public/js/app.js` | Update `render()` catch block to pass `dashboardHandler: () => navigateTo('dashboard')` |

#### Acceptance Criteria
- [ ] When a view fails to load, "Try Again" and "Go to Dashboard" buttons appear
- [ ] "Try Again" re-renders the current view
- [ ] "Go to Dashboard" navigates to dashboard
- [ ] Error message is visible and descriptive
- [ ] Both buttons are keyboard accessible

#### Risk Assessment
- **Low risk**: Additive change to existing error handling. `showError()` already works.

#### LOC Estimate
- Tests: ~40
- Implementation: ~25

---

### P11 — Backdrop Blur on Top Bar

**Test file:** `tests/topbar-blur.test.js`

#### Tests to Write First

```
1. styles.css .top-bar has backdrop-filter property
2. styles.css .top-bar has a semi-transparent background
3. .top-bar has position:sticky or equivalent for the blur to be visible
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/styles.css` | Add `backdrop-filter: blur(12px)` + transparent bg + `position: sticky; top: 0; z-index: 10` to `.top-bar` |

#### Acceptance Criteria
- [ ] Top bar shows blur effect when content scrolls beneath it
- [ ] Top bar is sticky (stays at top during scroll)
- [ ] Content is partially visible through the blurred bar
- [ ] Works with both dark and light themes (P1)

#### Risk Assessment
- **Low risk**: Pure CSS change.
- **Note**: `backdrop-filter` has good browser support but may not work in older browsers. This is progressive enhancement.

#### LOC Estimate
- Tests: ~20
- Implementation: ~15 (CSS only)

---

### P12 — Expandable Stat Cards

**Test file:** `tests/expandable-stats.test.js`

#### Tests to Write First

```
1. dashboard.js statCard function renders with aria-expanded attribute
2. Stat cards have class 'stat-card' with 'expandable' modifier
3. styles.css contains .stat-card.expanded styles
4. .stat-card.expanded has max-height transition
5. Expanded state shows additional content area (.stat-detail)
6. Clicking stat card toggles aria-expanded
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/views/dashboard.js` | Modify `statCard()` to add click handler that toggles expansion, render detail panel with sparkline/breakdown |
| `public/styles.css` | Add `.stat-card .stat-detail`, `.stat-card.expanded` |
| `public/js/charts.js` | Add small `renderSparkline(canvas, data)` function for inline charts |

#### Acceptance Criteria
- [ ] Clicking a stat card expands it to show a detail panel
- [ ] Detail panel contains a sparkline or textual breakdown
- [ ] `aria-expanded` toggles on click
- [ ] CSS transition on max-height for smooth expand/collapse
- [ ] Only one card expanded at a time (accordion behavior)
- [ ] Click again to collapse

#### Risk Assessment
- **Decision**: Single-click expands the card. Inside the expanded panel, a "View all →" link navigates to the relevant view. This replaces the current direct-navigate-on-click behavior.
- **Medium risk**: Sparkline requires Chart.js mini-chart or SVG path. Must handle "no data" case.

#### LOC Estimate
- Tests: ~50
- Implementation: ~100 (JS ~60, CSS ~40)

---

### P13 — Cookie/Privacy Consent Banner

**Test file:** `tests/privacy-banner.test.js`

#### Tests to Write First

```
1. index.html contains element with class 'privacy-banner' or id='privacy-banner'
2. Privacy banner contains text about self-hosted/data stays on server
3. Privacy banner has a dismiss button
4. styles.css contains .privacy-banner positioning (bottom, fixed)
5. app.js checks localStorage 'pfi_privacy_accepted' and hides banner if set
6. Dismiss button sets localStorage flag and removes banner
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/index.html` | Add privacy banner div at bottom of `<body>` |
| `public/styles.css` | Add `.privacy-banner` fixed bottom styling |
| `public/js/app.js` | Check localStorage on load, hide if acknowledged, wire dismiss handler |

#### Acceptance Criteria
- [ ] Banner appears at bottom on first visit to index.html
- [ ] Text: "Your data stays on your server. No cookies. No tracking."
- [ ] Dismiss button ("Got it") hides banner and sets localStorage flag
- [ ] Banner never appears again after dismissal
- [ ] Banner doesn't overlap with FAB or mobile bottom nav (P4)

#### Risk Assessment
- **Low risk**: Simple additive UI element.
- **Low risk**: Z-index coordination with FAB button and potential bottom nav.

#### LOC Estimate
- Tests: ~40
- Implementation: ~35 (HTML ~10, CSS ~15, JS ~10)

---

### P14 — Enhanced Skeleton Loaders

**Test file:** `tests/enhanced-skeletons.test.js`

#### Tests to Write First

```
1. ui-states.js exports showDashboardSkeleton or showLoadingSkeleton renders dashboard-specific shape
2. ui-states.js showLoadingSkeleton renders 4 skeleton cards in a grid — ALREADY EXISTS
3. ui-states.js exports showTableSkeleton function for transaction-like views
4. showTableSkeleton renders multiple skeleton rows
5. styles.css contains .skeleton-card styling with pulse animation
6. styles.css contains .skeleton-row styling for table skeletons
7. Dashboard view calls showLoadingSkeleton (not generic showLoading) — ALREADY TRUE
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/ui-states.js` | Add `showTableSkeleton(container, rowCount)` for table views, add `showChartSkeleton()` |
| `public/styles.css` | Add skeleton row/chart placeholder CSS |
| `public/js/views/transactions.js` | Use `showTableSkeleton` instead of generic `showLoading` |
| `public/js/views/accounts.js` | Use appropriate skeleton loader |

#### Acceptance Criteria
- [ ] Dashboard shows 4 card rectangles + chart rectangles during load (already partial)
- [ ] Transactions view shows table row skeletons during load
- [ ] Skeletons pulse with animation (respect reduced motion)
- [ ] Skeleton shapes roughly match the final layout

#### Risk Assessment
- **Low risk**: Additive to existing skeleton system.
- **Note**: `showLoadingSkeleton` already exists with 4 cards + 3 lines. Just need view-specific variants.

#### LOC Estimate
- Tests: ~40
- Implementation: ~60 (JS ~30, CSS ~30)

---

### P15 — Notification Panel Enhancements

**Test file:** `tests/notification-enhancements.test.js` (extends `notification-ui.test.js`)

#### Tests to Write First

```
1. GET /api/notifications returns items with is_read field — ALREADY TRUE
2. notifications.js renders read vs unread items with different classes — PARTIALLY TRUE
3. Unread notifications have .notif-unread-dot — ALREADY TRUE
4. Read notifications have .read class — ALREADY TRUE
5. Notification items show relative timestamps — ALREADY TRUE (timeAgo function exists)
6. Clicking a notification marks it as read via API
7. Notification click navigates to related view (e.g., budget_exceeded → budgets)
8. styles.css differentiates read/unread notification styling
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/notifications.js` | Add click-to-navigate: map notification types to views. Already marks as read on click. |
| `public/styles.css` | Enhance `.notif-item.read` vs `.notif-item` visual distinction |

#### Acceptance Criteria
- [ ] Unread notifications have bolder text/background vs read (visual distinction)
- [ ] Relative timestamps display ("5m ago", "2h ago") — ALREADY DONE
- [ ] Clicking a notification navigates to relevant view (budget_exceeded → budgets, goal_completed → goals)
- [ ] Clicking marks as read — ALREADY DONE

#### Risk Assessment
- **Low risk**: Mostly already implemented. Navigation mapping is the main new work.
- **Note**: `notifications.js` already has `markRead()`, `timeAgo()`, read/unread classes. Primary new feature is click-to-navigate.

#### LOC Estimate
- Tests: ~40
- Implementation: ~30 (JS ~20, CSS ~10)

---

## Phase 3: Polish & Delight

---

### P16 — Multiple Theme Presets

**Test file:** `tests/theme-presets.test.js`

**Depends on:** P1 (theme toggle system)

#### Tests to Write First

```
1. styles.css contains [data-theme="forest"] CSS variable block
2. styles.css contains [data-theme="ocean"] CSS variable block
3. styles.css contains [data-theme="rose"] CSS variable block
4. styles.css contains [data-theme="nord"] CSS variable block
5. Each theme block defines --bg-primary, --bg-secondary, --text-primary, --accent
6. settings.js renders a theme selector section
7. Theme selector shows preview swatches for each theme
8. Selecting a theme stores it in localStorage 'pfi_theme'
9. Selecting a theme applies data-theme attribute to <html>
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/styles.css` | Add 4 `[data-theme="X"]` blocks (~30 vars each = ~120 lines) |
| `public/js/views/settings.js` | Add Theme section with visual selector grid |
| `public/js/app.js` | Update `initTheme()` to handle all theme names (not just light/dark) |

#### Acceptance Criteria
- [ ] 6 total themes available: dark (midnight, default), light, forest, ocean, rose, nord
- [ ] Settings page shows a theme grid with color previews
- [ ] Selecting a theme instantly applies it
- [ ] Theme persists via localStorage
- [ ] All themes maintain WCAG AA contrast ratios

#### Risk Assessment
- **High risk**: WCAG contrast ratios — each theme needs contrast testing for all text/background combinations.
- **Contrast Testing Methodology**: Create `tests/helpers/contrast.js` with a relative luminance calculator. For each theme, verify: `--text-primary` vs `--bg-primary` ≥ 4.5:1, `--text-secondary` vs `--bg-secondary` ≥ 4.5:1, `--accent` vs `--bg-primary` ≥ 3:1 (large text). Parse CSS variable values from `styles.css` in tests.
- **Medium risk**: Charts need to adapt colors per theme (or use CSS variables for chart colors).
- **Mitigation**: Charts already use CSS variables after P1. Themes must define chart-compatible accent colors.

#### LOC Estimate
- Tests: ~60
- Implementation: ~200 (CSS ~150, JS ~50)

---

### P17 — Quick Setup Presets

**Test file:** `tests/quick-setup-presets.test.js`

#### Tests to Write First

```
1. settings.js renders Quick Setup section or preset buttons
2. Preset buttons include India, US, EU options
3. India preset sets currency=INR, date_format=DD/MM/YYYY
4. US preset sets currency=USD, date_format=MM/DD/YYYY
5. EU preset sets currency=EUR, date_format=DD.MM.YYYY
6. Clicking a preset calls PUT /api/settings for each changed value
7. PUT /api/settings accepts currency and date_format updates — ALREADY TRUE
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/views/settings.js` | Add presets section with 3 buttons after Preferences card |

#### Acceptance Criteria
- [ ] Three preset buttons visible in Settings
- [ ] Each button applies correct currency + date format
- [ ] Toast confirms "Settings updated to India (INR)" etc.
- [ ] Settings dropdowns update to reflect new values without page reload

#### Risk Assessment
- **Low risk**: Calls existing API endpoints. Pure frontend addition.

#### LOC Estimate
- Tests: ~40
- Implementation: ~40

---

### P18 — Demo Account Quick-Fill

**Test file:** `tests/demo-quickfill.test.js`

#### Tests to Write First

```
1. login.html contains a "Try Demo" button or link
2. Demo button has id="demo-btn" or class="demo-btn"
3. login.js has handler for demo button click
4. Demo button auto-fills username field with demo credentials
5. Demo button auto-fills password field with demo credentials
6. Demo credentials match the demo seed user (e.g., demo/demo1234)
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/login.html` | Add "Try Demo" button below the form |
| `public/js/login.js` | Add click handler to fill demo credentials |
| `public/css/login.css` | Style the demo button (secondary style, muted) |

#### Acceptance Criteria
- [ ] "Try Demo" button visible on login page
- [ ] Clicking fills username="demo" and password="demo1234" (or whatever demo creds are)
- [ ] User still has to click "Sign In" (auto-fill only, not auto-submit — security principle)
- [ ] Button is visually secondary to the main auth flow

#### Risk Assessment
- **Low risk**: Simple DOM manipulation.
- **Note**: Demo credentials must match the actual demo seed script. Check `src/` for demo seed configuration.

#### LOC Estimate
- Tests: ~30
- Implementation: ~25

---

### P19 — Landing Page CTA Enhancement

**Test file:** `tests/landing-cta.test.js`

#### Tests to Write First

```
1. landing.css .btn-hero-primary has box-shadow property
2. landing.css .btn-hero-primary:hover has transform:scale or translateY
3. landing.css .btn-hero-primary:hover has enhanced box-shadow
4. landing.html hero-actions contain CTA buttons — ALREADY TRUE
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/css/landing.css` | Enhance `.btn-hero-primary` with box-shadow, hover scale(1.02) |

#### Acceptance Criteria
- [ ] Primary CTA buttons have visible box-shadow at rest
- [ ] Hover state adds scale(1.02-1.05) and stronger shadow
- [ ] Transition is smooth (0.15-0.2s)
- [ ] Respects reduced motion preference

#### Risk Assessment
- **None**: Pure CSS enhancement.

#### LOC Estimate
- Tests: ~20
- Implementation: ~15 (CSS only)

---

### P20 — Color Swatch Picker

**Test file:** `tests/color-swatch-picker.test.js`

#### Tests to Write First

```
1. A reusable color picker component exists (in utils.js or a new module)
2. Color picker renders visual color circles, not just a hex input
3. Color picker has at least 8 preset colors
4. Each color swatch has aria-label describing the color
5. Selecting a swatch updates a hidden input or calls a callback with the hex value
6. Color picker is accessible: keyboard navigable with arrow keys
7. goals view uses the color picker for goal colors
8. categories view uses the color picker for category colors (if applicable)
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/utils.js` | Add `renderColorPicker(selectedColor, onChange)` function |
| `public/styles.css` | Add `.color-picker`, `.color-swatch`, `.color-swatch.selected` styles |
| `public/js/views/goals.js` | Replace hex input with color picker component |
| `public/js/views/categories.js` | Replace hex input with color picker component (if present) |

#### Acceptance Criteria
- [ ] Color selection uses visual swatches instead of raw hex input
- [ ] 8-12 preset colors available (from the app's existing color palette)
- [ ] Selected swatch has a visible indicator (checkmark or ring)
- [ ] Accessible: `role="radiogroup"`, each swatch `role="radio"` with `aria-checked`
- [ ] Keyboard: arrow keys navigate, Enter/Space selects

#### Risk Assessment
- **Medium risk**: Must find all places where color hex inputs are used and replace consistently.
- **Low risk**: Additive component, doesn't break existing functionality if old inputs are replaced properly.

#### LOC Estimate
- Tests: ~50
- Implementation: ~80 (JS ~40, CSS ~30, view changes ~10)

---

### P21 — Hover Action Buttons on Transactions

**Test file:** `tests/hover-actions.test.js`

#### Tests to Write First

```
1. transactions.js renders action buttons per row
2. Action buttons have class 'row-actions' or 'hover-actions'
3. styles.css .hover-actions is hidden by default (opacity:0 or display:none)
4. styles.css tr:hover .hover-actions is visible
5. Action buttons include edit and delete icons
6. Action buttons have aria-labels
7. Touch device: action buttons visible on focus/long-press
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/views/transactions.js` | Add edit/delete icon buttons in each row, hidden by default |
| `public/styles.css` | Add `.hover-actions` { opacity:0 }, `.data-table tr:hover .hover-actions` { opacity:1 } |

#### Acceptance Criteria
- [ ] Edit and Delete buttons appear on row hover
- [ ] Buttons are icon-only with aria-labels
- [ ] On touch devices (no hover), buttons appear on tap/focus
- [ ] Clicking edit opens the edit modal (existing flow)
- [ ] Clicking delete triggers confirm → delete (existing flow)
- [ ] Transition on appear/disappear (opacity, respect reduced motion)

#### Risk Assessment
- **Medium risk**: Transaction rows currently have actions at the end of each row. This refactors to hover-reveal pattern. Need to keep mobile row actions always visible.
- **Note**: Must handle the responsive card layout at <768px where hover doesn't apply.

#### LOC Estimate
- Tests: ~40
- Implementation: ~60 (JS ~30, CSS ~30)

---

### P22 — Search with Category Filters

**Test file:** `tests/search-filters.test.js`

#### Tests to Write First

```
1. search.js renders filter chips for result categories
2. Filter chips include: Transactions, Accounts, Categories
3. styles.css contains .search-filter-chip styling
4. Clicking a filter chip filters results to that category only
5. Active filter chip has visual selected state
6. GET /api/search supports type parameter (transactions, accounts, categories)
7. Clearing filter shows all results
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/views/search.js` | Add filter chip bar above results, filter displayed sections |
| `public/styles.css` | Add `.search-filter-chip`, `.search-filter-chip.active` styles |
| `src/routes/search.js` | (Optional) Add `type` query parameter to filter server-side |

#### Acceptance Criteria
- [ ] Filter chips appear above search results
- [ ] Clicking "Transactions" hides accounts/categories sections (client-side filtering is sufficient)
- [ ] Active chip has visual indicator
- [ ] "All" chip shows everything (default)
- [ ] Works with Ctrl+K search flow

#### Risk Assessment
- **Low risk**: Client-side filtering of existing search results. Can be done without API changes.

#### LOC Estimate
- Tests: ~40
- Implementation: ~50 (JS ~35, CSS ~15)

---

### P23 — Breadcrumb Navigation

**Test file:** `tests/breadcrumb-nav.test.js`

#### Tests to Write First

```
1. index.html or app.js renders a breadcrumb container
2. Breadcrumb container has aria-label="Breadcrumb"
3. Breadcrumb has role="navigation"
4. Dashboard view shows: Home / Dashboard
5. Nested view shows appropriate path
6. styles.css contains .breadcrumb styling
7. Breadcrumb uses <ol> with <li> elements (semantic HTML)
8. Each breadcrumb link is clickable (navigates)
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/index.html` | Add `<nav aria-label="Breadcrumb" class="breadcrumb">` below `.top-bar` |
| `public/js/app.js` | Update `render()` to build breadcrumbs based on `currentView` |
| `public/styles.css` | Add `.breadcrumb`, `.breadcrumb ol`, `.breadcrumb li` styles |

#### Acceptance Criteria
- [ ] Breadcrumb visible below top bar
- [ ] Shows "Home / {View Name}" format  
- [ ] "Home" links to dashboard
- [ ] Uses `<nav>` with `aria-label="Breadcrumb"` and `<ol>` list
- [ ] Styled with separators (/ or ›)
- [ ] Current page is not a link (aria-current="page")

#### Risk Assessment
- **Low risk**: Additive UI element.
- **Note**: Current app has flat navigation (no true nesting). Breadcrumbs will be simple: Home → ViewName. Could add depth for sub-views if they exist.

#### LOC Estimate
- Tests: ~40
- Implementation: ~50 (JS ~25, CSS ~15, HTML ~10)

---

### P24 — Multi-Select Mode for Transactions

**Test file:** `tests/multi-select-transactions.test.js`

**Depends on:** P21 (hover actions pattern)

#### Tests to Write First

```
1. app.js or transactions.js has handler for 'M' key to toggle multi-select mode
2. Multi-select mode adds checkboxes to each transaction row
3. styles.css contains .multi-select-mode styles
4. Selecting rows shows a bulk action bar
5. Bulk action bar has Delete, Categorize, Export buttons
6. Bulk action bar shows count of selected items
7. DELETE /api/transactions/bulk accepts array of IDs
8. Pressing M again or Esc exits multi-select mode
9. Checkboxes have proper labels for accessibility
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/views/transactions.js` | Add multi-select mode: checkbox rendering, selection tracking, bulk action bar |
| `public/styles.css` | Add `.multi-select-mode`, `.bulk-action-bar`, checkbox styles |
| `public/js/app.js` | Add `M` key shortcut (only on transactions view) |
| `src/routes/transactions.js` | Add `DELETE /api/transactions/bulk` endpoint |
| ~~`src/routes/transactions.js`~~ | Use existing `POST /api/transactions/bulk-delete` endpoint (already exists with balance reversal) |
| ~~`src/services/transaction.service.js`~~ | Bulk delete already implemented — no backend changes needed |

#### Acceptance Criteria
- [ ] Pressing `M` on transactions view toggles multi-select mode
- [ ] Checkboxes appear on each row
- [ ] Selecting ≥1 row shows bulk action bar
- [ ] "Delete Selected" uses existing `POST /api/transactions/bulk-delete` with confirm
- [ ] "Export Selected" exports selected as CSV/JSON
- [ ] Esc or `M` again exits multi-select mode
- [ ] Count badge shows "3 selected" etc.

#### Risk Assessment
- **High risk**: Bulk delete needs careful API design — validate ownership, handle errors, transaction safety.
- **Medium risk**: Must not conflict with existing keyboard shortcuts.
- **Mitigation**: Bulk endpoint should use a single DB transaction and validate all IDs belong to user.

#### LOC Estimate
- Tests: ~100
- Implementation: ~150 (JS frontend ~80, API ~40, CSS ~30)

#### Existing Tests to Update
- `transactions.test.js` — add bulk operation tests alongside existing CRUD.

---

### P25 — PWA Offline Mutation Queuing

**Test file:** `tests/offline-queue.test.js`

#### Tests to Write First

**Unit-testable pure functions** (extracted from sw.js for node:test compatibility):
```
1. sw.js contains offlineQueue object/functions
2. sw.js fetch handler checks for /api/ POST/PUT/DELETE
3. sw.js does NOT queue /api/auth/ requests
4. app.js contains pending-changes indicator element reference
5. styles.css contains .pending-sync-indicator styling
```

**File-content assertions** (verify code structure exists):
```
6. sw.js contains IndexedDB open call for offline queue
7. sw.js contains 'sync' event listener for replay
8. sw.js fetch handler clones request before queuing
9. app.js shows/hides pending indicator based on service worker messages
```

**Note**: Runtime sw.js behavior (actual IndexedDB writes, Background Sync replay) requires manual browser testing or future Playwright integration. These tests verify the code exists structurally.

#### Files to Modify

| File | Change |
|------|--------|
| `public/sw.js` | Add offline queue: catch failed /api/ mutations → IndexedDB queue → replay on sync event |
| `public/js/app.js` | Show "X changes pending" indicator when offline queue has items |
| `public/styles.css` | Add offline queue indicator styling |

#### Acceptance Criteria
- [ ] POST/PUT/DELETE to /api/ that fail due to network are queued in IndexedDB
- [ ] On reconnect, queued mutations replay in order
- [ ] Successful replay clears items; failures stay queued
- [ ] User sees "3 changes pending sync" indicator
- [ ] Auth endpoints (/api/auth/*) are NOT queued
- [ ] GET requests are NOT queued (existing cache-first strategy)

#### Risk Assessment
- **High risk**: Complex service worker logic. Race conditions on replay. Stale data conflicts.
- **High risk**: Replayed mutations may fail if server state changed (e.g., account deleted, budget modified). Need error handling strategy.
- **High risk**: IndexedDB API complexity within service worker context.
- **Mitigation**: Use the Background Sync API where supported, with IndexedDB fallback. Start with a simple FIFO queue. Add conflict toast ("Some changes couldn't be synced").

#### LOC Estimate
- Tests: ~80
- Implementation: ~200 (SW ~120, JS ~50, CSS ~30)

---

### P26 — Keyboard Shortcut Customization

**Test file:** `tests/shortcut-customization.test.js`

**Depends on:** P6 (shortcuts help modal)

#### Tests to Write First

```
1. settings.js renders a Keyboard Shortcuts section
2. Shortcuts section lists all current shortcuts with editable bindings
3. Custom bindings are stored in localStorage as JSON ('pfi_shortcuts')
4. app.js reads custom bindings from localStorage on load
5. Default bindings are used when no localStorage entry exists
6. Custom binding for 'dashboard' key works (e.g., remapped from 'd' to 'h')
7. Invalid bindings are rejected (e.g., already-used keys, modifier-only)
8. Reset button restores default bindings
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/views/settings.js` | Add shortcuts section with inline editing |
| `public/js/app.js` | Refactor keyboard handler to use a configurable shortcuts map loaded from localStorage |
| `public/styles.css` | Add shortcut editor row styles |

#### Acceptance Criteria
- [ ] All shortcuts visible in Settings with current bindings
- [ ] Click on a binding to edit → listening mode → press new key → saves
- [ ] Duplicate detection prevents two actions on same key
- [ ] Stored as `{"dashboard": "d", "transactions": "t", ...}` in localStorage
- [ ] "Reset to defaults" button
- [ ] Shortcuts help modal (P6) shows custom bindings

#### Risk Assessment
- **Medium risk**: Refactoring the keyboard handler from inline `if (e.key === 'd')` statements to a data-driven map is the main effort. Must not lose any existing shortcut.
- **Low risk**: localStorage serialization is straightforward.

#### LOC Estimate
- Tests: ~60
- Implementation: ~100 (JS ~70, CSS ~20, view ~10)

---

### P27 — Vim-Style Navigation

**Test file:** `tests/vim-navigation.test.js`

**Depends on:** P26 (shortcut customization framework)

#### Tests to Write First

```
1. settings.js renders a "Vim-style navigation" toggle
2. Toggle state stored in localStorage 'pfi_vim_mode'
3. When enabled, J key moves focus to next list item
4. When enabled, K key moves focus to previous list item
5. When enabled, Enter opens/selects focused item
6. When enabled, Esc goes back/closes
7. When disabled, J/K/Enter/Esc behave normally (no list navigation)
8. Focus rings appear on navigated items
9. Vim mode does not conflict with existing shortcuts
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/app.js` | Add vim navigation handler (conditional on setting) |
| `public/js/views/settings.js` | Add vim mode toggle |
| `public/styles.css` | Add `.vim-focus` class for navigated items |

#### Acceptance Criteria
- [ ] Toggle in Settings to enable/disable
- [ ] J/K cycles through focusable items in the current view's main list
- [ ] Enter activates the focused item
- [ ] Esc navigates back or closes modals
- [ ] Visual focus indicator on the active item
- [ ] Does not activate when typing in inputs

#### Risk Assessment
- **Medium risk**: Determining "the list" to navigate varies per view (transactions rows, accounts cards, etc.). Need a generic `.navigable-list` or similar.
- **Medium risk**: Conflicts with existing `g` shortcut (groups). Vim mode must only handle J/K/Enter/Esc.

#### LOC Estimate
- Tests: ~60
- Implementation: ~80 (JS ~60, CSS ~10, settings ~10)

---

### P28 — NLP Quick Capture

**Test file:** `tests/nlp-quick-capture.test.js`

#### Tests to Write First

```
1. A quick-capture input or FAB enhancement exists
2. Parser extracts amount from natural language (e.g., "Coffee 150" → amount: 150)
3. Parser extracts category keyword (e.g., "food" → category: Food)
4. Parser extracts date (e.g., "today" → today's date, "yesterday" → yesterday)
5. Parser handles "Coffee 150 today food" → { description: "Coffee", amount: 150, date: today, category: "food" }
6. Parser handles "Salary 50000 income" → type: income
7. Parser handles amount-only: "150" → amount: 150, rest defaults
8. Parser handles no match gracefully → shows full form
9. Parser is case-insensitive
10. FAB "+" shows quick capture input above it
```

#### Files to Modify

| File | Change |
|------|--------|
| `public/js/utils.js` or new `public/js/nlp-parser.js` | Create `parseQuickEntry(text)` regex-based parser |
| `public/js/app.js` | Modify `showQuickAdd()` to add a quick-capture text input at the top that auto-fills form fields |
| `public/styles.css` | Add quick-capture input styling |

#### Acceptance Criteria
- [ ] Quick-add modal has a "quick capture" text input at the top
- [ ] Typing "Coffee 150 today food" auto-fills: description="Coffee", amount=150, date=today, category matched to "Food"
- [ ] Recognized patterns: `<description> <amount> [today|yesterday|YYYY-MM-DD] [category] [income|expense]`
- [ ] Unrecognized input falls back to manual form (no errors)
- [ ] Category matching is fuzzy (partial name match)
- [ ] Amount detection handles decimals ("150.50")

#### Risk Assessment
- **Medium risk**: NLP regex can be fragile. Need extensive test cases for edge cases (amounts with commas, descriptions with numbers, etc.).
- **Medium risk**: Category matching against user's dynamic category list — needs to be loaded first.
- **Mitigation**: Keep parser simple. Don't try to handle all cases — graceful fallback to manual form is key.

#### LOC Estimate
- Tests: ~80
- Implementation: ~100 (parser ~60, integration ~30, CSS ~10)

---

## Implementation Order

### Recommended Execution Sequence

```
Sprint 1 (Phase 1):
  P5  → Reduced Motion (smallest, 15 LOC, unblocks Chart.js pattern)
  P6  → Shortcuts Modal (mostly done, verify + polish)
  P3  → Toast Undo (small, self-contained utility change)
  P1  → Theme Toggle (foundational, unblocks P16)
  P2  → Sidebar Collapse (independent, moderate)
  P4  → Mobile Bottom Nav (largest in phase, needs careful responsive work)

Sprint 2 (Phase 2):
  P11 → Backdrop Blur (tiny, CSS-only)
  P19 → Landing CTA (tiny, CSS-only)
  P13 → Privacy Banner (small, self-contained)
  P10 → Error Boundary (small extension of existing)
  P7  → Tab Auth (moderate refactor)
  P8  → Remember Me (small but high-risk due to utils.js change)
  P14 → Enhanced Skeletons (moderate, extends existing)
  P15 → Notification Enhancements (moderate, extends existing)
  P12 → Expandable Stats (moderate, needs design decisions)
  P9  → Onboarding Wizard (largest in phase)

Sprint 3 (Phase 3):
  P18 → Demo Quick-Fill (tiny)
  P17 → Quick Setup Presets (small)
  P23 → Breadcrumbs (small-moderate)
  P20 → Color Swatch Picker (moderate, reusable component)
  P22 → Search Filters (moderate)
  P21 → Hover Actions (moderate)
  P16 → Multiple Themes (large, CSS-heavy)
  P26 → Shortcut Customization (moderate, refactor)
  P27 → Vim Navigation (moderate)
  P28 → NLP Quick Capture (moderate-large, parser work)
  P24 → Multi-Select (large, needs API endpoint)
  P25 → PWA Offline Queuing (largest, highest risk)
```

---

## Size Summary

| Item | Test LOC | Impl LOC | Total | Risk |
|------|----------|----------|-------|------|
| P1 Theme Toggle | 80 | 120 | 200 | High |
| P2 Sidebar Collapse | 70 | 100 | 170 | Medium |
| P3 Toast Undo | 50 | 40 | 90 | Low |
| P4 Mobile Bottom Nav | 70 | 130 | 200 | High |
| P5 Reduced Motion | 30 | 15 | 45 | Low |
| P6 Shortcuts Modal | 20 | 10 | 30 | None |
| P7 Tab Auth | 60 | 60 | 120 | Medium |
| P8 Remember Me | 50 | 35 | 85 | High |
| P9 Onboarding Wizard | 70 | 120 | 190 | Medium |
| P10 Error Boundary | 40 | 25 | 65 | Low |
| P11 Backdrop Blur | 20 | 15 | 35 | Low |
| P12 Expandable Stats | 50 | 100 | 150 | Medium |
| P13 Privacy Banner | 40 | 35 | 75 | Low |
| P14 Enhanced Skeletons | 40 | 60 | 100 | Low |
| P15 Notification Enhancements | 40 | 30 | 70 | Low |
| P16 Multiple Themes | 60 | 200 | 260 | High |
| P17 Quick Setup Presets | 40 | 40 | 80 | Low |
| P18 Demo Quick-Fill | 30 | 25 | 55 | Low |
| P19 Landing CTA | 20 | 15 | 35 | None |
| P20 Color Swatch Picker | 50 | 80 | 130 | Medium |
| P21 Hover Actions | 40 | 60 | 100 | Medium |
| P22 Search Filters | 40 | 50 | 90 | Low |
| P23 Breadcrumbs | 40 | 50 | 90 | Low |
| P24 Multi-Select | 100 | 150 | 250 | High |
| P25 PWA Offline Queue | 80 | 200 | 280 | High |
| P26 Shortcut Customization | 60 | 100 | 160 | Medium |
| P27 Vim Navigation | 60 | 80 | 140 | Medium |
| P28 NLP Quick Capture | 80 | 100 | 180 | Medium |
| **TOTALS** | **1450** | **2110** | **3560** | — |

---

## TDD Workflow Per Item

For every item, follow this cycle:

1. **Create test file** (`tests/{feature}.test.js`)
2. **Write all test cases** from the list above
3. **Run tests** — all new tests should FAIL (red)
4. **Run existing tests** — should all PASS (no regression)
5. **Implement the minimum code** to make tests pass
6. **Run all tests** — new + existing should PASS (green)
7. **Lint check** — `npx eslint .` should show no new errors
8. **Refactor** if needed — tests should still pass

### Test File Template

```js
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('{Feature Name}', () => {
  // For frontend file assertions:
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', '{file}'), 'utf-8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf-8');

  // For API tests:
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('should ...', () => {
    assert.ok(html.includes('expected-class'));
  });
});
```

---

## Critical Risks Summary

| Risk | Items | Mitigation |
|------|-------|------------|
| `utils.js token()` change breaks auth everywhere | P8 | Write exhaustive auth regression tests first. Test sessionStorage + localStorage fallback in isolation. |
| Chart.js color hardcoding defeats theming | P1, P16 | Audit `charts.js` COLORS; read CSS variables at chart init time via `getComputedStyle`. |
| Mobile bottom nav conflicts with sidebar | P4 | Disable sidebar entirely at <768px; keep sidebar for tablets (768-1024). |
| Offline queue replay conflicts | P25 | Start simple (FIFO). Accept that conflicts show error toast. Don't try to merge. |
| WCAG contrast in new themes | P16 | Automated contrast ratio checking in tests using the `[data-theme]` CSS variable values. |
| Bulk delete data loss | P24 | Require explicit confirmation modal. Single DB transaction. Validate all IDs belong to user. |
| Stat card click behavior change | P12 | Expand on single click; add "View all →" link inside expanded panel for navigation. |

---

## Existing Test Files That May Need Updates

| Existing Test File | Affected By | Why |
|-------------------|-------------|-----|
| `responsive.test.js` | P4 | Mobile layout assertions may need updating for bottom nav |
| `phase6-core-ux.test.js` | P6, P26 | Keyboard shortcut assertions may change when shortcuts become configurable |
| `notification-ui.test.js` | P15 | May need updates for navigation on click behavior |
| `auth.test.js` | P8 | Token storage tests if they assert localStorage specifically |
| `ui-states.test.js` | P10, P14 | New showError options, new skeleton functions |
| `branding-pwa.test.js` | P25 | Service worker behavior changes with offline queuing |
| `accessibility.test.js` | P1, P7, P23 | Theme toggle a11y, tab auth a11y, breadcrumb a11y |

---

## Review Addendum: Must-Fix Items Applied

1. ✅ P25 test strategy: Extract queue logic as pure functions; sw.js runtime tested via file-content assertions only
2. ✅ P8 token architecture: Module-level `_token` with `setToken()/clearToken()` design
3. ✅ P1 charts.js: Added to files table
4. ✅ P24 endpoint: Uses existing `POST /api/transactions/bulk-delete`
5. ✅ P1 theme sync: API source of truth, localStorage as cache
6. ✅ P12/P4 design decisions: Click-to-expand + "View all →" link; More = bottom sheet
7. ✅ P16 contrast methodology: Relative luminance calculator in test helper

### Should-Fix Items Applied
8. App.js extraction: After Phase 1, extract `theme.js`, `keyboard.js`, `sidebar.js` modules when app.js > 600 LOC
9. SW STATIC_ASSETS: Any new JS file MUST be added to `sw.js` STATIC_ASSETS
10. Cross-feature integration tests: Add `tests/ux-integration.test.js`
11. Test file organization: All new UX test files prefixed with `ux-` (e.g., `ux-theme-toggle.test.js`)
12. Animation design tokens: Define `--transition-fast: 150ms ease`, `--transition-medium: 250ms ease-out` in `:root`

---

## Post-Implementation Verification

After all 28 items are implemented:

1. Run full test suite: `npm test` — expect ~2000+ tests passing (1667 existing + ~350 new)
2. Lint: `npx eslint .` — 0 errors
3. Build Docker: `docker compose build` — succeeds
4. Manual smoke test all 3 pages in both themes
5. Lighthouse accessibility audit ≥ 90
6. Test with `prefers-reduced-motion: reduce` in DevTools
7. Test with keyboard-only navigation (no mouse)
8. Test at 320px, 768px, 1024px, 1440px viewport widths
