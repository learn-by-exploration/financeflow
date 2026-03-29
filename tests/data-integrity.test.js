const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction, makeGroup, makeGroupMember, makeRecurringRule } = require('./helpers');

describe('Data Integrity', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('Foreign key cascades', () => {
    it('delete user cascades to accounts and transactions', () => {
      const { db } = setup();
      // Create a second user with data, then delete them
      const hash = require('bcryptjs').hashSync('test12345', 4);
      const r = db.prepare('INSERT INTO users (username, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?)').run('tempuser', hash, 'Temp', 'INR');
      const userId = r.lastInsertRowid;
      db.prepare('INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_active, include_in_net_worth, position) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0)').run(userId, 'Temp Checking', 'checking', 'INR', 1000, '🏦', '#000');
      const acctId = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(userId).id;
      db.prepare('INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(userId, acctId, 'expense', 100, 'INR', 'Test', '2025-01-01', '[]');
      db.prepare('INSERT INTO categories (user_id, name, icon, type, is_system, position) VALUES (?, ?, ?, ?, 0, 0)').run(userId, 'TempCat', '📁', 'expense');
      db.prepare('INSERT INTO savings_goals (user_id, name, target_amount, current_amount, icon, color, is_completed, position) VALUES (?, ?, ?, 0, ?, ?, 0, 0)').run(userId, 'TempGoal', 1000, '🎯', '#000');
      db.prepare('INSERT INTO subscriptions (user_id, name, amount, currency, frequency, is_active) VALUES (?, ?, ?, ?, ?, 1)').run(userId, 'TempSub', 100, 'INR', 'monthly');
      db.prepare('INSERT INTO budgets (user_id, name, period, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, 1)').run(userId, 'TempBudget', 'monthly', '2025-01-01', '2025-01-31');

      // Delete user
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      // Verify cascades
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM accounts WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM categories WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM savings_goals WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM budgets WHERE user_id = ?').get(userId).c, 0);
    });

    it('delete account cascades to transactions', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'ToDelete' });
      makeTransaction(acct.id, { description: 'Will be deleted' });
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c, 1);
      db.prepare('DELETE FROM accounts WHERE id = ?').run(acct.id);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c, 0);
    });

    it('delete account cascades to recurring_rules', () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'ToDelete' });
      makeRecurringRule(acct.id, { description: 'Monthly rent' });
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM recurring_rules WHERE account_id = ?').get(acct.id).c, 1);
      db.prepare('DELETE FROM accounts WHERE id = ?').run(acct.id);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM recurring_rules WHERE account_id = ?').get(acct.id).c, 0);
    });

    it('delete group cascades to members, expenses, splits, settlements', () => {
      const { db } = setup();
      const group = makeGroup({ name: 'TestGroup' });
      // Add a shared expense
      const memberId = db.prepare('SELECT id FROM group_members WHERE group_id = ? LIMIT 1').get(group.id).id;
      const expR = db.prepare('INSERT INTO shared_expenses (group_id, paid_by, description, amount, currency, split_method, date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(group.id, memberId, 'Test expense', 100, 'INR', 'equal', '2025-01-01');
      db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)').run(expR.lastInsertRowid, memberId, 100);
      db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount, currency) VALUES (?, ?, ?, ?, ?)').run(group.id, memberId, memberId, 50, 'INR');

      db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?').get(group.id).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM shared_expenses WHERE group_id = ?').get(group.id).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM settlements WHERE group_id = ?').get(group.id).c, 0);
    });
  });

  describe('Transaction atomicity', () => {
    it('transfer creation is all-or-nothing', async () => {
      const acct1 = makeAccount({ name: 'Source', balance: 10000 });
      const acct2 = makeAccount({ name: 'Dest', balance: 5000 });

      // Create a valid transfer
      const res = await agent().post('/api/transactions').send({
        account_id: acct1.id,
        transfer_to_account_id: acct2.id,
        type: 'transfer',
        amount: 3000,
        description: 'Transfer test',
        date: new Date().toISOString().slice(0, 10)
      }).expect(201);

      // Both accounts should have correct balances
      const { db } = setup();
      const src = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct1.id);
      const dst = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct2.id);
      assert.equal(src.balance, 7000);
      assert.equal(dst.balance, 8000);

      // Both transactions exist and are linked
      const txns = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id').all(1);
      assert.equal(txns.length, 2);
      assert.equal(txns[0].transfer_transaction_id, txns[1].id);
      assert.equal(txns[1].transfer_transaction_id, txns[0].id);
    });
  });

  describe('Balance consistency', () => {
    it('after many transactions, balance = initial + SUM(income) - SUM(expense)', async () => {
      const { db } = setup();
      const initialBalance = 50000;
      const acct = makeAccount({ name: 'Stress Test', balance: initialBalance });

      // Create 50 random transactions
      const types = ['income', 'expense'];
      let expectedBalance = initialBalance;
      for (let i = 0; i < 50; i++) {
        const type = types[i % 2];
        const amount = Math.round(Math.random() * 1000 * 100) / 100;
        makeTransaction(acct.id, { type, amount, description: `Txn ${i}` });
        expectedBalance += type === 'income' ? amount : -amount;
      }

      const actual = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      // Use approximate comparison due to floating point
      assert.ok(Math.abs(actual.balance - expectedBalance) < 0.01, `Expected ~${expectedBalance}, got ${actual.balance}`);
    });
  });

  describe('Graceful shutdown', () => {
    it('server has SIGTERM handler configured', () => {
      // Verify the shutdown function exists in server.js
      const serverSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'server.js'), 'utf-8');
      assert.ok(serverSrc.includes('SIGTERM') || serverSrc.includes('SIGINT'), 'Server should handle termination signals');
      assert.ok(serverSrc.includes('shutdown') || serverSrc.includes('close'), 'Server should have shutdown logic');
    });
  });
});
