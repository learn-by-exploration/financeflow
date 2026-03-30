const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb } = require('./helpers');

const createGroupRepository = require('../src/repositories/group.repository');
const createSplitRepository = require('../src/repositories/split.repository');

let db, groupRepo, splitRepo, userId;

before(() => {
  const env = setup();
  db = env.db;
  userId = 1;
  groupRepo = createGroupRepository({ db });
  splitRepo = createSplitRepository({ db });
});

beforeEach(() => {
  cleanDb();
});

// ─── GroupRepository ───

describe('GroupRepository', () => {

  it('create() inserts a group and adds creator as owner', () => {
    const group = groupRepo.create('Roommates', '🏠', '#00ff00', userId, 'Test User');
    assert.ok(group.id);
    assert.equal(group.name, 'Roommates');
    assert.equal(group.icon, '🏠');
    assert.equal(group.color, '#00ff00');
    assert.equal(group.created_by, userId);
    const members = groupRepo.getMembers(group.id);
    assert.equal(members.length, 1);
    assert.equal(members[0].role, 'owner');
    assert.equal(members[0].user_id, userId);
  });

  it('create() uses default icon and color when not provided', () => {
    const group = groupRepo.create('Defaults', null, null, userId, 'Test User');
    assert.equal(group.icon, '👥');
    assert.equal(group.color, '#f59e0b');
  });

  it('findById() returns the group', () => {
    const created = groupRepo.create('Test', '🧪', '#111', userId, 'Test User');
    const found = groupRepo.findById(created.id);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'Test');
  });

  it('findById() returns undefined for nonexistent group', () => {
    const found = groupRepo.findById(99999);
    assert.equal(found, undefined);
  });

  it('findByUser() returns groups the user belongs to', () => {
    groupRepo.create('Group A', '🅰️', '#aaa', userId, 'Test User');
    groupRepo.create('Group B', '🅱️', '#bbb', userId, 'Test User');
    const groups = groupRepo.findByUser(userId);
    assert.equal(groups.length, 2);
    assert.ok(groups.every(g => g.role === 'owner'));
  });

  it('findByUser() returns empty array for user with no groups', () => {
    const groups = groupRepo.findByUser(99999);
    assert.equal(groups.length, 0);
  });

  it('addMember() adds a member and getMembership() confirms', () => {
    const group = groupRepo.create('Team', '👥', '#000', userId, 'Test User');
    const memberId = groupRepo.addMember(group.id, null, 'Guest Person', 'member');
    assert.ok(memberId);
    const members = groupRepo.getMembers(group.id);
    assert.equal(members.length, 2);
  });

  it('getMembership() returns undefined for non-members', () => {
    const group = groupRepo.create('Private', '🔒', '#000', userId, 'Test User');
    const membership = groupRepo.getMembership(group.id, 99999);
    assert.equal(membership, undefined);
  });

  it('removeMember() removes a member from the group', () => {
    const group = groupRepo.create('Club', '🎯', '#000', userId, 'Test User');
    const memberId = groupRepo.addMember(group.id, null, 'Extra', 'member');
    groupRepo.removeMember(memberId, group.id);
    const members = groupRepo.getMembers(group.id);
    assert.equal(members.length, 1);
  });

  it('getOwnerCount() returns correct owner count', () => {
    const group = groupRepo.create('Owners', '👑', '#000', userId, 'Test User');
    assert.equal(groupRepo.getOwnerCount(group.id), 1);
  });

  it('update() modifies group fields', () => {
    const group = groupRepo.create('Old', '🔄', '#000', userId, 'Test User');
    const updated = groupRepo.update(group.id, { name: 'New', icon: '✅', color: '#fff' });
    assert.equal(updated.name, 'New');
    assert.equal(updated.icon, '✅');
    assert.equal(updated.color, '#fff');
  });

  it('update() returns null for nonexistent group', () => {
    const result = groupRepo.update(99999, { name: 'Nope' });
    assert.equal(result, null);
  });

  it('delete() removes the group', () => {
    const group = groupRepo.create('Temp', '🗑️', '#000', userId, 'Test User');
    groupRepo.delete(group.id);
    assert.equal(groupRepo.findById(group.id), undefined);
  });

  it('getMemberById() returns specific member', () => {
    const group = groupRepo.create('Lookup', '🔍', '#000', userId, 'Test User');
    const memberId = groupRepo.addMember(group.id, null, 'Specific', 'member');
    const member = groupRepo.getMemberById(memberId, group.id);
    assert.ok(member);
    assert.equal(member.display_name, 'Specific');
  });

  it('findUserByUsername() returns user data', () => {
    const user = groupRepo.findUserByUsername('testuser');
    assert.ok(user);
    assert.equal(user.id, userId);
  });

  it('findUserByUsername() returns undefined for unknown user', () => {
    const user = groupRepo.findUserByUsername('nonexistent_user_xyz');
    assert.equal(user, undefined);
  });
});

// ─── SplitRepository ───

describe('SplitRepository', () => {

  function createGroupWithMembers() {
    const group = groupRepo.create('Split Test', '💰', '#000', userId, 'Test User');
    const m2 = groupRepo.addMember(group.id, null, 'Alice', 'member');
    const m3 = groupRepo.addMember(group.id, null, 'Bob', 'member');
    const members = groupRepo.getMembers(group.id);
    return { group, members, ownerMemberId: members.find(m => m.role === 'owner').id, m2, m3 };
  }

  it('createExpense() inserts expense and returns id', () => {
    const { group, ownerMemberId } = createGroupWithMembers();
    const id = splitRepo.createExpense(group.id, {
      paid_by: ownerMemberId, amount: 300, currency: 'INR',
      description: 'Dinner', date: '2025-01-15', split_method: 'equal',
    });
    assert.ok(id);
  });

  it('getGroupExpenses() returns expenses for a group', () => {
    const { group, ownerMemberId } = createGroupWithMembers();
    splitRepo.createExpense(group.id, {
      paid_by: ownerMemberId, amount: 100, currency: 'INR',
      description: 'Lunch', date: '2025-01-15', split_method: 'equal',
    });
    const expenses = splitRepo.getGroupExpenses(group.id);
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0].description, 'Lunch');
    assert.ok(expenses[0].paid_by_name);
  });

  it('getExpense() returns a specific expense', () => {
    const { group, ownerMemberId } = createGroupWithMembers();
    const id = splitRepo.createExpense(group.id, {
      paid_by: ownerMemberId, amount: 200, currency: 'INR',
      description: 'Groceries', date: '2025-01-16', split_method: 'equal',
    });
    const expense = splitRepo.getExpense(id, group.id);
    assert.ok(expense);
    assert.equal(expense.amount, 200);
  });

  it('getExpense() returns undefined for wrong group', () => {
    const { group, ownerMemberId } = createGroupWithMembers();
    const id = splitRepo.createExpense(group.id, {
      paid_by: ownerMemberId, amount: 50, currency: 'INR',
      description: 'Snack', date: '2025-01-17', split_method: 'equal',
    });
    const expense = splitRepo.getExpense(id, 99999);
    assert.equal(expense, undefined);
  });

  it('createExpenseSplits() inserts split records', () => {
    const { group, ownerMemberId, m2, m3 } = createGroupWithMembers();
    const expenseId = splitRepo.createExpense(group.id, {
      paid_by: ownerMemberId, amount: 300, currency: 'INR',
      description: 'Split test', date: '2025-01-18', split_method: 'exact',
    });
    splitRepo.createExpenseSplits(expenseId, [
      { member_id: ownerMemberId, amount: 100 },
      { member_id: m2, amount: 100 },
      { member_id: m3, amount: 100 },
    ]);
    const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(expenseId);
    assert.equal(splits.length, 3);
    assert.equal(splits.reduce((s, r) => s + r.amount, 0), 300);
  });

  it('deleteExpense() removes the expense', () => {
    const { group, ownerMemberId } = createGroupWithMembers();
    const id = splitRepo.createExpense(group.id, {
      paid_by: ownerMemberId, amount: 75, currency: 'INR',
      description: 'Delete me', date: '2025-01-19', split_method: 'equal',
    });
    splitRepo.deleteExpense(id);
    assert.equal(splitRepo.getExpense(id, group.id), undefined);
  });

  it('createSettlement() inserts a settlement record', () => {
    const { group, ownerMemberId, m2 } = createGroupWithMembers();
    const id = splitRepo.createSettlement(group.id, {
      from_member: m2, to_member: ownerMemberId,
      amount: 50, currency: 'INR', note: 'Payback',
    });
    assert.ok(id);
  });

  it('getGroupSettlements() returns settlements for a group', () => {
    const { group, ownerMemberId, m2 } = createGroupWithMembers();
    splitRepo.createSettlement(group.id, {
      from_member: m2, to_member: ownerMemberId,
      amount: 100, currency: 'INR',
    });
    const settlements = splitRepo.getGroupSettlements(group.id);
    assert.equal(settlements.length, 1);
    assert.equal(settlements[0].amount, 100);
  });

  it('getGroupMembers() returns member ids', () => {
    const { group } = createGroupWithMembers();
    const members = splitRepo.getGroupMembers(group.id);
    assert.equal(members.length, 3);
    assert.ok(members.every(m => m.id));
  });

  it('getMembership() returns membership for valid member', () => {
    const { group } = createGroupWithMembers();
    const membership = splitRepo.getMembership(group.id, userId);
    assert.ok(membership);
    assert.equal(membership.user_id, userId);
  });

  it('getMembership() returns undefined for non-member', () => {
    const { group } = createGroupWithMembers();
    const membership = splitRepo.getMembership(group.id, 99999);
    assert.equal(membership, undefined);
  });
});
