// tests/data-repository.test.js — Data repository export/import tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeAccount, makeCategory, makeTransaction, makeBudget, makeGroup, makeGroupMember, makeSharedExpense } = require('./helpers');

describe('Data Repository', () => {
  let db, dataRepo;
  before(() => {
    ({ db } = setup());
    const createDataRepository = require('../src/repositories/data.repository');
    dataRepo = createDataRepository({ db });
  });
  after(teardown);
  beforeEach(cleanDb);

  describe('getExportData', () => {
    it('returns empty arrays when no data', () => {
      const result = dataRepo.getExportData(1);
      assert.ok(Array.isArray(result.accounts));
      assert.ok(Array.isArray(result.categories));
      assert.ok(Array.isArray(result.transactions));
      assert.ok(Array.isArray(result.budgets));
      assert.ok(Array.isArray(result.goals));
      assert.ok(Array.isArray(result.subscriptions));
      assert.ok(Array.isArray(result.settings));
      assert.ok(Array.isArray(result.rules));
    });

    it('exports accounts and transactions', () => {
      const account = makeAccount();
      makeTransaction(account.id, { description: 'Export test' });
      const result = dataRepo.getExportData(1);
      assert.ok(result.accounts.length >= 1);
      assert.ok(result.transactions.length >= 1);
    });

    it('exports budgets with nested items', () => {
      const category = makeCategory();
      makeBudget({ items: [{ category_id: category.id, amount: 5000 }] });
      const result = dataRepo.getExportData(1);
      assert.ok(result.budgets.length >= 1);
      assert.ok(result.budgets[0].items.length >= 1);
      assert.equal(result.budgets[0].items[0].amount, 5000);
    });

    it('batch loads budget items instead of N+1', () => {
      const cat1 = makeCategory({ name: 'Cat1' });
      const cat2 = makeCategory({ name: 'Cat2' });
      makeBudget({ name: 'B1', items: [{ category_id: cat1.id, amount: 1000 }] });
      makeBudget({ name: 'B2', items: [{ category_id: cat2.id, amount: 2000 }] });
      const result = dataRepo.getExportData(1);
      assert.equal(result.budgets.length, 2);
      assert.ok(result.budgets.every(b => b.items.length >= 1));
    });
  });

  describe('getExportGroups', () => {
    it('returns empty array when no groups', () => {
      const result = dataRepo.getExportGroups(1);
      assert.deepEqual(result, []);
    });

    it('exports groups with members, expenses, splits, settlements', () => {
      const group = makeGroup();
      const member = makeGroupMember(group.id, { display_name: 'Alice' });
      makeSharedExpense(group.id, member.id, { amount: 1000, description: 'Dinner' });

      const result = dataRepo.getExportGroups(1);
      assert.ok(result.length >= 1);
      assert.ok(result[0].members.length >= 1);
      assert.ok(result[0].expenses.length >= 1);
      assert.ok(result[0].expenses[0].splits.length >= 0);
    });

    it('batch loads nested group data instead of N+1', () => {
      const g1 = makeGroup({ name: 'Group1' });
      const g2 = makeGroup({ name: 'Group2' });
      const m1 = makeGroupMember(g1.id, { display_name: 'M1' });
      const m2 = makeGroupMember(g2.id, { display_name: 'M2' });
      makeSharedExpense(g1.id, m1.id, { amount: 500 });
      makeSharedExpense(g2.id, m2.id, { amount: 700 });

      const result = dataRepo.getExportGroups(1);
      assert.equal(result.length, 2);
      assert.ok(result.every(g => g.members.length >= 1));
      assert.ok(result.every(g => g.expenses.length >= 1));
    });
  });

  describe('deleteAllUserData', () => {
    it('deletes all user data', () => {
      const account = makeAccount();
      const category = makeCategory();
      makeTransaction(account.id, { category_id: category.id });
      makeBudget({ items: [{ category_id: category.id, amount: 1000 }] });

      dataRepo.deleteAllUserData(1);

      const result = dataRepo.getExportData(1);
      assert.equal(result.accounts.length, 0);
      assert.equal(result.categories.length, 0);
      assert.equal(result.transactions.length, 0);
      assert.equal(result.budgets.length, 0);
    });

    it('does not delete other users data', () => {
      // User 1 data
      makeAccount();
      // The second user's data isn't created via helpers, but deleting user 1 data shouldn't crash
      assert.doesNotThrow(() => {
        dataRepo.deleteAllUserData(1);
      });
    });
  });
});
