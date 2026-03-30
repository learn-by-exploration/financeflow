const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, today } = require('./helpers');

const createAccountRepository = require('../src/repositories/account.repository');
const createTransactionRepository = require('../src/repositories/transaction.repository');
const createCategoryRepository = require('../src/repositories/category.repository');

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
