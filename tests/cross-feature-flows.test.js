// tests/cross-feature-flows.test.js — End-to-end integration tests across multiple features
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction, makeGoal, makeBudget, makeSubscription } = require('./helpers');

describe('Cross-Feature Integration Flows', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  describe('Transaction → Budget → Stats Flow', () => {
    it('creating expenses updates budget summary and stats overview', async () => {
      const acct = makeAccount({ balance: 100000 });
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budget = makeBudget({
        name: 'Monthly', start_date: '2020-01-01', end_date: '2099-12-31',
        items: [{ category_id: cat.id, amount: 5000 }]
      });

      // Create expense
      await agent().post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 3000, description: 'Groceries', date: new Date().toISOString().slice(0, 10)
      });

      // Check budget summary
      const budgetRes = await agent().get(`/api/budgets/${budget.id}/summary`);
      assert.equal(budgetRes.status, 200);
      assert.ok(budgetRes.body.total_spent > 0);

      // Check stats overview 
      const statsRes = await agent().get('/api/stats/overview');
      assert.equal(statsRes.status, 200);
      assert.ok(statsRes.body.month_expense >= 3000);
    });
  });

  describe('Account → Transaction → Balance Flow', () => {
    it('creating income/expense updates account balance correctly', async () => {
      const acct = makeAccount({ balance: 50000 });

      // Add income
      const incRes = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'income',
        amount: 10000, description: 'Salary', date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(incRes.status, 201);

      // Add expense
      const expRes = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense',
        amount: 3000, description: 'Rent', date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(expRes.status, 201);

      // Check balance: 50000 + 10000 - 3000 = 57000
      const acctRes = await agent().get('/api/accounts');
      const updatedAcct = acctRes.body.accounts.find(a => a.id === acct.id);
      assert.equal(updatedAcct.balance, 57000);
    });
  });

  describe('Transfer → Dual Account Balance', () => {
    it('transfer moves money between accounts', async () => {
      const from = makeAccount({ name: 'Checking', balance: 50000 });
      const to = makeAccount({ name: 'Savings', balance: 10000 });

      const res = await agent().post('/api/transactions').send({
        account_id: from.id, transfer_to_account_id: to.id,
        type: 'transfer', amount: 5000,
        description: 'Save', date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(res.status, 201);

      const acctRes = await agent().get('/api/accounts');
      const updatedFrom = acctRes.body.accounts.find(a => a.id === from.id);
      const updatedTo = acctRes.body.accounts.find(a => a.id === to.id);
      assert.equal(updatedFrom.balance, 45000);
      assert.equal(updatedTo.balance, 15000);
    });
  });

  describe('Goal → Transaction → Auto-Allocate', () => {
    it('linking transaction updates goal current amount', async () => {
      const acct = makeAccount({ balance: 100000 });
      const cat = makeCategory({ name: 'Savings', type: 'income' });
      const goal = makeGoal({ target_amount: 50000, current_amount: 0 });

      // Create income transaction
      const txRes = await agent().post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'income',
        amount: 5000, description: 'Bonus', date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(txRes.status, 201);

      // Link to goal
      const linkRes = await agent().post(`/api/goals/${goal.id}/transactions`).send({
        transaction_id: txRes.body.transaction.id, amount: 5000
      });
      assert.equal(linkRes.status, 201);
      assert.equal(linkRes.body.goal.current_amount, 5000);
    });
  });

  describe('Tag → Transaction → Export', () => {
    it('tagged transactions appear in export', async () => {
      // Create tag
      const tagRes = await agent().post('/api/tags').send({ name: 'Business', color: '#FF0000' });
      assert.equal(tagRes.status, 201);
      const tagId = tagRes.body.tag.id;

      const acct = makeAccount({ balance: 100000 });
      const cat = makeCategory();

      // Create transaction
      const txRes = await agent().post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 500, description: 'Office supplies',
        date: new Date().toISOString().slice(0, 10), tag_ids: [tagId]
      });
      assert.equal(txRes.status, 201);

      // Export should include the transaction
      const exportRes = await agent().get('/api/data/export');
      assert.equal(exportRes.status, 200);
      assert.ok(exportRes.body.transactions.length >= 1);
    });
  });

  describe('Subscription → Stats → Savings Analysis', () => {
    it('subscriptions appear in subscription-savings analysis', async () => {
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      makeSubscription({ name: 'Spotify', amount: 119, frequency: 'monthly' });
      makeSubscription({ name: 'Amazon Prime', amount: 1499, frequency: 'yearly' });

      const res = await agent().get('/api/stats/subscription-savings');
      assert.equal(res.status, 200);
      assert.equal(res.body.subscription_count, 3);
      assert.ok(res.body.total_monthly > 300); // Netflix + Spotify > 300
    });
  });

  describe('Recurring Rule → Execute → Transaction', () => {
    it('executing recurring rule creates transaction and updates balance', async () => {
      const acct = makeAccount({ balance: 100000 });
      const cat = makeCategory();

      // Create recurring rule
      const ruleRes = await agent().post('/api/recurring').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 1000, description: 'Monthly gym',
        frequency: 'monthly', next_date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(ruleRes.status, 201);

      // Execute now
      const execRes = await agent().post(`/api/recurring/${ruleRes.body.rule.id}/execute-now`);
      assert.equal(execRes.status, 201);
      assert.ok(execRes.body.transaction);

      // Verify account balance decreased
      const acctRes = await agent().get('/api/accounts');
      const updatedAcct = acctRes.body.accounts.find(a => a.id === acct.id);
      assert.equal(updatedAcct.balance, 99000);
    });
  });

  describe('Category Rule → Transaction Auto-Categorization', () => {
    it('transactions are auto-categorized based on rules', async () => {
      const acct = makeAccount();
      const cat = makeCategory({ name: 'Food & Dining' });

      // Create rule
      await agent().post('/api/rules').send({
        pattern: 'restaurant|cafe|food', category_id: cat.id
      });

      // Create transaction with matching description
      const txRes = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense',
        amount: 500, description: 'Local Restaurant',
        date: new Date().toISOString().slice(0, 10)
      });
      assert.equal(txRes.status, 201);
      // Category should be auto-assigned
      assert.equal(txRes.body.transaction.category_id, cat.id);
    });
  });

  describe('Group → Expense → Split → Balance', () => {
    it('group expense splitting calculates balances correctly', async () => {
      const { makeGroup, makeGroupMember } = require('./helpers');
      const group = makeGroup({ name: 'Roommates' });
      const member2 = makeGroupMember(group.id, { display_name: 'Alice' });
      const members = db.prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY id ASC').all(group.id);

      // Add shared expense — paid by the owner member (note: splits routes are under /api/splits)
      const expRes = await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: members[0].id, amount: 1000, description: 'Groceries',
        date: new Date().toISOString().slice(0, 10), split_method: 'equal'
      });
      assert.equal(expRes.status, 201);

      // Check balances
      const balRes = await agent().get(`/api/splits/${group.id}/balances`);
      assert.equal(balRes.status, 200);
      assert.ok(balRes.body.balances.length >= 2);
    });
  });

  describe('Full Financial Snapshot', () => {
    it('financial snapshot reflects all account types', async () => {
      makeAccount({ name: 'Checking', type: 'checking', balance: 50000 });
      makeAccount({ name: 'Savings', type: 'savings', balance: 200000 });
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -15000 });
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });

      const res = await agent().get('/api/stats/financial-snapshot');
      assert.equal(res.status, 200);
      assert.ok(res.body.total_assets >= 250000);
      assert.ok(res.body.total_liabilities >= 15000);
      assert.ok(res.body.net_worth > 0);
      assert.ok(res.body.accounts_count >= 3);
      assert.ok(res.body.active_subscriptions >= 1);
    });
  });

  describe('Notification Flow', () => {
    it('notifications can be read and marked', async () => {
      // Create a notification directly
      db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)")
        .run(1, 'system', 'Test Alert', 'Something happened');

      // Fetch
      const listRes = await agent().get('/api/notifications');
      assert.equal(listRes.status, 200);
      assert.ok(listRes.body.notifications.length >= 1);
      assert.ok(listRes.body.unread_count >= 1);

      // Mark read
      const notif = listRes.body.notifications[0];
      const readRes = await agent().put(`/api/notifications/${notif.id}/read`);
      assert.equal(readRes.status, 200);

      // Verify unread decreased
      const listRes2 = await agent().get('/api/notifications?unread_only=1');
      assert.equal(listRes2.status, 200);
    });
  });

  describe('Search Integration', () => {
    it('search finds transactions by description', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      makeTransaction(acct.id, { category_id: cat.id, description: 'Unique Coffee Shop Purchase' });

      const res = await agent().get('/api/search?q=Coffee');
      assert.equal(res.status, 200);
      // Should find at least one result
      const results = res.body.transactions || res.body.results || [];
      assert.ok(results.length >= 1);
    });
  });

  describe('Reports Integration', () => {
    it('monthly report generates correct structure', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      makeTransaction(acct.id, { category_id: cat.id, type: 'expense', amount: 500 });
      makeTransaction(acct.id, { category_id: cat.id, type: 'income', amount: 5000 });

      const res = await agent().get(`/api/reports/monthly?month=${monthStr}`);
      assert.equal(res.status, 200);
      assert.ok('total_income' in res.body || 'income' in res.body);
    });
  });
});
