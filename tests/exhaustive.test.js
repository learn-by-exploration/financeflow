// PersonalFi — Exhaustive Edge Case & Journey Tests
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeGoal, makeSubscription, makeBudget, makeGroup, makeGroupMember, makeSharedExpense, makeSecondUser } = require('./helpers');

before(() => setup());
after(() => teardown());

// ─── Journey: Full user lifecycle ───
describe('Journey: new user lifecycle', () => {
  const username = 'journey_user_' + Date.now();
  let token;
  let accountId, categoryId;

  it('registers a new user', async () => {
    const res = await agent().post('/api/auth/register')
      .send({ username, password: 'StrongP@ss1!', display_name: 'Journey User' })
      .expect(201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.username, username);
    token = res.body.token;
  });

  it('seeded categories on registration', async () => {
    const res = await agent().get('/api/categories').set('X-Session-Token', token).expect(200);
    assert.ok(res.body.categories.length > 0, 'should have seeded categories');
    const systemCats = res.body.categories.filter(c => c.is_system);
    assert.ok(systemCats.length > 0, 'should have system categories');
    categoryId = res.body.categories[0].id;
  });

  it('creates an account', async () => {
    const res = await agent().post('/api/accounts').set('X-Session-Token', token)
      .send({ name: 'My Savings', type: 'savings', balance: 100000 })
      .expect(201);
    accountId = res.body.account.id;
    assert.equal(res.body.account.name, 'My Savings');
  });

  it('adds transaction and updates balance', async () => {
    await agent().post('/api/transactions').set('X-Session-Token', token)
      .send({ account_id: accountId, type: 'expense', amount: 500, description: 'Groceries', date: '2026-03-15', category_id: categoryId })
      .expect(201);

    const acct = await agent().get('/api/accounts').set('X-Session-Token', token).expect(200);
    assert.equal(acct.body.accounts[0].balance, 99500);
  });

  it('creates a budget and views summary', async () => {
    const res = await agent().post('/api/budgets').set('X-Session-Token', token)
      .send({ name: 'March Budget', period: 'monthly', start_date: '2026-03-01', end_date: '2026-03-31', items: [{ category_id: categoryId, amount: 10000 }] })
      .expect(201);
    const summary = await agent().get(`/api/budgets/${res.body.id}/summary`).set('X-Session-Token', token).expect(200);
    assert.ok(summary.body.total_allocated > 0);
  });

  it('creates a goal and contributes', async () => {
    const goal = await agent().post('/api/goals').set('X-Session-Token', token)
      .send({ name: 'Emergency Fund', target_amount: 50000 })
      .expect(201);
    const updated = await agent().put(`/api/goals/${goal.body.goal.id}`).set('X-Session-Token', token)
      .send({ current_amount: 50000 })
      .expect(200);
    assert.equal(updated.body.goal.is_completed, 1, 'should auto-complete when target reached');
  });

  it('views dashboard stats', async () => {
    const res = await agent().get('/api/stats/overview').set('X-Session-Token', token).expect(200);
    assert.ok('net_worth' in res.body);
    assert.ok('month_income' in res.body);
  });

  it('exports and basic data check', async () => {
    const res = await agent().get('/api/data/export').set('X-Session-Token', token).expect(200);
    assert.ok(res.body.accounts.length > 0);
    assert.ok(res.body.categories.length > 0);
    assert.ok(res.body.transactions.length > 0);
  });

  it('logs out', async () => {
    await agent().post('/api/auth/logout').set('X-Session-Token', token).expect(200);
    await agent().get('/api/accounts').set('X-Session-Token', token).expect(401);
  });
});

// ─── Edge cases: Accounts ───
describe('Edge: accounts', () => {
  beforeEach(() => cleanDb());

  it('rejects empty account name', async () => {
    await agent().post('/api/accounts').send({ name: '' }).expect(400);
  });

  it('rejects missing account name', async () => {
    await agent().post('/api/accounts').send({ type: 'checking' }).expect(400);
  });

  it('returns 404 for non-existent account update', async () => {
    await agent().put('/api/accounts/999999').send({ name: 'Updated' }).expect(404);
  });

  it('handles negative balance accounts', async () => {
    const res = await agent().post('/api/accounts')
      .send({ name: 'Credit Card', type: 'credit_card', balance: -15000 })
      .expect(201);
    assert.equal(res.body.account.balance, -15000);
  });

  it('defaults icon and color', async () => {
    const res = await agent().post('/api/accounts').send({ name: 'Minimal', type: 'checking' }).expect(201);
    assert.equal(res.body.account.icon, '🏦');
    assert.ok(res.body.account.color);
  });
});

// ─── Edge cases: Transactions ───
describe('Edge: transactions', () => {
  let accountId, account2Id, categoryId;

  beforeEach(() => {
    cleanDb();
    const acct = makeAccount();
    const acct2 = makeAccount({ name: 'Savings', type: 'savings', balance: 20000 });
    const cat = makeCategory();
    accountId = acct.id;
    account2Id = acct2.id;
    categoryId = cat.id;
  });

  it('rejects transaction with zero amount', async () => {
    await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'expense', amount: 0, description: 'Zero', date: '2026-03-15' })
      .expect(400);
  });

  it('rejects transaction with negative amount', async () => {
    await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'expense', amount: -100, description: 'Negative', date: '2026-03-15' })
      .expect(400);
  });

  it('rejects missing description', async () => {
    await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'expense', amount: 100, date: '2026-03-15' })
      .expect(400);
  });

  it('rejects missing date', async () => {
    await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'expense', amount: 100, description: 'Test' })
      .expect(400);
  });

  it('rejects invalid transaction type', async () => {
    await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'refund', amount: 100, description: 'Test', date: '2026-03-15' })
      .expect(400);
  });

  it('rejects transfer to same account', async () => {
    await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'transfer', amount: 1000, description: 'Self transfer', date: '2026-03-15', transfer_to_account_id: accountId })
      .expect(400);
  });

  it('rejects transfer without destination', async () => {
    await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'transfer', amount: 1000, description: 'No dest', date: '2026-03-15' })
      .expect(400);
  });

  it('handles transfer correctly (double-entry)', async () => {
    const res = await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'transfer', amount: 5000, description: 'To savings', date: '2026-03-15', transfer_to_account_id: account2Id })
      .expect(201);

    const { db } = setup();
    const src = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accountId);
    const dst = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account2Id);
    assert.equal(src.balance, 45000); // 50000 - 5000
    assert.equal(dst.balance, 25000); // 20000 + 5000
  });

  it('auto-categorizes with matching rule', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, 0)')
      .run(1, 'swiggy|zomato', categoryId);

    const res = await agent().post('/api/transactions')
      .send({ account_id: accountId, type: 'expense', amount: 350, description: 'Swiggy dinner order', date: '2026-03-15' })
      .expect(201);
    assert.equal(res.body.transaction.category_id, categoryId);
  });

  it('filter and pagination combined', async () => {
    for (let i = 0; i < 25; i++) {
      makeTransaction(accountId, { description: `Txn ${i}`, amount: 100 + i, date: '2026-03-15' });
    }
    const page1 = await agent().get('/api/transactions?limit=10&offset=0').expect(200);
    assert.equal(page1.body.transactions.length, 10);
    assert.ok(page1.body.total >= 25);

    const page3 = await agent().get('/api/transactions?limit=10&offset=20').expect(200);
    assert.ok(page3.body.transactions.length >= 5);
  });

  it('search filter works case-insensitively', async () => {
    makeTransaction(accountId, { description: 'UBER Ride to airport' });
    makeTransaction(accountId, { description: 'Grocery shopping' });

    const res = await agent().get('/api/transactions?search=uber').expect(200);
    assert.ok(res.body.transactions.some(t => t.description.includes('UBER')));
  });
});

// ─── Edge cases: Budgets ───
describe('Edge: budgets', () => {
  beforeEach(() => cleanDb());

  it('rejects budget without name', async () => {
    await agent().post('/api/budgets').send({ period: 'monthly' }).expect(400);
  });

  it('rejects invalid period', async () => {
    await agent().post('/api/budgets').send({ name: 'Test', period: 'biweekly' }).expect(400);
  });

  it('budget summary with no items returns zeros', async () => {
    const budget = makeBudget({ items: [] });
    const res = await agent().get(`/api/budgets/${budget.id}/summary`).expect(200);
    assert.equal(res.body.total_allocated, 0);
    assert.equal(res.body.total_spent, 0);
  });
});

// ─── Edge cases: Goals ───
describe('Edge: goals', () => {
  beforeEach(() => cleanDb());

  it('rejects goal with zero target', async () => {
    await agent().post('/api/goals').send({ name: 'Zero', target_amount: 0 }).expect(400);
  });

  it('rejects goal with negative target', async () => {
    await agent().post('/api/goals').send({ name: 'Negative', target_amount: -100 }).expect(400);
  });

  it('auto-completes goal on exceeding target', async () => {
    const goal = makeGoal({ target_amount: 1000, current_amount: 500 });
    const res = await agent().put(`/api/goals/${goal.id}`).send({ current_amount: 1500 }).expect(200);
    assert.equal(res.body.goal.is_completed, 1);
  });
});

// ─── Edge cases: Subscriptions ───
describe('Edge: subscriptions', () => {
  beforeEach(() => cleanDb());

  it('rejects missing subscription name', async () => {
    await agent().post('/api/subscriptions').send({ amount: 199, frequency: 'monthly' }).expect(400);
  });

  it('rejects invalid frequency', async () => {
    await agent().post('/api/subscriptions').send({ name: 'Test', amount: 199, frequency: 'bimonthly' }).expect(400);
  });

  it('total_monthly normalizes all frequencies', async () => {
    makeSubscription({ name: 'Weekly', amount: 100, frequency: 'weekly' });
    makeSubscription({ name: 'Monthly', amount: 500, frequency: 'monthly' });
    makeSubscription({ name: 'Yearly', amount: 12000, frequency: 'yearly' });

    const res = await agent().get('/api/subscriptions').expect(200);
    // Weekly: 100*4.33=433, Monthly: 500, Yearly: 12000/12=1000 → total ~1933
    assert.ok(res.body.total_monthly > 1900);
    assert.ok(res.body.total_monthly < 2000);
  });

  it('toggle active status', async () => {
    const sub = makeSubscription({ is_active: 1 });
    const res = await agent().put(`/api/subscriptions/${sub.id}`).send({ is_active: 0 }).expect(200);
    assert.equal(res.body.subscription.is_active, 0);
  });
});

// ─── Edge cases: Groups & Splits ───
describe('Edge: groups & splits', () => {
  let groupId, ownerMemberId, memberMemberId;

  beforeEach(() => {
    cleanDb();
    const group = makeGroup();
    groupId = group.id;
    const { db } = setup();
    ownerMemberId = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(groupId, 'owner').id;
    const member = makeGroupMember(groupId, { display_name: 'Alice' });
    memberMemberId = member.id;
  });

  it('cannot remove last owner', async () => {
    await agent().delete(`/api/groups/${groupId}/members/${ownerMemberId}`).expect(400);
  });

  it('non-owner cannot delete group', async () => {
    const user2 = makeSecondUser();
    // Add user2 as member
    const { db } = setup();
    db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)').run(groupId, user2.userId, 'User2', 'member');

    await user2.agent.delete(`/api/groups/${groupId}`).expect(403);
  });

  it('split expense auto-creates equal splits', async () => {
    await agent().post(`/api/splits/${groupId}/expenses`)
      .send({ paid_by: ownerMemberId, amount: 1000, description: 'Dinner', date: '2026-03-15' })
      .expect(201);

    const { db } = setup();
    const expense = db.prepare('SELECT * FROM shared_expenses WHERE group_id = ? ORDER BY id DESC').get(groupId);
    const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(expense.id);
    assert.equal(splits.length, 2); // owner + alice
    const total = splits.reduce((s, sp) => s + sp.amount, 0);
    assert.equal(total, 1000);
  });

  it('exact splits must equal total', async () => {
    await agent().post(`/api/splits/${groupId}/expenses`)
      .send({
        paid_by: ownerMemberId, amount: 1000, description: 'Unequal', date: '2026-03-15',
        split_method: 'exact',
        splits: [{ member_id: ownerMemberId, amount: 300 }, { member_id: memberMemberId, amount: 600 }]
      })
      .expect(400); // 300+600=900 != 1000
  });

  it('simplified balances work', async () => {
    makeSharedExpense(groupId, ownerMemberId, { amount: 1000 });
    const res = await agent().get(`/api/splits/${groupId}/balances`).expect(200);
    assert.ok(res.body.balances);
    assert.ok(res.body.simplified_debts);
  });
});

// ─── Edge cases: Rules ───
describe('Edge: rules', () => {
  beforeEach(() => cleanDb());

  it('rejects empty pattern', async () => {
    const cat = makeCategory();
    await agent().post('/api/rules').send({ pattern: '', category_id: cat.id }).expect(400);
  });

  it('rejects rule without category_id', async () => {
    await agent().post('/api/rules').send({ pattern: 'test' }).expect(400);
  });

  it('rejects rule for non-existent category', async () => {
    await agent().post('/api/rules').send({ pattern: 'test', category_id: 999999 }).expect(400);
  });
});

// ─── Multi-user isolation ───
describe('Multi-user data isolation', () => {
  beforeEach(() => cleanDb());

  it('user cannot see another user\'s accounts', async () => {
    makeAccount({ name: 'User1 Account' });
    const user2 = makeSecondUser();
    const res = await user2.agent.get('/api/accounts').expect(200);
    assert.equal(res.body.accounts.length, 0);
  });

  it('user cannot see another user\'s transactions', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { description: 'Secret' });
    const user2 = makeSecondUser();
    const res = await user2.agent.get('/api/transactions').expect(200);
    assert.equal(res.body.transactions.length, 0);
  });

  it('user cannot update another user\'s account', async () => {
    const acct = makeAccount({ name: 'User1 Acct' });
    const user2 = makeSecondUser();
    await user2.agent.put(`/api/accounts/${acct.id}`).send({ name: 'Hacked' }).expect(404);
  });

  it('user cannot delete another user\'s goal', async () => {
    const goal = makeGoal({ name: 'User1 Goal' });
    const user2 = makeSecondUser();
    await user2.agent.delete(`/api/goals/${goal.id}`).expect(404);
  });
});

// ─── Settings edge cases ───
describe('Edge: settings', () => {
  it('rejects invalid settings key', async () => {
    await agent().put('/api/settings').send({ key: 'admin_mode', value: 'true' }).expect(400);
  });

  it('accepts valid settings keys', async () => {
    await agent().put('/api/settings').send({ key: 'default_currency', value: 'USD' }).expect(200);
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.settings.default_currency, 'USD');
  });
});
