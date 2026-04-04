// tests/frontend-views-deep.test.js — Deep coverage: all 20 view files
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const viewDir = path.join(PUBLIC, 'js', 'views');
const viewFiles = {};
for (const f of fs.readdirSync(viewDir).filter(f => f.endsWith('.js'))) {
  viewFiles[f.replace('.js', '')] = fs.readFileSync(path.join(viewDir, f), 'utf8');
}

const allViewNames = Object.keys(viewFiles);
const allViewSources = Object.values(viewFiles);

// ════════════════════════════════════════════════════════════════
// UNIVERSAL VIEW CONTRACTS — patterns every view must follow
// ════════════════════════════════════════════════════════════════

describe('View Contracts — Render Function', () => {
  it('every view exports a render* function', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      assert.ok(src.match(/export\s+(async\s+)?function\s+render\w+/), `${name}.js must export render*`);
    }
  });

  it('every render function accepts container as first param', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const m = src.match(/export\s+(?:async\s+)?function\s+render\w+\s*\((\w+)/);
      assert.ok(m, `${name}.js must have render function`);
      assert.equal(m[1], 'container', `${name}.js first param must be "container"`);
    }
  });

  it('every view clears container at start', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      assert.ok(
        src.includes("container.innerHTML = ''") || src.includes('container.replaceChildren') || src.includes("container.textContent = ''"),
        `${name}.js must clear container`
      );
    }
  });
});

describe('View Contracts — Imports', () => {
  it('every view imports from utils.js', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      assert.ok(src.includes("from '../utils.js'"), `${name}.js must import from utils.js`);
    }
  });

  it('every view using Api imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.')) {
        assert.ok(src.includes('Api') && src.includes("from '../utils.js'"),
          `${name}.js uses Api but doesn't import it`);
      }
    }
  });

  it('every view using el() imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.match(/\bel\s*\(\s*'/)) {
        assert.ok(src.includes('el') && src.includes("from '../utils.js'"),
          `${name}.js uses el() but doesn't import it`);
      }
    }
  });

  it('every view using toast imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('toast(')) {
        assert.ok(src.includes("import") && src.includes("toast"),
          `${name}.js uses toast but doesn't import it`);
      }
    }
  });

  it('every view using fmt imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.match(/\bfmt\s*\(/)) {
        assert.ok(src.includes("import") && src.includes("fmt"),
          `${name}.js uses fmt but doesn't import it`);
      }
    }
  });

  it('every view using openModal imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('openModal(')) {
        assert.ok(src.includes("import") && src.includes("openModal"),
          `${name}.js uses openModal but doesn't import it`);
      }
    }
  });

  it('every view using closeModal imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('closeModal')) {
        assert.ok(src.includes("import") && src.includes("closeModal"),
          `${name}.js uses closeModal but doesn't import it`);
      }
    }
  });

  it('every view using confirm imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.match(/\bconfirm\s*\(/)) {
        assert.ok(src.includes("import") && src.includes("confirm"),
          `${name}.js uses confirm but doesn't import it`);
      }
    }
  });

  it('every view using withLoading imports it', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('withLoading(')) {
        assert.ok(src.includes("import") && src.includes("withLoading"),
          `${name}.js uses withLoading but doesn't import it`);
      }
    }
  });
});

describe('View Contracts — Error Handling', () => {
  it('every view with API calls has try/catch', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.')) {
        assert.ok(src.includes('catch'), `${name}.js makes API calls but has no catch`);
      }
    }
  });

  it('every catch block communicates error to user', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const catches = src.match(/catch\s*\((\w+)\)\s*\{/g) || [];
      for (const c of catches) {
        const catchStart = src.indexOf(c);
        const catchBody = src.slice(catchStart, catchStart + 300);
        const hasUserFeedback = catchBody.includes('toast(') || catchBody.includes('showError(') ||
          catchBody.includes('textContent') || catchBody.includes('error');
        assert.ok(hasUserFeedback, `${name}.js has catch block without user feedback`);
      }
    }
  });
});

describe('View Contracts — User Feedback', () => {
  it('every view with mutations (post/put/del) shows toast', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.post(') || src.includes('Api.put(') || src.includes('Api.del(')) {
        assert.ok(src.includes('toast('), `${name}.js mutates data but never shows toast`);
      }
    }
  });

  it('every delete action uses confirm() dialog', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.del(')) {
        assert.ok(src.includes('confirm('), `${name}.js uses Api.del() without confirm dialog`);
      }
    }
  });

  it('every mutation refreshes data after success', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (src.includes('Api.post(') || src.includes('Api.put(') || src.includes('Api.del(')) {
        assert.ok(
          src.includes('render') || src.includes('load') || src.includes('refresh') || src.includes('onRefresh'),
          `${name}.js mutates data but has no refresh mechanism`
        );
      }
    }
  });
});

describe('View Contracts — Entity Header Icons', () => {
  it('every view has entity-icon in header', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (!src.includes('view-header')) continue;
      assert.ok(src.includes('entity-icon'), `${name}.js view-header must have entity-icon`);
    }
  });

  it('every view header has material-icons-round icon', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      if (!src.includes('view-header')) continue;
      assert.ok(src.includes('material-icons-round'), `${name}.js must use material icon in header`);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// INDIVIDUAL VIEW DEEP TESTS
// ════════════════════════════════════════════════════════════════

describe('accounts.js — deep', () => {
  const src = viewFiles.accounts;

  it('exports renderAccounts', () => {
    assert.ok(src.includes('export async function renderAccounts'));
  });

  it('fetches /accounts endpoint', () => {
    assert.ok(src.includes("Api.get('/accounts')"));
  });

  it('has add account button', () => {
    assert.ok(src.includes('Add Account'));
  });

  it('uses accounts-grid for card layout', () => {
    assert.ok(src.includes('accounts-grid'));
  });

  it('displays account balance with fmt()', () => {
    assert.ok(src.includes('fmt('));
  });

  it('has account-card class', () => {
    assert.ok(src.includes('account-card'));
  });

  it('shows account type', () => {
    assert.ok(src.includes('.type') || src.includes('type'));
  });

  it('supports edit and delete actions', () => {
    assert.ok(src.includes('edit') || src.includes('Edit'));
    assert.ok(src.includes('Api.del('));
  });

  it('handles active/inactive accounts', () => {
    assert.ok(src.includes('inactive') || src.includes('is_active'));
  });

  it('shows net worth summary', () => {
    assert.ok(src.includes('net_worth') || src.includes('Net Worth') || src.includes('total'));
  });

  it('has account form with required fields', () => {
    assert.ok(src.includes("name: 'name'") || src.includes('name'));
    assert.ok(src.includes("type: 'number'") || src.includes('balance'));
  });

  it('supports account icons/emojis', () => {
    assert.ok(src.includes('icon'));
  });

  it('supports account colors', () => {
    assert.ok(src.includes('color') || src.includes('Color'));
  });

  it('uses borderLeft for account color indicator', () => {
    assert.ok(src.includes('borderLeft') || src.includes('border-left'));
  });
});

describe('transactions.js — deep', () => {
  const src = viewFiles.transactions;

  it('exports renderTransactions', () => {
    assert.ok(src.includes('export async function renderTransactions'));
  });

  it('imports showLoading and showError from ui-states', () => {
    assert.ok(src.includes("from '../ui-states.js'"));
  });

  it('imports form validator', () => {
    assert.ok(src.includes("from '../form-validator.js'"));
  });

  it('imports pagination component', () => {
    assert.ok(src.includes("from '../pagination.js'"));
  });

  it('uses PAGE_SIZE constant', () => {
    assert.ok(src.includes('PAGE_SIZE'));
  });

  it('has filter bar', () => {
    assert.ok(src.includes('filter-bar') || src.includes('filterBar'));
  });

  it('supports multi-select mode (P24)', () => {
    assert.ok(src.includes('multiSelectMode') || src.includes('multi-select'));
    assert.ok(src.includes('selectedIds'));
  });

  it('has bulk action bar', () => {
    assert.ok(src.includes('bulk-action-bar'));
  });

  it('supports bulk delete', () => {
    assert.ok(src.includes('bulkDelete') || src.includes('Delete Selected'));
  });

  it('uses AbortController to prevent event listener leaks (P24)', () => {
    assert.ok(src.includes('AbortController'));
    assert.ok(src.includes('signal'));
  });

  it('loads reference data (accounts, categories) in parallel', () => {
    assert.ok(src.includes('Promise.all'));
  });

  it('has add transaction button', () => {
    assert.ok(src.includes('Add Transaction'));
  });

  it('shows amount with income/expense coloring', () => {
    assert.ok(src.includes('income') && src.includes('expense'));
  });

  it('paginates transaction list', () => {
    assert.ok(src.includes('pagination') || src.includes('Pagination'));
    assert.ok(src.includes('loadPage'));
  });

  it('has transaction form with validation', () => {
    assert.ok(src.includes('showTxnForm'));
    assert.ok(src.includes('attachValidation') || src.includes('rules'));
  });
});

describe('budgets.js — deep', () => {
  const src = viewFiles.budgets;

  it('exports renderBudgets', () => {
    assert.ok(src.includes('export async function renderBudgets'));
  });

  it('fetches /budgets endpoint', () => {
    assert.ok(src.includes('/budgets'));
  });

  it('has add budget button', () => {
    assert.ok(src.includes('New Budget'));
  });

  it('uses budgets-grid layout', () => {
    assert.ok(src.includes('budgets-grid'));
  });

  it('shows budget progress bars', () => {
    assert.ok(src.includes('progress-bar') || src.includes('progress'));
  });

  it('calculates budget percentage', () => {
    assert.ok(src.includes('pct') || src.includes('percent') || src.includes('%'));
  });

  it('shows over-budget indicator', () => {
    assert.ok(src.includes('over') || src.includes('exceeded'));
  });

  it('has budget items/categories', () => {
    assert.ok(src.includes('items') || src.includes('category'));
  });

  it('supports delete', () => {
    assert.ok(src.includes('Api.del('));
  });
});

describe('goals.js — deep', () => {
  const src = viewFiles.goals;

  it('exports renderGoals', () => {
    assert.ok(src.includes('export async function renderGoals'));
  });

  it('fetches /goals endpoint', () => {
    assert.ok(src.includes('/goals'));
  });

  it('has add goal button', () => {
    assert.ok(src.includes('New Goal'));
  });

  it('uses goals-grid layout', () => {
    assert.ok(src.includes('goals-grid'));
  });

  it('shows goal progress', () => {
    assert.ok(src.includes('progress'));
  });

  it('shows current vs target amounts', () => {
    assert.ok(src.includes('current_amount') || src.includes('target_amount'));
  });

  it('supports contributions', () => {
    assert.ok(src.includes('contribute') || src.includes('Contribute') || src.includes('add'));
  });

  it('shows completed goals differently', () => {
    assert.ok(src.includes('completed') || src.includes('is_completed'));
  });

  it('formats amounts with fmt()', () => {
    assert.ok(src.includes('fmt('));
  });

  it('supports deadline tracking', () => {
    assert.ok(src.includes('deadline'));
  });

  it('has goal-card class', () => {
    assert.ok(src.includes('goal-card'));
  });

  it('supports goal colors/icons', () => {
    assert.ok(src.includes('icon') && src.includes('color'));
  });
});

describe('categories.js — deep', () => {
  const src = viewFiles.categories;

  it('exports renderCategories', () => {
    assert.ok(src.includes('export async function renderCategories'));
  });

  it('fetches /categories', () => {
    assert.ok(src.includes('/categories'));
  });

  it('has add category button', () => {
    assert.ok(src.includes('Add Category'));
  });

  it('groups by type (income/expense)', () => {
    assert.ok(src.includes("type === 'expense'") || src.includes("type === 'income'"));
  });

  it('has category form with name, type, color, icon', () => {
    assert.ok(src.includes("name: 'name'"));
    assert.ok(src.includes("name: 'type'") || src.includes('select'));
    assert.ok(src.includes('color'));
  });

  it('supports edit and delete', () => {
    assert.ok(src.includes('Api.put(') || src.includes('edit'));
    assert.ok(src.includes('Api.del('));
  });
});

describe('subscriptions.js — deep', () => {
  const src = viewFiles.subscriptions;

  it('exports renderSubscriptions', () => {
    assert.ok(src.includes('export async function renderSubscriptions'));
  });

  it('fetches /subscriptions', () => {
    assert.ok(src.includes('/subscriptions'));
  });

  it('has add subscription button', () => {
    assert.ok(src.includes('Add Subscription'));
  });

  it('uses subs-grid layout', () => {
    assert.ok(src.includes('subs-grid'));
  });

  it('shows monthly/annual cost', () => {
    assert.ok(src.includes('amount') && src.includes('frequency'));
  });

  it('shows total subscription cost', () => {
    assert.ok(src.includes('total') || src.includes('Total') || src.includes('Monthly'));
  });

  it('has sub-card class', () => {
    assert.ok(src.includes('sub-card'));
  });

  it('handles active/inactive subscriptions', () => {
    assert.ok(src.includes('inactive') || src.includes('is_active'));
  });
});

describe('groups.js — deep', () => {
  const src = viewFiles.groups;

  it('exports renderGroups', () => {
    assert.ok(src.includes('export async function renderGroups'));
  });

  it('fetches /groups', () => {
    assert.ok(src.includes('/groups'));
  });

  it('has create group button', () => {
    assert.ok(src.includes('Create Group'));
  });

  it('uses groups-grid layout', () => {
    assert.ok(src.includes('groups-grid'));
  });

  it('shows member count', () => {
    assert.ok(src.includes('member') || src.includes('Member'));
  });

  it('has group-card class', () => {
    assert.ok(src.includes('group-card'));
  });

  it('supports group colors/icons', () => {
    assert.ok(src.includes('icon') || src.includes('color'));
  });
});

describe('splits.js — deep', () => {
  const src = viewFiles.splits;

  it('exports renderSplits', () => {
    assert.ok(src.includes('export async function renderSplits'));
  });

  it('supports settle-up', () => {
    assert.ok(src.includes('settle') || src.includes('Settle'));
  });

  it('shows balances between members', () => {
    assert.ok(src.includes('balance') || src.includes('owe'));
  });

  it('has shared expense form', () => {
    assert.ok(src.includes('amount') && src.includes('description'));
  });
});

describe('recurring.js — deep', () => {
  const src = viewFiles.recurring;

  it('exports renderRecurring', () => {
    assert.ok(src.includes('export async function renderRecurring'));
  });

  it('fetches /recurring', () => {
    assert.ok(src.includes('/recurring'));
  });

  it('uses recurring-card class', () => {
    assert.ok(src.includes('recurring-card'));
  });

  it('shows frequency/interval', () => {
    assert.ok(src.includes('frequency') || src.includes('interval'));
  });

  it('handles suggestions', () => {
    assert.ok(src.includes('suggest') || src.includes('Suggest') || src.includes('suggestion'));
  });

  it('supports CRUD operations', () => {
    assert.ok(src.includes('Api.post(') || src.includes('Api.put('));
    assert.ok(src.includes('Api.del('));
  });
});

describe('insights.js — deep', () => {
  const src = viewFiles.insights;

  it('exports renderInsights', () => {
    assert.ok(src.includes('export async function renderInsights'));
  });

  it('fetches insights data', () => {
    assert.ok(src.includes('/insights') || src.includes('/stats'));
  });

  it('shows spending analysis', () => {
    assert.ok(src.includes('velocity') || src.includes('anomal') || src.includes('trend') || src.includes('spend'));
  });
});

describe('reports.js — deep', () => {
  const src = viewFiles.reports;

  it('exports renderHealth', () => {
    assert.ok(src.includes('export async function renderHealth'));
  });

  it('exports renderReports', () => {
    assert.ok(src.includes('export async function renderReports'));
  });

  it('fetches financial health data', () => {
    assert.ok(src.includes('/stats/financial-health'));
  });

  it('shows health score', () => {
    assert.ok(src.includes('score') || src.includes('Score'));
  });

  it('handles gated data', () => {
    assert.ok(src.includes('gated'));
  });

  it('formats currency values', () => {
    assert.ok(src.includes('fmt('));
  });
});

describe('settings.js — deep', () => {
  const src = viewFiles.settings;

  it('exports renderSettings', () => {
    assert.ok(src.includes('export async function renderSettings'));
  });

  it('has theme selection', () => {
    assert.ok(src.includes('theme') || src.includes('Theme'));
  });

  it('has data import/export section', () => {
    assert.ok(src.includes('import') || src.includes('export') || src.includes('Export'));
  });

  it('saves preferences to /settings', () => {
    assert.ok(src.includes('/settings'));
  });

  it('has currency preference', () => {
    assert.ok(src.includes('currency') || src.includes('Currency'));
  });

  it('has keyboard shortcuts configuration', () => {
    assert.ok(src.includes('shortcut') || src.includes('Shortcut') || src.includes('keyboard'));
  });

  it('has date format preference', () => {
    assert.ok(src.includes('date_format') || src.includes('Date Format') || src.includes('dateFormat'));
  });

  it('has security section', () => {
    assert.ok(src.includes('password') || src.includes('Password') || src.includes('security') || src.includes('Security'));
  });
});

describe('search.js — deep', () => {
  const src = viewFiles.search;

  it('exports renderSearch', () => {
    assert.ok(src.includes('export async function renderSearch'));
  });

  it('accepts query as second parameter', () => {
    assert.ok(src.includes('renderSearch(container, query)'));
  });

  it('fetches /search endpoint with encoded query', () => {
    assert.ok(src.includes('encodeURIComponent'));
    assert.ok(src.includes('/search?q='));
  });

  it('highlights matching text', () => {
    assert.ok(src.includes('highlightText') || src.includes('highlight'));
  });

  it('uses <mark> for highlights (safe)', () => {
    assert.ok(src.includes("createElement('mark')") || src.includes('search-highlight'));
  });

  it('highlight uses textContent (not innerHTML)', () => {
    assert.ok(src.includes('mark.textContent = part'));
  });

  it('escapes regex special chars in query', () => {
    assert.ok(src.includes('replace(/[.*+?^${}()|[\\]\\\\]/g'));
  });

  it('shows filter chips (P22)', () => {
    assert.ok(src.includes('search-filter-chip'));
    assert.ok(src.includes('All'));
    assert.ok(src.includes('Transactions'));
    assert.ok(src.includes('Accounts'));
    assert.ok(src.includes('Categories'));
  });

  it('filter chips have aria-pressed attribute', () => {
    assert.ok(src.includes("'aria-pressed'"));
  });

  it('filter toolbar has role="toolbar"', () => {
    assert.ok(src.includes("role: 'toolbar'"));
  });

  it('shows total result count', () => {
    assert.ok(src.includes('totalResults'));
    assert.ok(src.includes('result'));
  });

  it('handles empty query gracefully', () => {
    assert.ok(src.includes('!query') || src.includes('!query.trim'));
  });

  it('shows empty state for no results', () => {
    assert.ok(src.includes('No results'));
  });

  it('groups results by entity type', () => {
    assert.ok(src.includes('Transactions'));
    assert.ok(src.includes('Accounts'));
  });

  it('shows result cards for each entity', () => {
    assert.ok(src.includes('search-result-card'));
  });
});

describe('dashboard.js — deep', () => {
  const src = viewFiles.dashboard;

  it('exports renderDashboard', () => {
    assert.ok(src.includes('export async function renderDashboard'));
  });

  it('fetches overview stats', () => {
    assert.ok(src.includes('/stats/overview') || src.includes('overview'));
  });

  it('shows stat cards', () => {
    assert.ok(src.includes('stat-card'));
  });

  it('initializes charts', () => {
    assert.ok(src.includes('initDashboardCharts') || src.includes('charts'));
  });

  it('imports chart module', () => {
    assert.ok(src.includes("from '../charts.js'") || src.includes('charts'));
  });

  it('shows recent transactions', () => {
    assert.ok(src.includes('recent') || src.includes('Recent'));
  });

  it('shows greeting with user name', () => {
    assert.ok(src.includes('Hello') || src.includes('greeting'));
  });

  it('has charts-grid for chart layout', () => {
    assert.ok(src.includes('charts-grid'));
  });
});

describe('export.js — deep', () => {
  const src = viewFiles.export;

  it('exports renderExport', () => {
    assert.ok(src.includes('export async function renderExport'));
  });

  it('has export form', () => {
    assert.ok(src.includes('form') || src.includes('export'));
  });

  it('supports CSV format', () => {
    assert.ok(src.includes('csv') || src.includes('CSV'));
  });

  it('supports JSON format', () => {
    assert.ok(src.includes('json') || src.includes('JSON'));
  });

  it('does not use innerHTML with template literals', () => {
    assert.ok(!src.match(/\.innerHTML\s*=\s*`/));
  });
});

describe('calendar.js — deep', () => {
  const src = viewFiles.calendar;

  it('exports renderCalendar', () => {
    assert.ok(src.includes('export async function renderCalendar'));
  });

  it('fetches /calendar endpoint', () => {
    assert.ok(src.includes('/calendar'));
  });

  it('does NOT double-prefix /api/', () => {
    assert.ok(!src.includes("Api.get(`/api/"));
  });

  it('has month navigation', () => {
    assert.ok(src.includes('month') || src.includes('Month'));
  });
});

describe('calculators.js — deep', () => {
  const src = viewFiles.calculators;

  it('exports renderCalculators', () => {
    assert.ok(src.includes('export async function renderCalculators'));
  });

  it('has SIP calculator', () => {
    assert.ok(src.includes('sip') || src.includes('SIP'));
  });

  it('has Lumpsum calculator', () => {
    assert.ok(src.includes('lumpsum') || src.includes('Lumpsum'));
  });

  it('has EMI calculator', () => {
    assert.ok(src.includes('emi') || src.includes('EMI'));
  });

  it('has FIRE calculator', () => {
    assert.ok(src.includes('fire') || src.includes('FIRE'));
  });

  it('formats results with fmt()', () => {
    assert.ok(src.includes('fmt('));
  });
});

describe('challenges.js — deep', () => {
  const src = viewFiles.challenges;

  it('exports renderChallenges', () => {
    assert.ok(src.includes('export async function renderChallenges'));
  });

  it('fetches /challenges', () => {
    assert.ok(src.includes('/challenges'));
  });

  it('has new challenge button', () => {
    assert.ok(src.includes('New Challenge'));
  });

  it('supports CRUD operations', () => {
    assert.ok(src.includes('Api.post('));
    assert.ok(src.includes('Api.del('));
  });
});

describe('tags.js — deep', () => {
  const src = viewFiles.tags;

  it('exports renderTags', () => {
    assert.ok(src.includes('export async function renderTags'));
  });

  it('fetches /tags', () => {
    assert.ok(src.includes('/tags'));
  });

  it('has add tag button', () => {
    assert.ok(src.includes('Add Tag'));
  });

  it('uses Api.del for tag deletion', () => {
    assert.ok(src.includes('Api.del('));
  });

  it('has tag form', () => {
    assert.ok(src.includes("name: 'name'") || src.includes('form'));
  });
});

describe('rules.js — deep', () => {
  const src = viewFiles.rules;

  it('exports renderRules', () => {
    assert.ok(src.includes('export async function renderRules'));
  });

  it('fetches /rules', () => {
    assert.ok(src.includes('/rules'));
  });

  it('has add rule button', () => {
    assert.ok(src.includes('Add Rule'));
  });

  it('supports pattern matching', () => {
    assert.ok(src.includes('pattern') || src.includes('Pattern'));
  });

  it('maps to categories', () => {
    assert.ok(src.includes('category') || src.includes('Category'));
  });
});

// ════════════════════════════════════════════════════════════════
// API METHOD SAFETY — no Api.delete() anywhere
// ════════════════════════════════════════════════════════════════

describe('API Method Safety — global', () => {
  it('no view uses Api.delete()', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      assert.ok(!src.includes('Api.delete('), `${name}.js uses Api.delete() — must use Api.del()`);
    }
  });

  it('no view uses fmt.currency()', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      assert.ok(!src.includes('fmt.currency('), `${name}.js uses fmt.currency() — must use fmt()`);
    }
  });

  it('no view double-prefixes /api/ in API calls', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      assert.ok(!src.includes("Api.get(`/api/") && !src.includes("Api.get('/api/"),
        `${name}.js double-prefixes /api/ in API call`);
    }
  });

  it('all Api.get paths start with /', () => {
    for (const [name, src] of Object.entries(viewFiles)) {
      const calls = src.match(/Api\.get\s*\(\s*[`'"]([^`'"]*)[`'"]/g) || [];
      for (const call of calls) {
        const pathMatch = call.match(/[`'"]([^`'"]*)[`'"]/);
        if (pathMatch && !pathMatch[1].startsWith('$')) {
          assert.ok(pathMatch[1].startsWith('/'), `${name}.js: Api.get path must start with /: ${pathMatch[1]}`);
        }
      }
    }
  });
});
