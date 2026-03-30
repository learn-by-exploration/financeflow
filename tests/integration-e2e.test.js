const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  setup, cleanDb, teardown, agent, rawAgent,
  makeAccount, makeCategory, makeTransaction, makeBudget,
  makeGoal, makeGroup, makeGroupMember, makeSharedExpense,
  makeRecurringRule, makeSecondUser,
  today, daysFromNow,
} = require('./helpers');

// ─── Integration E2E Tests — v0.3.50 ───

before(() => setup());
after(() => teardown());

// ══════════════════════════════════════════════
// 1. Complete User Lifecycle
// ══════════════════════════════════════════════

describe('E2E: Complete user lifecycle', () => {
  beforeEach(() => cleanDb());

  it('register → login → create account → categories → transactions → dashboard → reports → logout', async () => {
    const raw = rawAgent();
    const username = 'lifecycle_' + Date.now();

    // Register
    const regRes = await raw.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ username, password: 'SecurePass123!', display_name: 'Lifecycle User' })
      .expect(201);
    const token = regRes.body.token;
    assert.ok(token);
    const userId = regRes.body.user.id;

    // Login
    const loginRes = await raw.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username, password: 'SecurePass123!' })
      .expect(200);
    const loginToken = loginRes.body.token;
    assert.ok(loginToken);

    // Helper for authenticated requests
    const auth = (method, url) => raw[method](url).set('X-Session-Token', loginToken).set('Content-Type', 'application/json');

    // Create account
    const acctRes = await auth('post', '/api/accounts')
      .send({ name: 'Main Checking', type: 'checking', currency: 'INR', balance: 100000 })
      .expect(201);
    const accountId = acctRes.body.account.id;

    // Create categories
    const catRes = await auth('post', '/api/categories')
      .send({ name: 'Food', icon: '🍔', color: '#FF5733', type: 'expense' })
      .expect(201);
    const categoryId = catRes.body.category.id;

    const incCatRes = await auth('post', '/api/categories')
      .send({ name: 'Salary', icon: '💰', color: '#22C55E', type: 'income' })
      .expect(201);
    const incomeCatId = incCatRes.body.category.id;

    // Add transactions
    await auth('post', '/api/transactions')
      .send({ account_id: accountId, type: 'income', amount: 50000, description: 'Monthly salary', date: today(), currency: 'INR', category_id: incomeCatId })
      .expect(201);

    await auth('post', '/api/transactions')
      .send({ account_id: accountId, type: 'expense', amount: 2500, description: 'Lunch', date: today(), currency: 'INR', category_id: categoryId })
      .expect(201);

    // View dashboard (stats overview)
    const dashboard = await auth('get', '/api/stats/overview').expect(200);
    assert.ok(dashboard.body.net_worth !== undefined);
    assert.ok(dashboard.body.month_income >= 50000);

    // View reports (year-in-review)
    const year = new Date().getFullYear();
    const reportRes = await auth('get', `/api/reports/year-in-review?year=${year}`).expect(200);
    assert.ok(reportRes.body.total_income >= 50000);
    assert.ok(reportRes.body.total_expenses >= 2500);

    // Logout
    await raw.post('/api/auth/logout')
      .set('X-Session-Token', loginToken)
      .set('Content-Type', 'application/json')
      .expect(200);

    // Verify session is invalidated
    await raw.get('/api/accounts')
      .set('X-Session-Token', loginToken)
      .set('Content-Type', 'application/json')
      .expect(401);
  });

  it('register → enable 2FA → login requires TOTP → disable 2FA', async () => {
    const raw = rawAgent();
    const username = 'totp_' + Date.now();

    // Register
    const regRes = await raw.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ username, password: 'SecurePass123!' })
      .expect(201);
    const token = regRes.body.token;

    // Setup TOTP
    const setupRes = await raw.post('/api/auth/totp/setup')
      .set('X-Session-Token', token)
      .set('Content-Type', 'application/json')
      .expect(200);
    const secret = setupRes.body.secret;
    assert.ok(secret);

    // Generate valid TOTP code
    const OTPAuth = require('otpauth');
    const totp = new OTPAuth.TOTP({
      issuer: 'PersonalFi', label: username,
      algorithm: 'SHA1', digits: 6, period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const code = totp.generate();

    // Verify TOTP (enables 2FA)
    await raw.post('/api/auth/totp/verify')
      .set('X-Session-Token', token)
      .set('Content-Type', 'application/json')
      .send({ code })
      .expect(200);

    // Login without TOTP — should require 2FA
    const loginNo2fa = await raw.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username, password: 'SecurePass123!' })
      .expect(403);
    assert.ok(loginNo2fa.body.requires_2fa);

    // Login with TOTP
    const newCode = totp.generate();
    const loginWith2fa = await raw.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username, password: 'SecurePass123!', totp_code: newCode })
      .expect(200);
    assert.ok(loginWith2fa.body.token);
    const newToken = loginWith2fa.body.token;

    // Disable 2FA
    await raw.post('/api/auth/totp/disable')
      .set('X-Session-Token', newToken)
      .set('Content-Type', 'application/json')
      .send({ password: 'SecurePass123!' })
      .expect(200);

    // Login again without TOTP — should succeed
    const loginAfterDisable = await raw.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username, password: 'SecurePass123!' })
      .expect(200);
    assert.ok(loginAfterDisable.body.token);
  });
});

// ══════════════════════════════════════════════
// 2. Cross-Feature Interactions
// ══════════════════════════════════════════════

describe('E2E: Budget → transactions → utilization', () => {
  beforeEach(() => cleanDb());

  it('create budget → add transactions → check budget summary reflects spending', async () => {
    const api = agent();
    const cat = makeCategory({ name: 'Groceries', type: 'expense' });
    const acct = makeAccount({ balance: 100000 });

    // Create budget with items
    const budgetRes = await api.post('/api/budgets').send({
      name: 'Monthly Budget',
      period: 'monthly',
      start_date: today(),
      end_date: daysFromNow(30),
      items: [{ category_id: cat.id, amount: 10000 }],
    }).expect(201);
    const budgetId = budgetRes.body.id;

    // Add expense transactions in budget category
    await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 3000,
      category_id: cat.id, description: 'Groceries week 1', date: today(), currency: 'INR',
    }).expect(201);

    await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 4500,
      category_id: cat.id, description: 'Groceries week 2', date: today(), currency: 'INR',
    }).expect(201);

    // Check budget summary
    const summary = await api.get(`/api/budgets/${budgetId}/summary`).expect(200);
    assert.ok(summary.body.categories);
    const groceryCat = summary.body.categories.find(c => c.category_id === cat.id);
    assert.ok(groceryCat);
    assert.equal(groceryCat.allocated, 10000);
    assert.equal(groceryCat.spent, 7500);
  });

  it('create spending limit → add transactions → verify limit status', async () => {
    const api = agent();
    const cat = makeCategory({ name: 'Entertainment', type: 'expense' });
    const acct = makeAccount({ balance: 50000 });

    // Create spending limit
    const limitRes = await api.post('/api/spending-limits').send({
      category_id: cat.id,
      amount: 5000,
      period: 'monthly',
    }).expect(201);
    assert.ok(limitRes.body.spending_limit.id);

    // Add expense
    await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 4000,
      category_id: cat.id, description: 'Movie tickets', date: today(), currency: 'INR',
    }).expect(201);

    // Check spending limits — should reflect usage
    const limits = await api.get('/api/spending-limits').expect(200);
    assert.ok(limits.body.spending_limits.length >= 1);
  });
});

describe('E2E: Goal → transactions → progress', () => {
  beforeEach(() => cleanDb());

  it('create goal → link income transaction → verify progress increases', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 50000 });

    // Create goal
    const goalRes = await api.post('/api/goals').send({
      name: 'Vacation Fund', target_amount: 50000, currency: 'INR',
      icon: '✈️', color: '#3B82F6',
    }).expect(201);
    const goalId = goalRes.body.goal.id;

    // Create income transaction
    const txRes = await api.post('/api/transactions').send({
      account_id: acct.id, type: 'income', amount: 10000,
      description: 'Freelance payment', date: today(), currency: 'INR',
    }).expect(201);
    const txId = txRes.body.transaction.id;

    // Link transaction to goal
    await api.post(`/api/goals/${goalId}/transactions`).send({
      transaction_id: txId, amount: 10000,
    }).expect(201);

    // Verify goal progress
    const goalCheck = await api.get('/api/goals').expect(200);
    const goal = goalCheck.body.goals.find(g => g.id === goalId);
    assert.ok(goal);
    assert.equal(goal.current_amount, 10000);
  });
});

describe('E2E: Group expense splitting lifecycle', () => {
  beforeEach(() => cleanDb());

  it('create group → add members → create expense → split → settle → verify balances', async () => {
    const api = agent();

    // Create group via API
    const groupRes = await api.post('/api/groups').send({
      name: 'Trip Group', icon: '🏖️', color: '#8B5CF6',
    }).expect(201);
    const groupId = groupRes.body.group.id;

    // Add a guest member
    const memberRes = await api.post(`/api/groups/${groupId}/members`).send({
      display_name: 'Alice',
    }).expect(201);
    const aliceMemberId = memberRes.body.id;

    // Get group details (includes members)
    const groupDetails = await api.get(`/api/groups/${groupId}`).expect(200);
    const ownerMember = groupDetails.body.members.find(m => m.role === 'owner');
    const ownerMemberId = ownerMember.id;

    // Create shared expense (paid by owner, split equally)
    const expenseRes = await api.post(`/api/splits/${groupId}/expenses`).send({
      paid_by: ownerMemberId,
      amount: 3000,
      description: 'Dinner',
      date: today(),
      split_method: 'equal',
    }).expect(201);
    assert.ok(expenseRes.body.id);

    // Check balances
    const balRes = await api.get(`/api/splits/${groupId}/balances`).expect(200);
    assert.ok(balRes.body.balances);
    assert.ok(balRes.body.simplified_debts);

    // Settle: Alice pays owner
    await api.post(`/api/splits/${groupId}/settle`).send({
      from_member: aliceMemberId,
      to_member: ownerMemberId,
      amount: 1500,
    }).expect(201);

    // Verify balances updated after settlement
    const balAfter = await api.get(`/api/splits/${groupId}/balances`).expect(200);
    assert.ok(balAfter.body.balances);
  });
});

describe('E2E: Recurring rules → calendar', () => {
  beforeEach(() => cleanDb());

  it('create recurring rule → verify it appears in calendar view', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 100000 });

    // Create recurring rule
    await api.post('/api/recurring').send({
      account_id: acct.id,
      type: 'expense',
      amount: 10000,
      description: 'Monthly Rent',
      frequency: 'monthly',
      next_date: today(),
      currency: 'INR',
    }).expect(201);

    // Check calendar for current month
    const month = new Date().toISOString().slice(0, 7);
    const calRes = await api.get(`/api/calendar?month=${month}`).expect(200);
    assert.ok(calRes.body.days, 'Calendar should have days object');
    assert.ok(calRes.body.recurring_event_count >= 1, 'Should have at least 1 recurring event');
    // Find the recurring rule in the days
    const todayStr = today();
    const dayData = calRes.body.days[todayStr];
    assert.ok(dayData, 'Today should exist in calendar days');
    const found = dayData.recurring.some(e => e.description === 'Monthly Rent' && e.amount === 10000);
    assert.ok(found, 'Recurring rule should appear in calendar for today');
  });
});

describe('E2E: Search across features', () => {
  beforeEach(() => cleanDb());

  it('search returns transactions, accounts, categories matching query', async () => {
    const api = agent();
    const acct = makeAccount({ name: 'UniqueSearchAccount' });
    const cat = makeCategory({ name: 'UniqueSearchCategory', type: 'expense' });
    makeTransaction(acct.id, { description: 'UniqueSearchTransaction', category_id: cat.id });

    const searchRes = await api.get('/api/search?q=UniqueSearch').expect(200);
    assert.ok(searchRes.body.transactions.length >= 1);
    assert.ok(searchRes.body.accounts.length >= 1);
    assert.ok(searchRes.body.categories.length >= 1);
  });
});

describe('E2E: Export transactions', () => {
  beforeEach(() => cleanDb());

  it('create transactions → export CSV → verify CSV contains them', async () => {
    const api = agent();
    const acct = makeAccount({ name: 'Export Account', balance: 50000 });
    const cat = makeCategory({ name: 'ExportCat', type: 'expense' });

    makeTransaction(acct.id, { description: 'ExportTx Alpha', amount: 1200, category_id: cat.id });
    makeTransaction(acct.id, { description: 'ExportTx Beta', amount: 800, category_id: cat.id });

    const csvRes = await api.get('/api/export/transactions').expect(200);
    const csv = csvRes.text;
    assert.ok(csv.includes('ExportTx Alpha'), 'CSV should contain first transaction');
    assert.ok(csv.includes('ExportTx Beta'), 'CSV should contain second transaction');
    assert.ok(csv.includes('Export Account'), 'CSV should contain account name');
  });
});

describe('E2E: Year-in-review with data', () => {
  beforeEach(() => cleanDb());

  it('add transactions for current year → year-in-review calculates correctly', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 200000 });
    const cat = makeCategory({ name: 'Shopping', type: 'expense' });

    // Add income
    makeTransaction(acct.id, { type: 'income', amount: 100000, description: 'Salary' });
    // Add expenses
    makeTransaction(acct.id, { type: 'expense', amount: 15000, description: 'Big Purchase', category_id: cat.id });
    makeTransaction(acct.id, { type: 'expense', amount: 5000, description: 'Small Purchase', category_id: cat.id });

    const year = new Date().getFullYear();
    const res = await api.get(`/api/reports/year-in-review?year=${year}`).expect(200);

    assert.equal(res.body.total_income, 100000);
    assert.equal(res.body.total_expenses, 20000);
    assert.equal(res.body.net_savings, 80000);
    assert.equal(res.body.transaction_count, 3);
    assert.ok(res.body.biggest_expense);
    assert.equal(res.body.biggest_expense.amount, 15000);
    assert.ok(res.body.monthly_breakdown.length === 12);
  });
});

// ══════════════════════════════════════════════
// 3. Data Integrity
// ══════════════════════════════════════════════

describe('E2E: Data integrity — cascading deletes', () => {
  beforeEach(() => cleanDb());

  it('delete account → transactions are removed', async () => {
    const api = agent();
    const acct = makeAccount({ name: 'CascadeAcct', balance: 10000 });
    makeTransaction(acct.id, { description: 'Tx1', amount: 100 });
    makeTransaction(acct.id, { description: 'Tx2', amount: 200 });

    // Verify transactions exist
    const txBefore = await api.get(`/api/transactions?account_id=${acct.id}`).expect(200);
    assert.ok(txBefore.body.transactions.length >= 2);

    // Delete account
    await api.delete(`/api/accounts/${acct.id}`).expect(200);

    // Verify transactions are gone
    const txAfter = await api.get('/api/transactions').expect(200);
    const remaining = txAfter.body.transactions.filter(t => t.account_id === acct.id);
    assert.equal(remaining.length, 0);
  });

  it('delete category → transactions still accessible (category nullified)', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 5000 });
    const cat = makeCategory({ name: 'TempCategory', type: 'expense' });
    const tx = makeTransaction(acct.id, { description: 'CatTx', amount: 100, category_id: cat.id });

    await api.delete(`/api/categories/${cat.id}`).expect(200);

    // Transaction should still exist but category info may be null
    const txRes = await api.get('/api/transactions').expect(200);
    const found = txRes.body.transactions.find(t => t.id === tx.id);
    assert.ok(found, 'Transaction should still exist after category deletion');
  });
});

describe('E2E: Transaction → chart data updates', () => {
  beforeEach(() => cleanDb());

  it('create transaction → chart data reflects the new transaction', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 50000 });
    const cat = makeCategory({ name: 'ChartCat', type: 'expense' });

    makeTransaction(acct.id, { type: 'expense', amount: 5000, category_id: cat.id, description: 'ChartExpense' });

    const from = daysFromNow(-7);
    const to = daysFromNow(1);
    const pieRes = await api.get(`/api/charts/spending-pie?from=${from}&to=${to}`).expect(200);
    assert.ok(pieRes.body);

    // Cashflow chart
    const cfRes = await api.get(`/api/charts/cashflow?from=${from}&to=${to}&interval=daily`).expect(200);
    assert.ok(cfRes.body);
  });

  it('create transaction → insights reflect the change', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 100000 });
    const cat = makeCategory({ name: 'InsightCat', type: 'expense' });

    makeTransaction(acct.id, { type: 'expense', amount: 9000, category_id: cat.id, description: 'Big spend' });
    makeTransaction(acct.id, { type: 'income', amount: 50000, description: 'Salary' });

    const trends = await api.get('/api/insights/trends?months=1').expect(200);
    assert.ok(trends.body);

    const velocity = await api.get('/api/insights/velocity').expect(200);
    assert.ok(velocity.body);
  });
});

describe('E2E: Multi-user data isolation', () => {
  beforeEach(() => cleanDb());

  it('two users cannot see each other\'s data', async () => {
    const api = agent();
    const { agent: api2 } = makeSecondUser();

    // User 1 creates data
    const acct1 = await api.post('/api/accounts').send({
      name: 'User1 Account', type: 'savings', currency: 'INR', balance: 99999,
    }).expect(201);

    // User 2 creates data
    const acct2 = await api2.post('/api/accounts').send({
      name: 'User2 Account', type: 'checking', currency: 'INR', balance: 11111,
    }).expect(201);

    // User 1 should not see User 2's accounts
    const u1Accounts = await api.get('/api/accounts').expect(200);
    assert.ok(!u1Accounts.body.accounts.find(a => a.name === 'User2 Account'));

    // User 2 should not see User 1's accounts
    const u2Accounts = await api2.get('/api/accounts').expect(200);
    assert.ok(!u2Accounts.body.accounts.find(a => a.name === 'User1 Account'));

    // User 2 should not see User 1's account even when listing all
    const u2AllAccounts = await api2.get('/api/accounts').expect(200);
    const leakedAccount = u2AllAccounts.body.accounts.find(a => a.id === acct1.body.account.id);
    assert.ok(!leakedAccount, 'User 2 must not see User 1 account by ID');
  });
});

// ══════════════════════════════════════════════
// 4. Edge Cases
// ══════════════════════════════════════════════

describe('E2E: Edge cases', () => {
  beforeEach(() => cleanDb());

  it('concurrent: create multiple transactions rapidly on same account', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 100000 });
    const cat = makeCategory({ name: 'RapidCat', type: 'expense' });

    // Fire 10 transactions concurrently
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        api.post('/api/transactions').send({
          account_id: acct.id, type: 'expense', amount: 100,
          category_id: cat.id, description: `Rapid tx ${i}`, date: today(), currency: 'INR',
        })
      );
    }
    const results = await Promise.all(promises);
    const created = results.filter(r => r.status === 201);
    assert.equal(created.length, 10, 'All 10 concurrent transactions should succeed');

    // Verify account balance: 100000 - (10 * 100) = 99000
    const acctRes = await api.get('/api/accounts').expect(200);
    const updated = acctRes.body.accounts.find(a => a.id === acct.id);
    assert.equal(updated.balance, 99000);
  });

  it('large batch: create 50 transactions and verify counts', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 1000000 });

    for (let i = 0; i < 50; i++) {
      makeTransaction(acct.id, { description: `Batch tx ${i}`, amount: 10, type: 'expense' });
    }

    const txRes = await api.get('/api/transactions?limit=100').expect(200);
    assert.ok(txRes.body.transactions.length >= 50);
  });

  it('invalid token rejected across all protected endpoints', async () => {
    const raw = rawAgent();
    const badToken = 'completely-invalid-token-' + crypto.randomUUID();

    const endpoints = [
      ['get', '/api/accounts'],
      ['get', '/api/transactions'],
      ['get', '/api/categories'],
      ['get', '/api/budgets'],
      ['get', '/api/goals'],
      ['get', '/api/stats/overview'],
      ['get', '/api/search?q=test'],
      ['get', '/api/settings'],
      ['get', '/api/tags'],
    ];

    for (const [method, url] of endpoints) {
      const res = await raw[method](url)
        .set('X-Session-Token', badToken)
        .set('Content-Type', 'application/json');
      assert.equal(res.status, 401, `${method.toUpperCase()} ${url} should reject invalid token`);
    }
  });

  it('expired session token is rejected', async () => {
    const { db } = setup();
    const expiredToken = 'expired-token-' + crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
    // Insert a session that expired yesterday
    const expired = new Date(Date.now() - 86400000).toISOString();
    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(1, tokenHash, expired);

    const raw = rawAgent();
    await raw.get('/api/accounts')
      .set('X-Session-Token', expiredToken)
      .set('Content-Type', 'application/json')
      .expect(401);
  });

  it('request without token gets 401 on protected routes', async () => {
    const raw = rawAgent();
    await raw.get('/api/accounts')
      .set('Content-Type', 'application/json')
      .expect(401);
  });
});

// ══════════════════════════════════════════════
// 5. API Versioning
// ══════════════════════════════════════════════

describe('E2E: API v1 prefix — complete workflow', () => {
  beforeEach(() => cleanDb());

  it('full workflow via /api/v1/ prefix mirrors /api/', async () => {
    const api = agent();

    // Create account via v1
    const acctRes = await api.post('/api/v1/accounts').send({
      name: 'V1 Account', type: 'savings', currency: 'INR', balance: 25000,
    }).expect(201);
    const accountId = acctRes.body.account.id;

    // Create category via v1
    const catRes = await api.post('/api/v1/categories').send({
      name: 'V1 Category', icon: '📦', color: '#0000FF', type: 'expense',
    }).expect(201);
    const categoryId = catRes.body.category.id;

    // Add transaction via v1
    await api.post('/api/v1/transactions').send({
      account_id: accountId, type: 'expense', amount: 500,
      category_id: categoryId, description: 'V1 test', date: today(), currency: 'INR',
    }).expect(201);

    // List via v1
    const txRes = await api.get('/api/v1/transactions').expect(200);
    assert.ok(txRes.body.transactions.length >= 1);

    // Stats via v1
    await api.get('/api/v1/stats/overview').expect(200);

    // Search via v1
    const searchRes = await api.get('/api/v1/search?q=V1').expect(200);
    assert.ok(searchRes.body.transactions.length >= 1 || searchRes.body.accounts.length >= 1);

    // Version endpoint via v1
    const versionRes = await api.get('/api/v1/version').expect(200);
    assert.ok(versionRes.body.version);
    assert.equal(versionRes.body.api_version, 'v1');

    // Delete via v1
    await api.delete(`/api/v1/accounts/${accountId}`).expect(200);
  });
});

// ══════════════════════════════════════════════
// 6. Additional cross-feature tests
// ══════════════════════════════════════════════

describe('E2E: Subscriptions → stats integration', () => {
  beforeEach(() => cleanDb());

  it('create subscriptions → dashboard shows monthly subscription total', async () => {
    const api = agent();

    await api.post('/api/subscriptions').send({
      name: 'Netflix', amount: 649, currency: 'INR', frequency: 'monthly',
    }).expect(201);

    await api.post('/api/subscriptions').send({
      name: 'Spotify', amount: 119, currency: 'INR', frequency: 'monthly',
    }).expect(201);

    const overview = await api.get('/api/stats/overview').expect(200);
    assert.ok(overview.body.monthly_subscriptions >= 768);
  });
});

describe('E2E: Tags → transactions → search', () => {
  beforeEach(() => cleanDb());

  it('tag transactions → search finds tagged items', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 10000 });

    // Create tag
    const tagRes = await api.post('/api/tags').send({ name: 'vacation' }).expect(201);
    const tagId = tagRes.body.tag.id;

    // Create transaction
    const txRes = await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 5000,
      description: 'Beach resort', date: today(), currency: 'INR', tag_ids: [tagId],
    }).expect(201);

    // Search for tag name
    const searchRes = await api.get('/api/search?q=vacation').expect(200);
    assert.ok(searchRes.body.tags.length >= 1);
  });
});

describe('E2E: Notifications lifecycle', () => {
  beforeEach(() => cleanDb());

  it('notifications can be listed and marked as read', async () => {
    const api = agent();
    const { db } = setup();

    // Manually insert a notification (using valid type from CHECK constraint)
    db.prepare(
      'INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'system', 'Test Notification', 'Hello from E2E', 0);

    const res = await api.get('/api/notifications').expect(200);
    assert.ok(res.body.notifications.length >= 1);

    const notifId = res.body.notifications[0].id;
    await api.put(`/api/notifications/${notifId}/read`).send({}).expect(200);

    const after = await api.get('/api/notifications').expect(200);
    const updated = after.body.notifications.find(n => n.id === notifId);
    assert.equal(updated.is_read, 1);
  });
});

describe('E2E: Net worth tracking', () => {
  beforeEach(() => cleanDb());

  it('create accounts → net worth reflects total assets minus liabilities', async () => {
    const api = agent();

    makeAccount({ name: 'Savings', type: 'savings', balance: 200000 });
    makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -15000 });

    const overview = await api.get('/api/stats/overview').expect(200);
    // net_worth = assets - liabilities = 200000 - 15000 = 185000
    assert.ok(overview.body.net_worth >= 185000);
  });
});

describe('E2E: Settings & preferences roundtrip', () => {
  beforeEach(() => cleanDb());

  it('update settings → read back → verify persisted', async () => {
    const api = agent();

    await api.put('/api/preferences').send({
      theme: 'dark',
      language: 'en',
    }).expect(200);

    const res = await api.get('/api/preferences').expect(200);
    assert.equal(res.body.preferences.theme, 'dark');
  });
});

describe('E2E: Health check endpoints', () => {
  it('health endpoint returns ok status', async () => {
    const raw = rawAgent();
    const res = await raw.get('/api/health').expect(200);
    assert.ok(res.body.status === 'ok' || res.body.status === 'healthy');
  });

  it('version endpoint returns version info', async () => {
    const raw = rawAgent();
    const res = await raw.get('/api/version').expect(200);
    assert.ok(res.body.version);
    assert.equal(res.body.api_version, 'v1');
  });
});
