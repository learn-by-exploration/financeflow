const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, today } = require('./helpers');

const createAccountRepository = require('../src/repositories/account.repository');
const createTransactionRepository = require('../src/repositories/transaction.repository');
const createCategoryRepository = require('../src/repositories/category.repository');
const createBudgetRepository = require('../src/repositories/budget.repository');
const createGoalRepository = require('../src/repositories/goal.repository');
const createSubscriptionRepository = require('../src/repositories/subscription.repository');
const createRecurringRepository = require('../src/repositories/recurring.repository');
const createTagRepository = require('../src/repositories/tag.repository');

let db, userId;

before(() => {
  const env = setup();
  db = env.db;
  userId = 1;
});

beforeEach(() => {
  cleanDb();
});

after(() => {
  // teardown handled by other test files sharing the singleton
});

// ─── AccountRepository ───

describe('AccountRepository', () => {
  let accountRepo;

  before(() => {
    accountRepo = createAccountRepository({ db });
  });

  it('create() inserts an account and returns it', () => {
    const acct = accountRepo.create(userId, { name: 'Savings', type: 'savings', currency: 'INR' });
    assert.ok(acct.id);
    assert.equal(acct.name, 'Savings');
    assert.equal(acct.type, 'savings');
    assert.equal(acct.currency, 'INR');
    assert.equal(acct.user_id, userId);
  });

  it('findById() returns the account for the user', () => {
    const created = accountRepo.create(userId, { name: 'Checking', type: 'checking', currency: 'INR' });
    const found = accountRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'Checking');
  });

  it('findById() returns undefined for wrong user', () => {
    const created = accountRepo.create(userId, { name: 'Checking', type: 'checking', currency: 'INR' });
    const found = accountRepo.findById(created.id, 9999);
    assert.equal(found, undefined);
  });

  it('findAllByUser() returns all accounts ordered by position', () => {
    accountRepo.create(userId, { name: 'B Account', type: 'checking', currency: 'INR' });
    accountRepo.create(userId, { name: 'A Account', type: 'savings', currency: 'INR' });
    const all = accountRepo.findAllByUser(userId);
    assert.equal(all.length, 2);
    assert.ok(all[0].position <= all[1].position);
  });

  it('update() modifies account fields', () => {
    const created = accountRepo.create(userId, { name: 'Old Name', type: 'checking', currency: 'INR' });
    const updated = accountRepo.update(created.id, userId, { name: 'New Name' });
    assert.equal(updated.name, 'New Name');
    assert.equal(updated.type, 'checking');
  });

  it('update() returns undefined for non-existent account', () => {
    const result = accountRepo.update(99999, userId, { name: 'Nope' });
    assert.equal(result, undefined);
  });

  it('delete() removes the account', () => {
    const created = accountRepo.create(userId, { name: 'ToDelete', type: 'checking', currency: 'INR' });
    accountRepo.delete(created.id, userId);
    const found = accountRepo.findById(created.id, userId);
    assert.equal(found, undefined);
  });

  it('updateBalance() adjusts balance by delta', () => {
    const created = accountRepo.create(userId, { name: 'Balance Test', type: 'checking', currency: 'INR', balance: 1000 });
    accountRepo.updateBalance(created.id, userId, -250);
    const updated = accountRepo.findById(created.id, userId);
    assert.equal(updated.balance, 750);
  });

  it('updateBalance() can add positive delta', () => {
    const created = accountRepo.create(userId, { name: 'Balance Test', type: 'checking', currency: 'INR', balance: 1000 });
    accountRepo.updateBalance(created.id, userId, 500);
    const updated = accountRepo.findById(created.id, userId);
    assert.equal(updated.balance, 1500);
  });
});

// ─── CategoryRepository ───

describe('CategoryRepository', () => {
  let categoryRepo;

  before(() => {
    categoryRepo = createCategoryRepository({ db });
  });

  it('create() inserts a category and returns it', () => {
    const cat = categoryRepo.create(userId, { name: 'Food', type: 'expense' });
    assert.ok(cat.id);
    assert.equal(cat.name, 'Food');
    assert.equal(cat.type, 'expense');
    assert.equal(cat.user_id, userId);
  });

  it('findById() returns the category', () => {
    const created = categoryRepo.create(userId, { name: 'Transport', type: 'expense' });
    const found = categoryRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'Transport');
  });

  it('findById() returns undefined for wrong user', () => {
    const created = categoryRepo.create(userId, { name: 'Transport', type: 'expense' });
    const found = categoryRepo.findById(created.id, 9999);
    assert.equal(found, undefined);
  });

  it('findAllByUser() returns categories ordered by type, position', () => {
    categoryRepo.create(userId, { name: 'Salary', type: 'income' });
    categoryRepo.create(userId, { name: 'Rent', type: 'expense' });
    const all = categoryRepo.findAllByUser(userId);
    assert.ok(all.length >= 2);
  });

  it('update() modifies category fields', () => {
    const created = categoryRepo.create(userId, { name: 'Old Cat', type: 'expense' });
    const updated = categoryRepo.update(created.id, userId, { name: 'New Cat' });
    assert.equal(updated.name, 'New Cat');
  });

  it('delete() removes the category', () => {
    const created = categoryRepo.create(userId, { name: 'ToDelete', type: 'expense' });
    categoryRepo.delete(created.id, userId);
    const found = categoryRepo.findById(created.id, userId);
    assert.equal(found, undefined);
  });
});

// ─── TransactionRepository ───

describe('TransactionRepository', () => {
  let txRepo, accountRepo;

  before(() => {
    txRepo = createTransactionRepository({ db });
    accountRepo = createAccountRepository({ db });
  });

  function createTestAccount() {
    return accountRepo.create(userId, { name: 'Test Checking', type: 'checking', currency: 'INR', balance: 50000 });
  }

  it('create() inserts a transaction and returns it', () => {
    const acct = createTestAccount();
    const tx = txRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 500, currency: 'INR',
      description: 'Groceries', date: today()
    });
    assert.ok(tx.id);
    assert.equal(tx.amount, 500);
    assert.equal(tx.type, 'expense');
    assert.equal(tx.description, 'Groceries');
  });

  it('findById() returns the transaction', () => {
    const acct = createTestAccount();
    const created = txRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 200, currency: 'INR',
      description: 'Coffee', date: today()
    });
    const found = txRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.description, 'Coffee');
  });

  it('findById() returns undefined for wrong user', () => {
    const acct = createTestAccount();
    const created = txRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 200, currency: 'INR',
      description: 'Coffee', date: today()
    });
    const found = txRepo.findById(created.id, 9999);
    assert.equal(found, undefined);
  });

  it('findAllByUser() returns transactions with joins', () => {
    const acct = createTestAccount();
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Tx1', date: today() });
    txRepo.create(userId, { account_id: acct.id, type: 'income', amount: 200, currency: 'INR', description: 'Tx2', date: today() });
    const all = txRepo.findAllByUser(userId);
    assert.equal(all.length, 2);
    assert.ok(all[0].account_name); // joined field
  });

  it('findAllByUser() filters by account_id', () => {
    const acct1 = createTestAccount();
    const acct2 = accountRepo.create(userId, { name: 'Savings', type: 'savings', currency: 'INR', balance: 10000 });
    txRepo.create(userId, { account_id: acct1.id, type: 'expense', amount: 100, currency: 'INR', description: 'A', date: today() });
    txRepo.create(userId, { account_id: acct2.id, type: 'expense', amount: 200, currency: 'INR', description: 'B', date: today() });
    const filtered = txRepo.findAllByUser(userId, { account_id: acct1.id });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].description, 'A');
  });

  it('findAllByUser() filters by type', () => {
    const acct = createTestAccount();
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Exp', date: today() });
    txRepo.create(userId, { account_id: acct.id, type: 'income', amount: 200, currency: 'INR', description: 'Inc', date: today() });
    const filtered = txRepo.findAllByUser(userId, { type: 'income' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].description, 'Inc');
  });

  it('findAllByUser() filters by date range', () => {
    const acct = createTestAccount();
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Old', date: '2024-01-01' });
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 200, currency: 'INR', description: 'New', date: '2024-06-15' });
    const filtered = txRepo.findAllByUser(userId, { from: '2024-06-01', to: '2024-12-31' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].description, 'New');
  });

  it('findAllByUser() filters by search (description)', () => {
    const acct = createTestAccount();
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Uber ride', date: today() });
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 200, currency: 'INR', description: 'Groceries', date: today() });
    const filtered = txRepo.findAllByUser(userId, { search: 'uber' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].description, 'Uber ride');
  });

  it('findAllByUser() respects limit and offset', () => {
    const acct = createTestAccount();
    for (let i = 0; i < 5; i++) {
      txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100 + i, currency: 'INR', description: `Tx${i}`, date: today() });
    }
    const page = txRepo.findAllByUser(userId, { limit: 2, offset: 2 });
    assert.equal(page.length, 2);
  });

  it('update() modifies transaction fields', () => {
    const acct = createTestAccount();
    const created = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Old', date: today() });
    const updated = txRepo.update(created.id, userId, { description: 'Updated' });
    assert.equal(updated.description, 'Updated');
    assert.equal(updated.amount, 100); // unchanged
  });

  it('delete() removes the transaction', () => {
    const acct = createTestAccount();
    const created = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Gone', date: today() });
    txRepo.delete(created.id, userId);
    const found = txRepo.findById(created.id, userId);
    assert.equal(found, undefined);
  });

  it('countByUser() returns the total count', () => {
    const acct = createTestAccount();
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'A', date: today() });
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 200, currency: 'INR', description: 'B', date: today() });
    assert.equal(txRepo.countByUser(userId), 2);
  });

  it('linkTags() and getTagsForTransaction() manage tags', () => {
    const acct = createTestAccount();
    const tx = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Tagged', date: today() });

    // Create tags
    const t1 = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, 'food', '#ff0000');
    const t2 = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, 'personal', '#00ff00');

    txRepo.linkTags(tx.id, [t1.lastInsertRowid, t2.lastInsertRowid]);
    const tags = txRepo.getTagsForTransaction(tx.id);
    assert.equal(tags.length, 2);
    const names = tags.map(t => t.name).sort();
    assert.deepEqual(names, ['food', 'personal']);
  });

  it('linkTags() is idempotent (INSERT OR IGNORE)', () => {
    const acct = createTestAccount();
    const tx = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Tagged', date: today() });
    const t1 = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, 'dup', '#ff0000');
    txRepo.linkTags(tx.id, [t1.lastInsertRowid]);
    txRepo.linkTags(tx.id, [t1.lastInsertRowid]); // should not throw
    const tags = txRepo.getTagsForTransaction(tx.id);
    assert.equal(tags.length, 1);
  });

  it('findAllByUser() filters by category_id', () => {
    const acct = createTestAccount();
    const catRepo = createCategoryRepository({ db });
    const cat = catRepo.create(userId, { name: 'Food', type: 'expense' });
    txRepo.create(userId, { account_id: acct.id, category_id: cat.id, type: 'expense', amount: 100, currency: 'INR', description: 'Lunch', date: today() });
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 200, currency: 'INR', description: 'Other', date: today() });
    const filtered = txRepo.findAllByUser(userId, { category_id: cat.id });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].description, 'Lunch');
  });

  it('findAllByUser() filters by tag_id', () => {
    const acct = createTestAccount();
    const tx1 = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'HasTag', date: today() });
    txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 200, currency: 'INR', description: 'NoTag', date: today() });
    const tag = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, 'filter-tag', '#0000ff');
    txRepo.linkTags(tx1.id, [tag.lastInsertRowid]);
    const filtered = txRepo.findAllByUser(userId, { tag_id: tag.lastInsertRowid });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].description, 'HasTag');
  });
});

// ─── BudgetRepository ───

describe('BudgetRepository', () => {
  let budgetRepo, categoryRepo;

  before(() => {
    budgetRepo = createBudgetRepository({ db });
    categoryRepo = createCategoryRepository({ db });
  });

  it('create() inserts a budget and returns it', () => {
    const budget = budgetRepo.create(userId, { name: 'Monthly', period: 'monthly', start_date: today(), end_date: '2026-12-31' });
    assert.ok(budget.id);
    assert.equal(budget.name, 'Monthly');
    assert.equal(budget.period, 'monthly');
    assert.equal(budget.user_id, userId);
  });

  it('create() inserts budget with items', () => {
    const cat = categoryRepo.create(userId, { name: 'Food', type: 'expense' });
    const budget = budgetRepo.create(userId, {
      name: 'With Items', period: 'monthly', start_date: today(), end_date: '2026-12-31',
      items: [{ category_id: cat.id, amount: 5000, rollover: true }]
    });
    assert.ok(budget.id);
    const items = budgetRepo.getItems(budget.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].amount, 5000);
    assert.equal(items[0].rollover, 1);
    assert.equal(items[0].category_name, 'Food');
  });

  it('findById() returns the budget for the user', () => {
    const created = budgetRepo.create(userId, { name: 'Find Me', period: 'monthly' });
    const found = budgetRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'Find Me');
  });

  it('findById() returns undefined for wrong user', () => {
    const created = budgetRepo.create(userId, { name: 'Private', period: 'monthly' });
    const found = budgetRepo.findById(created.id, 9999);
    assert.equal(found, undefined);
  });

  it('findAllByUser() returns budgets ordered by created_at DESC', () => {
    budgetRepo.create(userId, { name: 'Budget A', period: 'monthly' });
    budgetRepo.create(userId, { name: 'Budget B', period: 'weekly' });
    const all = budgetRepo.findAllByUser(userId);
    assert.ok(all.length >= 2);
  });

  it('update() modifies budget fields', () => {
    const created = budgetRepo.create(userId, { name: 'Old Budget', period: 'monthly' });
    const updated = budgetRepo.update(created.id, userId, { name: 'New Budget' });
    assert.equal(updated.name, 'New Budget');
    assert.equal(updated.period, 'monthly');
  });

  it('delete() removes the budget and cascades items', () => {
    const cat = categoryRepo.create(userId, { name: 'Rent', type: 'expense' });
    const budget = budgetRepo.create(userId, {
      name: 'Delete Me', period: 'monthly',
      items: [{ category_id: cat.id, amount: 1000 }]
    });
    budgetRepo.delete(budget.id, userId);
    assert.equal(budgetRepo.findById(budget.id, userId), undefined);
    assert.equal(budgetRepo.getItems(budget.id).length, 0);
  });

  it('getItems() returns items with category joins', () => {
    const cat = categoryRepo.create(userId, { name: 'Transport', type: 'expense' });
    const budget = budgetRepo.create(userId, {
      name: 'Items Test', period: 'monthly',
      items: [{ category_id: cat.id, amount: 3000 }]
    });
    const items = budgetRepo.getItems(budget.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].category_name, 'Transport');
    assert.ok(items[0].category_icon);
  });

  it('updateItem() modifies item amount and rollover', () => {
    const cat = categoryRepo.create(userId, { name: 'Groceries', type: 'expense' });
    const budget = budgetRepo.create(userId, {
      name: 'Item Update', period: 'monthly',
      items: [{ category_id: cat.id, amount: 2000, rollover: false }]
    });
    const items = budgetRepo.getItems(budget.id);
    const updated = budgetRepo.updateItem(items[0].id, budget.id, { amount: 3000, rollover: 1 });
    assert.equal(updated.amount, 3000);
    assert.equal(updated.rollover, 1);
  });

  it('findItemById() returns item for correct budget', () => {
    const cat = categoryRepo.create(userId, { name: 'Utils', type: 'expense' });
    const budget = budgetRepo.create(userId, {
      name: 'Item Find', period: 'monthly',
      items: [{ category_id: cat.id, amount: 1000 }]
    });
    const items = budgetRepo.getItems(budget.id);
    const found = budgetRepo.findItemById(items[0].id, budget.id);
    assert.ok(found);
    assert.equal(found.amount, 1000);
  });

  it('findItemById() returns undefined for wrong budget', () => {
    const cat = categoryRepo.create(userId, { name: 'Misc', type: 'expense' });
    const budget = budgetRepo.create(userId, {
      name: 'Wrong Budget', period: 'monthly',
      items: [{ category_id: cat.id, amount: 500 }]
    });
    const items = budgetRepo.getItems(budget.id);
    const found = budgetRepo.findItemById(items[0].id, 99999);
    assert.equal(found, undefined);
  });
});

// ─── GoalRepository ───

describe('GoalRepository', () => {
  let goalRepo;

  before(() => {
    goalRepo = createGoalRepository({ db });
  });

  it('create() inserts a goal and returns it', () => {
    const goal = goalRepo.create(userId, { name: 'Emergency Fund', target_amount: 100000 });
    assert.ok(goal.id);
    assert.equal(goal.name, 'Emergency Fund');
    assert.equal(goal.target_amount, 100000);
    assert.equal(goal.current_amount, 0);
    assert.equal(goal.user_id, userId);
  });

  it('findById() returns the goal', () => {
    const created = goalRepo.create(userId, { name: 'Vacation', target_amount: 50000 });
    const found = goalRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'Vacation');
  });

  it('findById() returns undefined for wrong user', () => {
    const created = goalRepo.create(userId, { name: 'Private Goal', target_amount: 10000 });
    assert.equal(goalRepo.findById(created.id, 9999), undefined);
  });

  it('findAllByUser() returns goals ordered by position', () => {
    goalRepo.create(userId, { name: 'Goal A', target_amount: 1000 });
    goalRepo.create(userId, { name: 'Goal B', target_amount: 2000 });
    const all = goalRepo.findAllByUser(userId);
    assert.ok(all.length >= 2);
  });

  it('update() modifies goal fields', () => {
    const created = goalRepo.create(userId, { name: 'Old Goal', target_amount: 5000 });
    const updated = goalRepo.update(created.id, userId, { name: 'New Goal' });
    assert.equal(updated.name, 'New Goal');
    assert.equal(updated.target_amount, 5000);
  });

  it('update() auto-marks completed when current_amount >= target_amount', () => {
    const created = goalRepo.create(userId, { name: 'Complete Me', target_amount: 1000 });
    const updated = goalRepo.update(created.id, userId, { current_amount: 1000 });
    assert.equal(updated.is_completed, 1);
  });

  it('delete() removes the goal', () => {
    const created = goalRepo.create(userId, { name: 'Delete Me', target_amount: 500 });
    goalRepo.delete(created.id, userId);
    assert.equal(goalRepo.findById(created.id, userId), undefined);
  });

  it('contribute() increments current_amount', () => {
    const created = goalRepo.create(userId, { name: 'Save Up', target_amount: 10000, current_amount: 2000 });
    const updated = goalRepo.contribute(created.id, userId, 3000);
    assert.equal(updated.current_amount, 5000);
    assert.equal(updated.is_completed, 0);
  });

  it('contribute() auto-marks completed on reaching target', () => {
    const created = goalRepo.create(userId, { name: 'Almost There', target_amount: 5000, current_amount: 4000 });
    const updated = goalRepo.contribute(created.id, userId, 1000);
    assert.equal(updated.current_amount, 5000);
    assert.equal(updated.is_completed, 1);
  });

  it('contribute() returns undefined for wrong user', () => {
    const created = goalRepo.create(userId, { name: 'Not Yours', target_amount: 1000 });
    assert.equal(goalRepo.contribute(created.id, 9999, 100), undefined);
  });
});

// ─── SubscriptionRepository ───

describe('SubscriptionRepository', () => {
  let subRepo;

  before(() => {
    subRepo = createSubscriptionRepository({ db });
  });

  it('create() inserts a subscription and returns it', () => {
    const sub = subRepo.create(userId, { name: 'Netflix', amount: 199, frequency: 'monthly' });
    assert.ok(sub.id);
    assert.equal(sub.name, 'Netflix');
    assert.equal(sub.amount, 199);
    assert.equal(sub.frequency, 'monthly');
    assert.equal(sub.user_id, userId);
  });

  it('findById() returns the subscription', () => {
    const created = subRepo.create(userId, { name: 'Spotify', amount: 119, frequency: 'monthly' });
    const found = subRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'Spotify');
  });

  it('findById() returns undefined for wrong user', () => {
    const created = subRepo.create(userId, { name: 'Private Sub', amount: 99, frequency: 'monthly' });
    assert.equal(subRepo.findById(created.id, 9999), undefined);
  });

  it('findAllByUser() returns subscriptions with category join', () => {
    subRepo.create(userId, { name: 'YouTube', amount: 129, frequency: 'monthly' });
    const all = subRepo.findAllByUser(userId);
    assert.ok(all.length >= 1);
  });

  it('update() modifies subscription fields', () => {
    const created = subRepo.create(userId, { name: 'Old Sub', amount: 100, frequency: 'monthly' });
    const updated = subRepo.update(created.id, userId, { name: 'New Sub', amount: 150 });
    assert.equal(updated.name, 'New Sub');
    assert.equal(updated.amount, 150);
  });

  it('delete() removes the subscription', () => {
    const created = subRepo.create(userId, { name: 'Delete Me', amount: 50, frequency: 'monthly' });
    subRepo.delete(created.id, userId);
    assert.equal(subRepo.findById(created.id, userId), undefined);
  });
});

// ─── RecurringRepository ───

describe('RecurringRepository', () => {
  let recurringRepo, accountRepo;

  before(() => {
    recurringRepo = createRecurringRepository({ db });
    accountRepo = createAccountRepository({ db });
  });

  function createTestAccount() {
    return accountRepo.create(userId, { name: 'Test Checking', type: 'checking', currency: 'INR', balance: 50000 });
  }

  it('create() inserts a recurring rule and returns it', () => {
    const acct = createTestAccount();
    const rule = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 5000, description: 'Rent', frequency: 'monthly', next_date: today()
    });
    assert.ok(rule.id);
    assert.equal(rule.description, 'Rent');
    assert.equal(rule.amount, 5000);
    assert.equal(rule.frequency, 'monthly');
    assert.equal(rule.is_active, 1);
  });

  it('findById() returns the rule', () => {
    const acct = createTestAccount();
    const created = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 1000, description: 'Internet', frequency: 'monthly', next_date: today()
    });
    const found = recurringRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.description, 'Internet');
  });

  it('findById() returns undefined for wrong user', () => {
    const acct = createTestAccount();
    const created = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 500, description: 'Private', frequency: 'weekly', next_date: today()
    });
    assert.equal(recurringRepo.findById(created.id, 9999), undefined);
  });

  it('findAllByUser() returns rules with account/category joins', () => {
    const acct = createTestAccount();
    recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 2000, description: 'Electric', frequency: 'monthly', next_date: today()
    });
    const all = recurringRepo.findAllByUser(userId);
    assert.ok(all.length >= 1);
    assert.ok(all[0].account_name);
  });

  it('update() modifies rule fields', () => {
    const acct = createTestAccount();
    const created = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 1500, description: 'Old Rule', frequency: 'monthly', next_date: today()
    });
    const updated = recurringRepo.update(created.id, userId, { description: 'New Rule', amount: 2000 });
    assert.equal(updated.description, 'New Rule');
    assert.equal(updated.amount, 2000);
  });

  it('update() with no fields returns existing rule', () => {
    const acct = createTestAccount();
    const created = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 300, description: 'No Change', frequency: 'weekly', next_date: today()
    });
    const same = recurringRepo.update(created.id, userId, {});
    assert.equal(same.id, created.id);
    assert.equal(same.description, 'No Change');
  });

  it('delete() removes the rule', () => {
    const acct = createTestAccount();
    const created = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 500, description: 'Gone', frequency: 'daily', next_date: today()
    });
    recurringRepo.delete(created.id, userId);
    assert.equal(recurringRepo.findById(created.id, userId), undefined);
  });

  it('advanceNextDate() moves next_date by frequency', () => {
    const acct = createTestAccount();
    const created = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 1000, description: 'Advance Test', frequency: 'monthly', next_date: '2026-03-15'
    });
    const advanced = recurringRepo.advanceNextDate(created.id, userId);
    assert.equal(advanced.next_date, '2026-04-15');
  });

  it('advanceNextDate() returns undefined for wrong user', () => {
    const acct = createTestAccount();
    const created = recurringRepo.create(userId, {
      account_id: acct.id, type: 'expense', amount: 500, description: 'Not Yours', frequency: 'weekly', next_date: today()
    });
    assert.equal(recurringRepo.advanceNextDate(created.id, 9999), undefined);
  });
});

// ─── TagRepository ───

describe('TagRepository', () => {
  let tagRepo, txRepo, accountRepo;

  before(() => {
    tagRepo = createTagRepository({ db });
    txRepo = createTransactionRepository({ db });
    accountRepo = createAccountRepository({ db });
  });

  it('create() inserts a tag and returns it', () => {
    const tag = tagRepo.create(userId, { name: 'groceries', color: '#ff0000' });
    assert.ok(tag.id);
    assert.equal(tag.name, 'groceries');
    assert.equal(tag.color, '#ff0000');
    assert.equal(tag.user_id, userId);
  });

  it('findById() returns the tag', () => {
    const created = tagRepo.create(userId, { name: 'travel' });
    const found = tagRepo.findById(created.id, userId);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'travel');
  });

  it('findById() returns undefined for wrong user', () => {
    const created = tagRepo.create(userId, { name: 'private-tag' });
    assert.equal(tagRepo.findById(created.id, 9999), undefined);
  });

  it('findByName() returns tag by name', () => {
    tagRepo.create(userId, { name: 'unique-name' });
    const found = tagRepo.findByName(userId, 'unique-name');
    assert.ok(found);
    assert.equal(found.name, 'unique-name');
  });

  it('findByName() returns undefined for non-existent name', () => {
    assert.equal(tagRepo.findByName(userId, 'no-such-tag'), undefined);
  });

  it('findAllByUser() returns tags ordered by name', () => {
    tagRepo.create(userId, { name: 'zzz-tag' });
    tagRepo.create(userId, { name: 'aaa-tag' });
    const all = tagRepo.findAllByUser(userId);
    assert.ok(all.length >= 2);
    // Should be alphabetical
    const names = all.map(t => t.name);
    const sorted = [...names].sort();
    assert.deepEqual(names, sorted);
  });

  it('update() modifies tag fields', () => {
    const created = tagRepo.create(userId, { name: 'old-tag', color: '#000000' });
    const updated = tagRepo.update(created.id, userId, { name: 'new-tag', color: '#ffffff' });
    assert.equal(updated.name, 'new-tag');
    assert.equal(updated.color, '#ffffff');
  });

  it('delete() removes the tag', () => {
    const created = tagRepo.create(userId, { name: 'delete-me' });
    tagRepo.delete(created.id, userId);
    assert.equal(tagRepo.findById(created.id, userId), undefined);
  });

  it('linkTransactionTags() and getTransactionTags() manage tags', () => {
    const acct = accountRepo.create(userId, { name: 'Tag Acct', type: 'checking', currency: 'INR', balance: 10000 });
    const tx = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 100, currency: 'INR', description: 'Tagged Tx', date: today() });
    const t1 = tagRepo.create(userId, { name: 'link-tag1', color: '#ff0000' });
    const t2 = tagRepo.create(userId, { name: 'link-tag2', color: '#00ff00' });
    tagRepo.linkTransactionTags(tx.id, [t1.id, t2.id]);
    const tags = tagRepo.getTransactionTags(tx.id);
    assert.equal(tags.length, 2);
    const names = tags.map(t => t.name).sort();
    assert.deepEqual(names, ['link-tag1', 'link-tag2']);
  });

  it('linkTransactionTags() is idempotent', () => {
    const acct = accountRepo.create(userId, { name: 'Idem Acct', type: 'checking', currency: 'INR', balance: 10000 });
    const tx = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 50, currency: 'INR', description: 'Idem Tx', date: today() });
    const tag = tagRepo.create(userId, { name: 'idem-tag' });
    tagRepo.linkTransactionTags(tx.id, [tag.id]);
    tagRepo.linkTransactionTags(tx.id, [tag.id]); // should not throw
    const tags = tagRepo.getTransactionTags(tx.id);
    assert.equal(tags.length, 1);
  });

  it('getTransactionTags() returns empty array for untagged transaction', () => {
    const acct = accountRepo.create(userId, { name: 'Notag Acct', type: 'checking', currency: 'INR', balance: 10000 });
    const tx = txRepo.create(userId, { account_id: acct.id, type: 'expense', amount: 25, currency: 'INR', description: 'No Tags', date: today() });
    const tags = tagRepo.getTransactionTags(tx.id);
    assert.equal(tags.length, 0);
  });
});
