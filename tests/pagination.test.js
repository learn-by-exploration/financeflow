const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

// ─── Helpers unique to this test file ───
let db;
function makeBudget(overrides = {}) {
  const o = { name: 'Budget', period: 'monthly', start_date: '2026-03-01', end_date: '2026-03-31', is_active: 1, ...overrides };
  const r = db.prepare('INSERT INTO budgets (user_id, name, period, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)').run(1, o.name, o.period, o.start_date, o.end_date, o.is_active);
  return db.prepare('SELECT * FROM budgets WHERE id = ?').get(r.lastInsertRowid);
}

function makeGoal(overrides = {}) {
  const o = { name: 'Goal', target_amount: 100000, current_amount: 0, currency: 'INR', icon: '🎯', color: '#22C55E', position: 0, is_completed: 0, ...overrides };
  const r = db.prepare('INSERT INTO savings_goals (user_id, name, target_amount, current_amount, currency, icon, color, deadline, is_completed, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(1, o.name, o.target_amount, o.current_amount, o.currency, o.icon, o.color, o.deadline || null, o.is_completed, o.position);
  return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(r.lastInsertRowid);
}

function makeSubscription(overrides = {}) {
  const o = { name: 'Sub', amount: 199, currency: 'INR', frequency: 'monthly', is_active: 1, ...overrides };
  const r = db.prepare('INSERT INTO subscriptions (user_id, name, amount, currency, frequency, is_active) VALUES (?, ?, ?, ?, ?, ?)').run(1, o.name, o.amount, o.currency, o.frequency, o.is_active);
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(r.lastInsertRowid);
}

function makeRecurringRule(accountId, overrides = {}) {
  const o = { type: 'expense', amount: 5000, currency: 'INR', description: 'Rent', frequency: 'monthly', next_date: '2026-04-01', is_active: 1, ...overrides };
  const r = db.prepare('INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, currency, description, frequency, next_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(1, accountId, o.category_id || null, o.type, o.amount, o.currency, o.description, o.frequency, o.next_date, o.is_active);
  return db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(r.lastInsertRowid);
}

function makeTag(overrides = {}) {
  const o = { name: 'tag-' + Date.now() + Math.random(), color: '#000', ...overrides };
  const r = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(1, o.name, o.color);
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(r.lastInsertRowid);
}

before(() => {
  const s = setup();
  db = s.db;
});
after(() => teardown());
beforeEach(() => cleanDb());

// ────────────────────────────────────────────
// Response-format helper
// ────────────────────────────────────────────
function assertPaginatedResponse(body, collectionKey, expectedLength, expectedTotal, limit = 50, offset = 0) {
  assert.ok(Array.isArray(body[collectionKey]), `body.${collectionKey} should be an array`);
  assert.equal(body[collectionKey].length, expectedLength, `${collectionKey}.length`);
  assert.equal(body.total, expectedTotal, 'total');
  assert.equal(body.limit, limit, 'limit');
  assert.equal(body.offset, offset, 'offset');
}

// ════════════════════════════════════════════
// ACCOUNTS
// ════════════════════════════════════════════
describe('GET /api/accounts — pagination & filtering', () => {
  it('returns paginated response with defaults', async () => {
    makeAccount({ name: 'A1' });
    makeAccount({ name: 'A2' });
    const res = await agent().get('/api/accounts').expect(200);
    assertPaginatedResponse(res.body, 'accounts', 2, 2);
  });

  it('respects custom limit and offset', async () => {
    for (let i = 0; i < 5; i++) makeAccount({ name: `A${i}`, position: i });
    const res = await agent().get('/api/accounts?limit=2&offset=2').expect(200);
    assertPaginatedResponse(res.body, 'accounts', 2, 5, 2, 2);
  });

  it('offset beyond total returns empty array with correct total', async () => {
    makeAccount({ name: 'A1' });
    const res = await agent().get('/api/accounts?offset=100').expect(200);
    assertPaginatedResponse(res.body, 'accounts', 0, 1, 50, 100);
  });

  it('filters by type', async () => {
    makeAccount({ name: 'Check', type: 'checking' });
    makeAccount({ name: 'Save', type: 'savings' });
    const res = await agent().get('/api/accounts?type=savings').expect(200);
    assertPaginatedResponse(res.body, 'accounts', 1, 1);
    assert.equal(res.body.accounts[0].type, 'savings');
  });

  it('filters by is_active', async () => {
    makeAccount({ name: 'Active', is_active: 1 });
    makeAccount({ name: 'Inactive', is_active: 0 });
    const res = await agent().get('/api/accounts?is_active=0').expect(200);
    assertPaginatedResponse(res.body, 'accounts', 1, 1);
    assert.equal(res.body.accounts[0].is_active, 0);
  });
});

// ════════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════════
describe('GET /api/categories — pagination & filtering', () => {
  it('returns paginated response with defaults', async () => {
    makeCategory({ name: 'C1', type: 'expense' });
    makeCategory({ name: 'C2', type: 'income' });
    const res = await agent().get('/api/categories').expect(200);
    assertPaginatedResponse(res.body, 'categories', 2, 2);
  });

  it('respects custom limit and offset', async () => {
    for (let i = 0; i < 4; i++) makeCategory({ name: `C${i}`, type: 'expense' });
    const res = await agent().get('/api/categories?limit=2&offset=1').expect(200);
    assertPaginatedResponse(res.body, 'categories', 2, 4, 2, 1);
  });

  it('filters by type', async () => {
    makeCategory({ name: 'Salary', type: 'income' });
    makeCategory({ name: 'Food', type: 'expense' });
    const res = await agent().get('/api/categories?type=income').expect(200);
    assertPaginatedResponse(res.body, 'categories', 1, 1);
    assert.equal(res.body.categories[0].type, 'income');
  });

  it('offset beyond total returns empty array', async () => {
    makeCategory({ name: 'C1', type: 'expense' });
    const res = await agent().get('/api/categories?offset=999').expect(200);
    assertPaginatedResponse(res.body, 'categories', 0, 1, 50, 999);
  });
});

// ════════════════════════════════════════════
// BUDGETS
// ════════════════════════════════════════════
describe('GET /api/budgets — pagination & filtering', () => {
  it('returns paginated response with defaults', async () => {
    makeBudget({ name: 'B1' });
    makeBudget({ name: 'B2' });
    const res = await agent().get('/api/budgets').expect(200);
    assertPaginatedResponse(res.body, 'budgets', 2, 2);
  });

  it('respects custom limit and offset', async () => {
    for (let i = 0; i < 5; i++) makeBudget({ name: `B${i}` });
    const res = await agent().get('/api/budgets?limit=3&offset=2').expect(200);
    assertPaginatedResponse(res.body, 'budgets', 3, 5, 3, 2);
  });

  it('filters by period', async () => {
    makeBudget({ name: 'Monthly', period: 'monthly' });
    makeBudget({ name: 'Weekly', period: 'weekly' });
    const res = await agent().get('/api/budgets?period=weekly').expect(200);
    assertPaginatedResponse(res.body, 'budgets', 1, 1);
    assert.equal(res.body.budgets[0].period, 'weekly');
  });

  it('filters by is_active', async () => {
    makeBudget({ name: 'Active', is_active: 1 });
    makeBudget({ name: 'Inactive', is_active: 0 });
    const res = await agent().get('/api/budgets?is_active=1').expect(200);
    assertPaginatedResponse(res.body, 'budgets', 1, 1);
    assert.equal(res.body.budgets[0].is_active, 1);
  });
});

// ════════════════════════════════════════════
// GOALS
// ════════════════════════════════════════════
describe('GET /api/goals — pagination & filtering', () => {
  it('returns paginated response with defaults', async () => {
    makeGoal({ name: 'G1' });
    makeGoal({ name: 'G2' });
    const res = await agent().get('/api/goals').expect(200);
    assertPaginatedResponse(res.body, 'goals', 2, 2);
  });

  it('respects custom limit and offset', async () => {
    for (let i = 0; i < 4; i++) makeGoal({ name: `G${i}`, position: i });
    const res = await agent().get('/api/goals?limit=2&offset=1').expect(200);
    assertPaginatedResponse(res.body, 'goals', 2, 4, 2, 1);
  });

  it('filters by status=active (not completed)', async () => {
    makeGoal({ name: 'Active', is_completed: 0 });
    makeGoal({ name: 'Done', is_completed: 1 });
    const res = await agent().get('/api/goals?status=active').expect(200);
    assertPaginatedResponse(res.body, 'goals', 1, 1);
    assert.equal(res.body.goals[0].is_completed, 0);
  });

  it('filters by status=completed', async () => {
    makeGoal({ name: 'Active', is_completed: 0 });
    makeGoal({ name: 'Done', is_completed: 1 });
    const res = await agent().get('/api/goals?status=completed').expect(200);
    assertPaginatedResponse(res.body, 'goals', 1, 1);
    assert.equal(res.body.goals[0].is_completed, 1);
  });

  it('offset beyond total returns empty array', async () => {
    makeGoal({ name: 'G1' });
    const res = await agent().get('/api/goals?offset=100').expect(200);
    assertPaginatedResponse(res.body, 'goals', 0, 1, 50, 100);
  });
});

// ════════════════════════════════════════════
// SUBSCRIPTIONS
// ════════════════════════════════════════════
describe('GET /api/subscriptions — pagination & filtering', () => {
  it('returns paginated response with defaults', async () => {
    makeSubscription({ name: 'S1' });
    makeSubscription({ name: 'S2' });
    const res = await agent().get('/api/subscriptions').expect(200);
    assertPaginatedResponse(res.body, 'subscriptions', 2, 2);
    assert.equal(typeof res.body.total_monthly, 'number');
  });

  it('respects custom limit and offset', async () => {
    for (let i = 0; i < 5; i++) makeSubscription({ name: `S${i}` });
    const res = await agent().get('/api/subscriptions?limit=2&offset=1').expect(200);
    assertPaginatedResponse(res.body, 'subscriptions', 2, 5, 2, 1);
  });

  it('filters by frequency', async () => {
    makeSubscription({ name: 'Monthly', frequency: 'monthly' });
    makeSubscription({ name: 'Yearly', frequency: 'yearly' });
    const res = await agent().get('/api/subscriptions?frequency=yearly').expect(200);
    assertPaginatedResponse(res.body, 'subscriptions', 1, 1);
    assert.equal(res.body.subscriptions[0].frequency, 'yearly');
  });

  it('filters by is_active', async () => {
    makeSubscription({ name: 'Active', is_active: 1 });
    makeSubscription({ name: 'Cancelled', is_active: 0 });
    const res = await agent().get('/api/subscriptions?is_active=0').expect(200);
    assertPaginatedResponse(res.body, 'subscriptions', 1, 1);
    assert.equal(res.body.subscriptions[0].is_active, 0);
  });
});

// ════════════════════════════════════════════
// RECURRING RULES
// ════════════════════════════════════════════
describe('GET /api/recurring — pagination & filtering', () => {
  let acct;
  beforeEach(() => { acct = makeAccount({ name: 'Main' }); });

  it('returns paginated response with defaults', async () => {
    makeRecurringRule(acct.id, { description: 'R1' });
    makeRecurringRule(acct.id, { description: 'R2' });
    const res = await agent().get('/api/recurring').expect(200);
    assertPaginatedResponse(res.body, 'rules', 2, 2);
  });

  it('respects custom limit and offset', async () => {
    for (let i = 0; i < 5; i++) makeRecurringRule(acct.id, { description: `R${i}` });
    const res = await agent().get('/api/recurring?limit=2&offset=3').expect(200);
    assertPaginatedResponse(res.body, 'rules', 2, 5, 2, 3);
  });

  it('filters by frequency', async () => {
    makeRecurringRule(acct.id, { description: 'Monthly', frequency: 'monthly' });
    makeRecurringRule(acct.id, { description: 'Weekly', frequency: 'weekly' });
    const res = await agent().get('/api/recurring?frequency=weekly').expect(200);
    assertPaginatedResponse(res.body, 'rules', 1, 1);
    assert.equal(res.body.rules[0].frequency, 'weekly');
  });

  it('filters by is_active', async () => {
    makeRecurringRule(acct.id, { description: 'Active', is_active: 1 });
    makeRecurringRule(acct.id, { description: 'Off', is_active: 0 });
    const res = await agent().get('/api/recurring?is_active=1').expect(200);
    assertPaginatedResponse(res.body, 'rules', 1, 1);
    assert.equal(res.body.rules[0].is_active, 1);
  });

  it('filters by type', async () => {
    makeRecurringRule(acct.id, { description: 'Income', type: 'income' });
    makeRecurringRule(acct.id, { description: 'Expense', type: 'expense' });
    const res = await agent().get('/api/recurring?type=income').expect(200);
    assertPaginatedResponse(res.body, 'rules', 1, 1);
    assert.equal(res.body.rules[0].type, 'income');
  });
});

// ════════════════════════════════════════════
// TAGS
// ════════════════════════════════════════════
describe('GET /api/tags — pagination', () => {
  it('returns paginated response with defaults', async () => {
    makeTag({ name: 'T1' });
    makeTag({ name: 'T2' });
    const res = await agent().get('/api/tags').expect(200);
    assertPaginatedResponse(res.body, 'tags', 2, 2);
  });

  it('respects custom limit and offset', async () => {
    for (let i = 0; i < 5; i++) makeTag({ name: `Tag${i}` });
    const res = await agent().get('/api/tags?limit=3&offset=2').expect(200);
    assertPaginatedResponse(res.body, 'tags', 3, 5, 3, 2);
  });

  it('offset beyond total returns empty array', async () => {
    makeTag({ name: 'T1' });
    const res = await agent().get('/api/tags?offset=50').expect(200);
    assertPaginatedResponse(res.body, 'tags', 0, 1, 50, 50);
  });
});

// ════════════════════════════════════════════
// TRANSACTIONS — ensure consistency
// ════════════════════════════════════════════
describe('GET /api/transactions — pagination consistency', () => {
  it('returns consistent paginated response format', async () => {
    const acct = makeAccount({ name: 'Chk' });
    makeTransaction(acct.id, { description: 'Tx1' });
    makeTransaction(acct.id, { description: 'Tx2' });
    const res = await agent().get('/api/transactions').expect(200);
    assertPaginatedResponse(res.body, 'transactions', 2, 2);
  });

  it('respects custom limit/offset and returns total', async () => {
    const acct = makeAccount({ name: 'Chk' });
    for (let i = 0; i < 5; i++) makeTransaction(acct.id, { description: `Tx${i}` });
    const res = await agent().get('/api/transactions?limit=2&offset=1').expect(200);
    assertPaginatedResponse(res.body, 'transactions', 2, 5, 2, 1);
  });

  it('total reflects filters', async () => {
    const acct = makeAccount({ name: 'Chk' });
    makeTransaction(acct.id, { description: 'Income', type: 'income', amount: 1000 });
    makeTransaction(acct.id, { description: 'Expense', type: 'expense', amount: 50 });
    makeTransaction(acct.id, { description: 'Expense2', type: 'expense', amount: 75 });
    const res = await agent().get('/api/transactions?type=expense').expect(200);
    assertPaginatedResponse(res.body, 'transactions', 2, 2);
  });
});
