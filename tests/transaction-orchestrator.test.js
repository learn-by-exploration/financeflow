// tests/transaction-orchestrator.test.js — Transaction orchestrator service tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeAccount, makeCategory, makeTransaction, makeBudget, makeGoal } = require('./helpers');

describe('Transaction Orchestrator Service', () => {
  let db, orchestrator;
  before(() => {
    ({ db } = setup());
    const createOrchestrator = require('../src/services/transaction-orchestrator.service');
    orchestrator = createOrchestrator({ db });
  });
  after(teardown);
  beforeEach(cleanDb);

  describe('resolveCategory', () => {
    it('returns provided categoryId when present', () => {
      const result = orchestrator.resolveCategory(1, 42, 'Some description');
      assert.equal(result, 42);
    });

    it('returns null when no category and no description', () => {
      const result = orchestrator.resolveCategory(1, null, null);
      assert.equal(result, null);
    });

    it('returns null when no category and no matching rules', () => {
      const result = orchestrator.resolveCategory(1, null, 'Random purchase');
      assert.equal(result, null);
    });

    it('auto-categorizes based on matching rule', () => {
      const category = makeCategory({ name: 'Groceries' });
      db.prepare(
        'INSERT INTO category_rules (user_id, pattern, category_id, position) VALUES (?, ?, ?, ?)'
      ).run(1, 'grocery|supermarket', category.id, 0);

      const result = orchestrator.resolveCategory(1, null, 'Weekly grocery shopping');
      assert.equal(result, category.id);
    });

    it('uses first matching rule by position', () => {
      const cat1 = makeCategory({ name: 'Food' });
      const cat2 = makeCategory({ name: 'Shopping' });
      db.prepare(
        'INSERT INTO category_rules (user_id, pattern, category_id, position) VALUES (?, ?, ?, ?)'
      ).run(1, 'food', cat1.id, 0);
      db.prepare(
        'INSERT INTO category_rules (user_id, pattern, category_id, position) VALUES (?, ?, ?, ?)'
      ).run(1, 'food|shopping', cat2.id, 1);

      const result = orchestrator.resolveCategory(1, null, 'Food delivery');
      assert.equal(result, cat1.id);
    });
  });

  describe('checkDuplicate', () => {
    it('detects duplicate transactions', () => {
      const account = makeAccount();
      const today = new Date().toISOString().slice(0, 10);
      const txn1 = makeTransaction(account.id, { amount: 500, description: 'Coffee', date: today });
      const txn2 = makeTransaction(account.id, { amount: 500, description: 'Coffee', date: today });

      const result = orchestrator.checkDuplicate(1, txn2.id, {
        account_id: account.id, date: today, amount: 500, description: 'Coffee'
      });
      assert.equal(result.potential_duplicate, true);
      assert.equal(result.similar_transaction_id, txn1.id);
    });

    it('returns false when no duplicate', () => {
      const account = makeAccount();
      const today = new Date().toISOString().slice(0, 10);
      const txn = makeTransaction(account.id, { amount: 500, description: 'Unique purchase', date: today });

      const result = orchestrator.checkDuplicate(1, txn.id, {
        account_id: account.id, date: today, amount: 500, description: 'Unique purchase'
      });
      assert.equal(result.potential_duplicate, false);
    });
  });

  describe('autoAllocateToGoals', () => {
    it('allocates income to goals with auto_allocate_percent', () => {
      const account = makeAccount();
      const goal = makeGoal({ name: 'Savings', target_amount: 100000, current_amount: 0 });
      // Set auto_allocate_percent
      db.prepare('UPDATE savings_goals SET auto_allocate_percent = 10 WHERE id = ?').run(goal.id);

      const txn = makeTransaction(account.id, { type: 'income', amount: 50000, description: 'Salary' });
      const allocations = orchestrator.autoAllocateToGoals(1, txn.id, 50000);

      assert.ok(allocations.length >= 1);
      assert.equal(allocations[0].goal_id, goal.id);
      assert.equal(allocations[0].amount, 5000); // 10% of 50000
    });

    it('returns empty array when no auto-allocate goals', () => {
      const account = makeAccount();
      const txn = makeTransaction(account.id, { type: 'income', amount: 50000, description: 'Salary' });
      const allocations = orchestrator.autoAllocateToGoals(1, txn.id, 50000);
      assert.deepEqual(allocations, []);
    });
  });

  describe('checkSpendingLimits', () => {
    it('does not throw when no spending limits exist', () => {
      assert.doesNotThrow(() => {
        orchestrator.checkSpendingLimits(1, null, 500);
      });
    });

    it('creates notification when spending limit exceeded', () => {
      const category = makeCategory({ name: 'Food', type: 'expense' });
      const account = makeAccount();
      // Create spending limit
      db.prepare(
        'INSERT INTO spending_limits (user_id, category_id, amount, period) VALUES (?, ?, ?, ?)'
      ).run(1, category.id, 1000, 'monthly');
      // Create enough spending to exceed limit
      makeTransaction(account.id, { amount: 1100, category_id: category.id, type: 'expense' });

      orchestrator.checkSpendingLimits(1, category.id, 1100);

      const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = 1 AND type = 'spending_exceeded'").all();
      assert.ok(notifications.length >= 1);
    });
  });

  describe('checkBudgetThresholds', () => {
    it('does not throw when no budgets exist', () => {
      const category = makeCategory();
      assert.doesNotThrow(() => {
        orchestrator.checkBudgetThresholds(1, category.id, new Date().toISOString().slice(0, 10));
      });
    });
  });

  describe('runPostCreationEffects', () => {
    it('runs all effects without throwing', () => {
      const account = makeAccount();
      const category = makeCategory({ type: 'expense' });
      const txn = makeTransaction(account.id, { amount: 500, category_id: category.id, type: 'expense' });

      const effects = orchestrator.runPostCreationEffects(1, txn, {
        categoryId: category.id,
        type: 'expense',
        amount: 500,
        date: new Date().toISOString().slice(0, 10),
        account_id: account.id,
        description: 'Test purchase',
      });

      assert.equal(typeof effects.potential_duplicate, 'boolean');
      assert.ok(Array.isArray(effects.auto_allocations));
    });

    it('runs income effects with goal allocation', () => {
      const account = makeAccount();
      const goal = makeGoal({ name: 'Fund', target_amount: 100000, current_amount: 0 });
      db.prepare('UPDATE savings_goals SET auto_allocate_percent = 5 WHERE id = ?').run(goal.id);

      const txn = makeTransaction(account.id, { type: 'income', amount: 100000, description: 'Bonus' });

      const effects = orchestrator.runPostCreationEffects(1, txn, {
        categoryId: null,
        type: 'income',
        amount: 100000,
        date: new Date().toISOString().slice(0, 10),
        account_id: account.id,
        description: 'Bonus',
      });

      assert.ok(effects.auto_allocations.length >= 1);
      assert.equal(effects.auto_allocations[0].amount, 5000); // 5% of 100000
    });
  });
});
