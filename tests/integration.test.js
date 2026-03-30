const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeBudget, makeSubscription, makeGoal, makeRecurringRule, today, daysFromNow } = require('./helpers');

// ─── Integration Tests — v0.3.9 ───

before(() => setup());
after(() => teardown());

describe('Integration: Full user lifecycle', () => {
  beforeEach(() => cleanDb());

  it('register → create accounts → add transactions → check balances → view reports → delete account', async () => {
    const api = agent();

    // Create account
    const acctRes = await api.post('/api/accounts').send({
      name: 'Primary Savings', type: 'savings', currency: 'INR', balance: 100000
    }).expect(201);
    const accountId = acctRes.body.account.id;
    assert.equal(acctRes.body.account.balance, 100000);

    // Create a category
    const catRes = await api.post('/api/categories').send({
      name: 'Groceries', icon: '🛒', color: '#22C55E', type: 'expense'
    }).expect(201);
    const categoryId = catRes.body.category.id;

    // Add income transaction
    await api.post('/api/transactions').send({
      account_id: accountId, type: 'income', amount: 25000,
      description: 'Salary bonus', date: today(), currency: 'INR'
    }).expect(201);

    // Add expense transaction
    await api.post('/api/transactions').send({
      account_id: accountId, type: 'expense', amount: 3500,
      category_id: categoryId, description: 'Weekly groceries', date: today(), currency: 'INR'
    }).expect(201);

    // Check balance: 100000 + 25000 - 3500 = 121500
    const acct = await api.get('/api/accounts').expect(200);
    const primary = acct.body.accounts.find(a => a.id === accountId);
    assert.equal(primary.balance, 121500);

    // View transactions
    const txRes = await api.get('/api/transactions').expect(200);
    assert.equal(txRes.body.transactions.length, 2);

    // View stats (report)
    const statsRes = await api.get('/api/stats/summary').expect(200);
    assert.ok(statsRes.body);

    // Delete account
    await api.delete(`/api/accounts/${accountId}`).expect(200);

    // Verify deleted
    const afterDelete = await api.get('/api/accounts').expect(200);
    assert.ok(!afterDelete.body.accounts.find(a => a.id === accountId));
  });
});

describe('Integration: Transfer workflow', () => {
  beforeEach(() => cleanDb());

  it('create transfer → verify both accounts → delete transfer → verify reversal', async () => {
    const api = agent();

    // Create two accounts
    const src = await api.post('/api/accounts').send({
      name: 'Checking', type: 'checking', currency: 'INR', balance: 50000
    }).expect(201);
    const dst = await api.post('/api/accounts').send({
      name: 'Savings', type: 'savings', currency: 'INR', balance: 10000
    }).expect(201);

    const srcId = src.body.account.id;
    const dstId = dst.body.account.id;

    // Create transfer
    const txRes = await api.post('/api/transactions').send({
      account_id: srcId, transfer_to_account_id: dstId,
      type: 'transfer', amount: 15000,
      description: 'Move to savings', date: today(), currency: 'INR'
    }).expect(201);
    const transferId = txRes.body.transaction.id;

    // Verify account balances: src=35000, dst=25000
    const accts = await api.get('/api/accounts').expect(200);
    const srcAcct = accts.body.accounts.find(a => a.id === srcId);
    const dstAcct = accts.body.accounts.find(a => a.id === dstId);
    assert.equal(srcAcct.balance, 35000);
    assert.equal(dstAcct.balance, 25000);

    // Delete transfer
    await api.delete(`/api/transactions/${transferId}`).expect(200);

    // Verify balances are reversed
    const after = await api.get('/api/accounts').expect(200);
    const srcAfter = after.body.accounts.find(a => a.id === srcId);
    const dstAfter = after.body.accounts.find(a => a.id === dstId);
    assert.equal(srcAfter.balance, 50000);
    assert.equal(dstAfter.balance, 10000);
  });

  it('multiple transfers between accounts maintain balance consistency', async () => {
    const api = agent();

    const a1 = (await api.post('/api/accounts').send({ name: 'A1', type: 'checking', currency: 'INR', balance: 100000 }).expect(201)).body.account;
    const a2 = (await api.post('/api/accounts').send({ name: 'A2', type: 'savings', currency: 'INR', balance: 50000 }).expect(201)).body.account;
    const a3 = (await api.post('/api/accounts').send({ name: 'A3', type: 'wallet', currency: 'INR', balance: 20000 }).expect(201)).body.account;

    // A1 → A2: 30000
    await api.post('/api/transactions').send({
      account_id: a1.id, transfer_to_account_id: a2.id,
      type: 'transfer', amount: 30000, description: 'T1', date: today(), currency: 'INR'
    }).expect(201);

    // A2 → A3: 15000
    await api.post('/api/transactions').send({
      account_id: a2.id, transfer_to_account_id: a3.id,
      type: 'transfer', amount: 15000, description: 'T2', date: today(), currency: 'INR'
    }).expect(201);

    // A3 → A1: 5000
    await api.post('/api/transactions').send({
      account_id: a3.id, transfer_to_account_id: a1.id,
      type: 'transfer', amount: 5000, description: 'T3', date: today(), currency: 'INR'
    }).expect(201);

    // Total should still be 170000
    const accts = await api.get('/api/accounts').expect(200);
    const total = accts.body.accounts.reduce((s, a) => s + a.balance, 0);
    assert.equal(total, 170000);

    // A1: 100000 - 30000 + 5000 = 75000
    assert.equal(accts.body.accounts.find(a => a.id === a1.id).balance, 75000);
    // A2: 50000 + 30000 - 15000 = 65000
    assert.equal(accts.body.accounts.find(a => a.id === a2.id).balance, 65000);
    // A3: 20000 + 15000 - 5000 = 30000
    assert.equal(accts.body.accounts.find(a => a.id === a3.id).balance, 30000);
  });
});

describe('Integration: Budget with items and spending tracking', () => {
  beforeEach(() => cleanDb());

  it('create budget → spend against categories → check summary', async () => {
    const api = agent();

    const acct = makeAccount({ balance: 200000 });
    const cat1 = makeCategory({ name: 'Food', type: 'expense' });
    const cat2 = makeCategory({ name: 'Transport', type: 'expense' });

    // Create budget with items
    const budgetRes = await api.post('/api/budgets').send({
      name: 'March Budget', period: 'monthly',
      start_date: today(), end_date: daysFromNow(30),
      items: [
        { category_id: cat1.id, amount: 10000, rollover: 0 },
        { category_id: cat2.id, amount: 5000, rollover: 0 }
      ]
    }).expect(201);
    const budgetId = budgetRes.body.id;

    // Spend against Food category
    await api.post('/api/transactions').send({
      account_id: acct.id, category_id: cat1.id, type: 'expense',
      amount: 3000, description: 'Groceries', date: today(), currency: 'INR'
    }).expect(201);
    await api.post('/api/transactions').send({
      account_id: acct.id, category_id: cat1.id, type: 'expense',
      amount: 2000, description: 'Restaurant', date: today(), currency: 'INR'
    }).expect(201);

    // Spend against Transport category
    await api.post('/api/transactions').send({
      account_id: acct.id, category_id: cat2.id, type: 'expense',
      amount: 1500, description: 'Uber', date: today(), currency: 'INR'
    }).expect(201);

    // Check budget summary
    const summary = await api.get(`/api/budgets/${budgetId}/summary`).expect(200);
    const foodCat = summary.body.categories.find(c => c.category_id === cat1.id);
    const transCat = summary.body.categories.find(c => c.category_id === cat2.id);

    assert.equal(foodCat.allocated, 10000);
    assert.equal(foodCat.spent, 5000);
    assert.equal(foodCat.remaining, 5000);

    assert.equal(transCat.allocated, 5000);
    assert.equal(transCat.spent, 1500);
    assert.equal(transCat.remaining, 3500);

    assert.equal(summary.body.total_allocated, 15000);
    assert.equal(summary.body.total_spent, 6500);
  });

  it('budget rollover carries unspent amount to next period', async () => {
    const api = agent();
    const { db } = setup();

    const acct = makeAccount({ balance: 200000 });
    const cat = makeCategory({ name: 'Groceries', type: 'expense' });

    // Create a "previous" budget
    const prevStart = '2026-02-01';
    const prevEnd = '2026-02-28';
    const prevBudget = makeBudget({
      name: 'Feb Budget', period: 'monthly',
      start_date: prevStart, end_date: prevEnd,
      items: [{ category_id: cat.id, amount: 10000, rollover: 1 }]
    });

    // Spend 7000 in Feb → rollover = 3000
    db.prepare('INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, 7000, ?, ?, ?)')
      .run(acct.id, cat.id, 'expense', 'INR', 'Feb groceries', '2026-02-15');

    // Create current budget with rollover enabled
    const curStart = '2026-03-01';
    const curEnd = '2026-03-31';
    const curBudgetRes = await api.post('/api/budgets').send({
      name: 'Mar Budget', period: 'monthly',
      start_date: curStart, end_date: curEnd,
      items: [{ category_id: cat.id, amount: 10000, rollover: 1 }]
    }).expect(201);

    const summary = await api.get(`/api/budgets/${curBudgetRes.body.id}/summary`).expect(200);
    const groceryCat = summary.body.categories.find(c => c.category_id === cat.id);
    assert.equal(groceryCat.rollover_amount, 3000);
    assert.equal(groceryCat.effective_allocated, 13000);
  });
});

describe('Integration: Recurring rule scheduling', () => {
  beforeEach(() => cleanDb());

  it('create rule → trigger scheduler → verify transaction created + next_date advanced', async () => {
    const { db } = setup();
    const api = agent();
    const createScheduler = require('../src/scheduler');
    const logger = { info: () => {}, error: () => {}, warn: () => {} };

    const acct = makeAccount({ balance: 100000 });
    const cat = makeCategory({ name: 'Rent', type: 'expense' });

    // Create recurring rule with today's date
    const ruleRes = await api.post('/api/recurring').send({
      account_id: acct.id, category_id: cat.id, type: 'expense',
      amount: 25000, description: 'Monthly Rent',
      frequency: 'monthly', next_date: today()
    }).expect(201);
    const ruleId = ruleRes.body.rule.id;

    // Run scheduler
    const scheduler = createScheduler(db, logger);
    const result = scheduler.spawnDueRecurring();
    assert.ok(result.processed >= 1);
    assert.equal(result.failures.length, 0);

    // Verify transaction was created
    const txns = await api.get(`/api/transactions?account_id=${acct.id}`).expect(200);
    const recurring = txns.body.transactions.find(t => t.recurring_rule_id === ruleId);
    assert.ok(recurring, 'Recurring transaction should be created');
    assert.equal(recurring.amount, 25000);
    assert.equal(recurring.type, 'expense');
    assert.equal(recurring.is_recurring, 1);

    // Verify next_date advanced
    const ruleAfter = await api.get('/api/recurring').expect(200);
    const updatedRule = ruleAfter.body.rules.find(r => r.id === ruleId);
    assert.notEqual(updatedRule.next_date, today());

    // Verify account balance updated: 100000 - 25000 = 75000
    const accts = await api.get('/api/accounts').expect(200);
    assert.equal(accts.body.accounts.find(a => a.id === acct.id).balance, 75000);
  });

  it('recurring income rule increases balance correctly', async () => {
    const { db } = setup();
    const api = agent();
    const createScheduler = require('../src/scheduler');
    const logger = { info: () => {}, error: () => {}, warn: () => {} };

    const acct = makeAccount({ balance: 50000 });

    await api.post('/api/recurring').send({
      account_id: acct.id, type: 'income', amount: 80000,
      description: 'Monthly Salary', frequency: 'monthly', next_date: today()
    }).expect(201);

    const scheduler = createScheduler(db, logger);
    scheduler.spawnDueRecurring();

    const accts = await api.get('/api/accounts').expect(200);
    assert.equal(accts.body.accounts.find(a => a.id === acct.id).balance, 130000);
  });
});

describe('Integration: CSV import', () => {
  beforeEach(() => cleanDb());

  it('import CSV → verify transactions created correctly', async () => {
    const api = agent();

    const acct = makeAccount({ balance: 0 });
    const cat = makeCategory({ name: 'Food & Dining', type: 'expense' });

    const csv = [
      'date,description,amount,type,category',
      `${today()},Salary,50000,income,`,
      `${today()},Lunch,500,expense,Food & Dining`,
      `${today()},Uber,200,expense,`
    ].join('\n');

    const res = await api.post(`/api/data/csv-import?account_id=${acct.id}`)
      .set('Content-Type', 'text/plain')
      .send(csv)
      .expect(200);

    assert.equal(res.body.imported, 3);
    assert.equal(res.body.categorized, 1);
    assert.equal(res.body.uncategorized, 2);

    // Verify transactions created
    const txRes = await api.get(`/api/transactions?account_id=${acct.id}`).expect(200);
    assert.equal(txRes.body.transactions.length, 3);

    // Verify balance: 0 + 50000 - 500 - 200 = 49300
    const accts = await api.get('/api/accounts').expect(200);
    assert.equal(accts.body.accounts.find(a => a.id === acct.id).balance, 49300);
  });

  it('malformed CSV returns validation error', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 0 });

    // Missing required columns
    const csv = 'name,value\ntest,123';
    const res = await api.post(`/api/data/csv-import?account_id=${acct.id}`)
      .set('Content-Type', 'text/plain')
      .send(csv)
      .expect(400);

    assert.ok(res.body.error.message.includes('Missing required column'));
  });

  it('empty CSV returns validation error', async () => {
    const api = agent();
    const acct = makeAccount({ balance: 0 });

    const res = await api.post(`/api/data/csv-import?account_id=${acct.id}`)
      .set('Content-Type', 'text/plain')
      .send('')
      .expect(400);

    assert.ok(res.body.error.message.includes('Empty CSV'));
  });

  it('CSV import without account_id returns error', async () => {
    const api = agent();
    await api.post('/api/data/csv-import')
      .set('Content-Type', 'text/plain')
      .send('date,description,amount,type\n2026-01-01,Test,100,expense')
      .expect(400);
  });
});

describe('Integration: Floating point precision', () => {
  beforeEach(() => cleanDb());

  it('transactions with amounts 0.1 + 0.2 result in exact 0.3', async () => {
    const api = agent();

    const acct = (await api.post('/api/accounts').send({
      name: 'Float Test', type: 'checking', currency: 'INR', balance: 1000
    }).expect(201)).body.account;

    await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 0.1,
      description: 'Tiny expense 1', date: today(), currency: 'INR'
    }).expect(201);

    await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 0.2,
      description: 'Tiny expense 2', date: today(), currency: 'INR'
    }).expect(201);

    // Balance should be exactly 999.7, not 999.6999999999999
    const accts = await api.get('/api/accounts').expect(200);
    const balance = accts.body.accounts.find(a => a.id === acct.id).balance;
    assert.equal(balance, 999.7);
  });

  it('many small transactions maintain precision', async () => {
    const api = agent();

    const acct = (await api.post('/api/accounts').send({
      name: 'Precision Test', type: 'checking', currency: 'INR', balance: 100
    }).expect(201)).body.account;

    // Add 10 transactions of 0.1 each
    for (let i = 0; i < 10; i++) {
      await api.post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 0.1,
        description: `Micro expense ${i + 1}`, date: today(), currency: 'INR'
      }).expect(201);
    }

    // Balance should be exactly 99.0
    const accts = await api.get('/api/accounts').expect(200);
    const balance = accts.body.accounts.find(a => a.id === acct.id).balance;
    assert.equal(balance, 99);
  });

  it('transfer with fractional amounts maintains precision', async () => {
    const api = agent();

    const src = (await api.post('/api/accounts').send({
      name: 'Src', type: 'checking', currency: 'INR', balance: 100.10
    }).expect(201)).body.account;
    const dst = (await api.post('/api/accounts').send({
      name: 'Dst', type: 'savings', currency: 'INR', balance: 200.20
    }).expect(201)).body.account;

    await api.post('/api/transactions').send({
      account_id: src.id, transfer_to_account_id: dst.id,
      type: 'transfer', amount: 33.33,
      description: 'Fractional transfer', date: today(), currency: 'INR'
    }).expect(201);

    const accts = await api.get('/api/accounts').expect(200);
    const srcBal = accts.body.accounts.find(a => a.id === src.id).balance;
    const dstBal = accts.body.accounts.find(a => a.id === dst.id).balance;

    assert.equal(srcBal, 66.77);
    assert.equal(dstBal, 233.53);
  });
});

describe('Integration: Tags across transactions', () => {
  beforeEach(() => cleanDb());

  it('create tags → attach to transactions → filter by tag', async () => {
    const api = agent();

    const acct = makeAccount();

    // Create tags
    const tag1 = (await api.post('/api/tags').send({ name: 'Urgent', color: '#FF0000' }).expect(201)).body.tag;
    const tag2 = (await api.post('/api/tags').send({ name: 'Personal', color: '#00FF00' }).expect(201)).body.tag;

    // Create transactions with tags
    const tx1 = (await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 1000,
      description: 'Tagged expense 1', date: today(), currency: 'INR',
      tag_ids: [tag1.id]
    }).expect(201)).body.transaction;

    const tx2 = (await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 2000,
      description: 'Tagged expense 2', date: today(), currency: 'INR',
      tag_ids: [tag1.id, tag2.id]
    }).expect(201)).body.transaction;

    // Verify tags attached
    assert.ok(tx1.tags.some(t => t.id === tag1.id));
    assert.ok(tx2.tags.some(t => t.id === tag1.id));
    assert.ok(tx2.tags.some(t => t.id === tag2.id));

    // Filter by tag
    const filtered = await api.get(`/api/transactions?tag_id=${tag1.id}`).expect(200);
    assert.equal(filtered.body.transactions.length, 2);

    const filtered2 = await api.get(`/api/transactions?tag_id=${tag2.id}`).expect(200);
    assert.equal(filtered2.body.transactions.length, 1);
  });
});

describe('Integration: Category rule auto-assignment', () => {
  beforeEach(() => cleanDb());

  it('create rule → create transaction with matching description → auto-categorized', async () => {
    const api = agent();

    const acct = makeAccount();
    const cat = makeCategory({ name: 'Food', type: 'expense' });

    // Create category rule: transactions with "restaurant" get Food category
    await api.post('/api/rules').send({
      pattern: 'restaurant', category_id: cat.id
    }).expect(201);

    // Create transaction without explicit category
    const txRes = await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 500,
      description: 'Nice restaurant dinner', date: today(), currency: 'INR'
    }).expect(201);

    assert.equal(txRes.body.transaction.category_id, cat.id);
  });

  it('explicit category overrides rule', async () => {
    const api = agent();

    const acct = makeAccount();
    const foodCat = makeCategory({ name: 'Food', type: 'expense' });
    const entertainCat = makeCategory({ name: 'Entertainment', type: 'expense' });

    await api.post('/api/rules').send({
      pattern: 'pizza', category_id: foodCat.id
    }).expect(201);

    // Explicitly set entertainment category even though description matches food rule
    const txRes = await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 800,
      description: 'Pizza party for team', date: today(), currency: 'INR',
      category_id: entertainCat.id
    }).expect(201);

    assert.equal(txRes.body.transaction.category_id, entertainCat.id);
  });
});

describe('Integration: Subscription tracking', () => {
  beforeEach(() => cleanDb());

  it('create subscriptions → list → verify total monthly → delete', async () => {
    const api = agent();

    // Create subscriptions
    const s1 = (await api.post('/api/subscriptions').send({
      name: 'Netflix', amount: 649, frequency: 'monthly'
    }).expect(201)).body.subscription;

    const s2 = (await api.post('/api/subscriptions').send({
      name: 'YouTube Premium', amount: 189, frequency: 'monthly'
    }).expect(201)).body.subscription;

    const s3 = (await api.post('/api/subscriptions').send({
      name: 'Spotify', amount: 1190, frequency: 'yearly'
    }).expect(201)).body.subscription;

    // List and check total_monthly
    const listRes = await api.get('/api/subscriptions').expect(200);
    assert.equal(listRes.body.subscriptions.length, 3);
    assert.ok(listRes.body.total_monthly > 0);

    // Delete one
    await api.delete(`/api/subscriptions/${s1.id}`).expect(200);

    const afterDel = await api.get('/api/subscriptions').expect(200);
    assert.equal(afterDel.body.subscriptions.length, 2);
  });
});

describe('Integration: Goal contributions and completion', () => {
  beforeEach(() => cleanDb());

  it('create goal → contribute → mark complete', async () => {
    const api = agent();

    // Create goal
    const goalRes = await api.post('/api/goals').send({
      name: 'Emergency Fund', target_amount: 100000, icon: '🎯', color: '#22C55E'
    }).expect(201);
    const goalId = goalRes.body.goal.id;
    assert.equal(goalRes.body.goal.current_amount, 0);

    // Contribute to goal
    await api.put(`/api/goals/${goalId}`).send({ current_amount: 50000 }).expect(200);

    // Verify partial progress
    const partial = await api.get('/api/goals').expect(200);
    const goal = partial.body.goals.find(g => g.id === goalId);
    assert.equal(goal.current_amount, 50000);

    // Complete goal
    await api.put(`/api/goals/${goalId}`).send({ current_amount: 100000, is_completed: 1 }).expect(200);

    const completed = await api.get('/api/goals').expect(200);
    const done = completed.body.goals.find(g => g.id === goalId);
    assert.equal(done.current_amount, 100000);
    assert.equal(done.is_completed, 1);
  });
});

describe('Integration: Data export/import roundtrip', () => {
  beforeEach(() => cleanDb());

  it('export data → import back → verify consistency', async () => {
    const api = agent();

    // Create data
    const acct = makeAccount({ name: 'Export Test', balance: 50000 });
    const cat = makeCategory({ name: 'Test Cat', type: 'expense' });
    makeTransaction(acct.id, { amount: 1000, type: 'expense', category_id: cat.id });

    // Export
    const exportRes = await api.get('/api/data/export').expect(200);
    assert.ok(exportRes.body.accounts.length >= 1);
    assert.ok(exportRes.body.transactions.length >= 1);
    assert.ok(exportRes.body.categories.length >= 1);

    // Import over existing data
    const importRes = await api.post('/api/data/import').send({
      password: 'testpassword',
      confirm: 'DELETE ALL DATA',
      data: exportRes.body
    }).expect(200);

    assert.ok(importRes.body.ok || importRes.body.imported);

    // Verify data is still present
    const afterImport = await api.get('/api/accounts').expect(200);
    assert.ok(afterImport.body.accounts.length >= 1);
  });
});

describe('Integration: Bulk operations', () => {
  beforeEach(() => cleanDb());

  it('bulk tag → bulk untag → bulk delete transactions', async () => {
    const api = agent();

    const acct = makeAccount({ balance: 100000 });
    const tag = (await api.post('/api/tags').send({ name: 'BulkTag', color: '#000' }).expect(201)).body.tag;

    // Create multiple transactions
    const tx1 = (await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 100,
      description: 'Bulk 1', date: today(), currency: 'INR'
    }).expect(201)).body.transaction;

    const tx2 = (await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 200,
      description: 'Bulk 2', date: today(), currency: 'INR'
    }).expect(201)).body.transaction;

    const tx3 = (await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 300,
      description: 'Bulk 3', date: today(), currency: 'INR'
    }).expect(201)).body.transaction;

    // Bulk tag
    await api.post('/api/transactions/bulk-tag').send({
      ids: [tx1.id, tx2.id, tx3.id], tag_ids: [tag.id]
    }).expect(200);

    // Verify all tagged
    const tagged = await api.get(`/api/transactions?tag_id=${tag.id}`).expect(200);
    assert.equal(tagged.body.transactions.length, 3);

    // Bulk untag
    await api.post('/api/transactions/bulk-untag').send({
      ids: [tx1.id], tag_ids: [tag.id]
    }).expect(200);

    const afterUntag = await api.get(`/api/transactions?tag_id=${tag.id}`).expect(200);
    assert.equal(afterUntag.body.transactions.length, 2);

    // Bulk delete
    await api.post('/api/transactions/bulk-delete').send({
      ids: [tx1.id, tx2.id, tx3.id]
    }).expect(200);

    // Balance restored: 100000 - 100 - 200 - 300 + 100 + 200 + 300 = 100000
    const accts = await api.get('/api/accounts').expect(200);
    assert.equal(accts.body.accounts.find(a => a.id === acct.id).balance, 100000);
  });
});

describe('Integration: CSV import with auto-categorization rules', () => {
  beforeEach(() => cleanDb());

  it('CSV rows matching rules are auto-categorized', async () => {
    const api = agent();

    const acct = makeAccount({ balance: 0 });
    const cat = makeCategory({ name: 'Transport', type: 'expense' });

    // Create rule: "uber" → Transport
    await api.post('/api/rules').send({
      pattern: 'uber', category_id: cat.id
    }).expect(201);

    const csv = [
      'date,description,amount,type',
      `${today()},Uber ride to office,350,expense`,
      `${today()},Groceries at store,800,expense`
    ].join('\n');

    const res = await api.post(`/api/data/csv-import?account_id=${acct.id}`)
      .set('Content-Type', 'text/plain')
      .send(csv)
      .expect(200);

    assert.equal(res.body.imported, 2);
    assert.equal(res.body.categorized, 1);
    assert.equal(res.body.uncategorized, 1);

    // Verify Uber transaction got the Transport category
    const txns = await api.get(`/api/transactions?account_id=${acct.id}`).expect(200);
    const uber = txns.body.transactions.find(t => t.description.includes('Uber'));
    assert.equal(uber.category_id, cat.id);
  });
});

describe('Integration: Transaction amount update with balance recalculation', () => {
  beforeEach(() => cleanDb());

  it('updating transaction amount recalculates account balance', async () => {
    const api = agent();

    const acct = (await api.post('/api/accounts').send({
      name: 'Update Test', type: 'checking', currency: 'INR', balance: 10000
    }).expect(201)).body.account;

    // Create expense of 3000 → balance = 7000
    const tx = (await api.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 3000,
      description: 'Original expense', date: today(), currency: 'INR'
    }).expect(201)).body.transaction;

    // Update amount to 5000 → delta = +2000 more expense → balance = 5000
    await api.put(`/api/transactions/${tx.id}`).send({ amount: 5000 }).expect(200);

    const accts = await api.get('/api/accounts').expect(200);
    assert.equal(accts.body.accounts.find(a => a.id === acct.id).balance, 5000);
  });
});

describe('Integration: roundCurrency utility', () => {
  it('roundCurrency handles classic floating point cases', () => {
    const { roundCurrency } = require('../src/utils/currency');
    assert.equal(roundCurrency(0.1 + 0.2), 0.3);
    assert.equal(roundCurrency(1.005), 1.01);
    assert.equal(roundCurrency(2.675), 2.68);
    assert.equal(roundCurrency(100), 100);
    assert.equal(roundCurrency(99.999), 100);
    assert.equal(roundCurrency(0), 0);
    assert.equal(roundCurrency(-0.1 - 0.2), -0.3);
  });
});
