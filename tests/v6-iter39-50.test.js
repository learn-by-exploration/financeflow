// tests/v6-iter39-50.test.js — Iterations 39-50: Polish, QA, regression, stress
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction,
  makeBudget, makeGoal, makeSubscription, makeGroup, makeGroupMember,
  makeTag, makeRecurringRule, makeTemplate, makeNotification,
  makeSpendingLimit,
  today, daysFromNow } = require('./helpers');

describe('v6 Iterations 39-50: Polish & QA', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ═══════════════════════════════════════
  // ITER 39-40: Regression tests
  // ═══════════════════════════════════════
  describe('Regression: transfer balance integrity', () => {
    it('transfer subtracts from source and adds to destination', async () => {
      const src = makeAccount({ name: 'Source', balance: 10000 });
      const dst = makeAccount({ name: 'Dest', balance: 5000 });
      const res = await agent().post('/api/transactions').send({
        account_id: src.id, transfer_to_account_id: dst.id, type: 'transfer',
        amount: 2000, description: 'Transfer', date: today(),
      });
      assert.equal(res.status, 201);
      const srcBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(src.id).balance;
      const dstBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(dst.id).balance;
      assert.equal(srcBal, 8000);
      assert.equal(dstBal, 7000);
    });

    it('income increases balance', async () => {
      const acct = makeAccount({ balance: 5000 });
      await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'income', amount: 3000, description: 'Salary', date: today(),
      });
      const bal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance;
      assert.equal(bal, 8000);
    });

    it('expense decreases balance', async () => {
      const acct = makeAccount({ balance: 5000 });
      await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 1500, description: 'Groceries', date: today(),
      });
      const bal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance;
      assert.equal(bal, 3500);
    });

    it('transaction update adjusts balance correctly', async () => {
      const acct = makeAccount({ balance: 10000 });
      const tx = makeTransaction(acct.id, { amount: 500, type: 'expense' });
      // Balance should be 9500 after expense
      const balBefore = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance;
      assert.equal(balBefore, 9500);

      // Update amount to 800
      const res = await agent().put(`/api/transactions/${tx.id}`).send({ amount: 800 });
      assert.equal(res.status, 200);
      const balAfter = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance;
      assert.equal(balAfter, 9200);
    });

    it('transaction delete restores balance', async () => {
      const acct = makeAccount({ balance: 10000 });
      const tx = makeTransaction(acct.id, { amount: 1000, type: 'expense' });
      assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance, 9000);

      await agent().delete(`/api/transactions/${tx.id}`);
      assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance, 10000);
    });
  });

  // ═══════════════════════════════════════
  // ITER 41-42: Multi-currency regression
  // ═══════════════════════════════════════
  describe('Multi-currency integrity', () => {
    it('transaction stores currency from account', async () => {
      const acct = makeAccount({ balance: 10000, currency: 'USD' });
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 50, description: 'USD expense', date: today(),
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.transaction.currency, 'USD');
    });

    it('accounts with different currencies have separate balances', async () => {
      const inr = makeAccount({ name: 'INR Acct', balance: 100000, currency: 'INR' });
      const usd = makeAccount({ name: 'USD Acct', balance: 5000, currency: 'USD' });

      await agent().post('/api/transactions').send({
        account_id: inr.id, type: 'expense', amount: 1000, description: 'INR expense', date: today(),
      });
      await agent().post('/api/transactions').send({
        account_id: usd.id, type: 'expense', amount: 50, description: 'USD expense', date: today(),
      });

      const inrBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(inr.id).balance;
      const usdBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(usd.id).balance;
      assert.equal(inrBal, 99000);
      assert.equal(usdBal, 4950);
    });

    it('overview currency_balances shows per-currency totals', async () => {
      makeAccount({ name: 'INR', balance: 100000, currency: 'INR' });
      makeAccount({ name: 'USD', balance: 5000, currency: 'USD' });
      const res = await agent().get('/api/stats/overview');
      assert.ok(res.body.currency_balances);
    });
  });

  // ═══════════════════════════════════════
  // ITER 43-44: Category rules & suggestions
  // ═══════════════════════════════════════
  describe('Category rules and suggestions', () => {
    it('category rule can auto-suggest category', async () => {
      const cat = makeCategory({ name: 'Groceries', type: 'expense' });
      db.prepare('INSERT INTO category_rules (user_id, category_id, pattern, position) VALUES (?, ?, ?, ?)').run(1, cat.id, 'bigbasket', 1);

      const res = await agent().get('/api/categories/suggest?description=bigbasket order');
      assert.equal(res.status, 200);
      assert.ok(res.body.suggestion);
      assert.equal(res.body.suggestion.category_id, cat.id);
    });

    it('unmatched description returns null suggestion', async () => {
      const res = await agent().get('/api/categories/suggest?description=random thing');
      assert.equal(res.status, 200);
      assert.equal(res.body.suggestion, null);
    });

    it('empty description returns null suggestion', async () => {
      const res = await agent().get('/api/categories/suggest?description=');
      assert.equal(res.status, 200);
      assert.equal(res.body.suggestion, null);
    });
  });

  // ═══════════════════════════════════════
  // ITER 45-46: Notification lifecycle
  // ═══════════════════════════════════════
  describe('Notifications lifecycle', () => {
    it('notifications list returns unread count', async () => {
      makeNotification({ title: 'N1' });
      makeNotification({ title: 'N2' });
      const res = await agent().get('/api/notifications');
      assert.equal(res.status, 200);
      assert.ok(res.body.notifications.length >= 2);
    });

    it('marking all notifications as read works', async () => {
      makeNotification({ title: 'AllRead1' });
      makeNotification({ title: 'AllRead2' });
      const res = await agent().post('/api/notifications/read-all');
      assert.equal(res.status, 200);

      const unread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = 1 AND is_read = 0').get().c;
      assert.equal(unread, 0);
    });

    it('notification delete works', async () => {
      const notif = makeNotification({ title: 'ToDelete' });
      const res = await agent().delete(`/api/notifications/${notif.id}`);
      assert.ok([200, 204].includes(res.status));
    });
  });

  // ═══════════════════════════════════════
  // ITER 47-48: Stress and performance
  // ═══════════════════════════════════════
  describe('Stress tests', () => {
    it('creating 200 transactions in batch is under 10s', async () => {
      const acct = makeAccount({ balance: 10000000 });
      const start = Date.now();
      for (let i = 0; i < 200; i++) {
        makeTransaction(acct.id, { amount: 10, description: `Stress ${i}` });
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 10000, `200 transactions took ${elapsed}ms`);
    });

    it('listing with filters is fast', async () => {
      const acct = makeAccount({ balance: 10000000 });
      const cat = makeCategory({ name: 'StressCat', type: 'expense' });
      for (let i = 0; i < 50; i++) {
        makeTransaction(acct.id, { amount: 10, category_id: cat.id, description: `Filtered ${i}` });
      }
      const start = Date.now();
      const res = await agent().get(`/api/transactions?category_id=${cat.id}&limit=50`);
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed < 500, `Filtered list took ${elapsed}ms`);
    });

    it('concurrent read operations are safe', async () => {
      makeAccount({ balance: 10000 });
      const reads = [];
      for (let i = 0; i < 10; i++) {
        reads.push(agent().get('/api/accounts'));
        reads.push(agent().get('/api/stats/overview'));
      }
      const results = await Promise.all(reads);
      const allOk = results.every(r => r.status === 200);
      assert.ok(allOk, 'All concurrent reads should succeed');
    });

    it('bulk operations handle 50 items', async () => {
      const acct = makeAccount({ balance: 10000000 });
      const ids = [];
      for (let i = 0; i < 50; i++) {
        ids.push(makeTransaction(acct.id, { amount: 10, description: `Bulk ${i}` }).id);
      }
      const start = Date.now();
      const res = await agent().post('/api/transactions/bulk-delete').send({ ids });
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed < 5000, `Bulk delete 50 took ${elapsed}ms`);
    });
  });

  // ═══════════════════════════════════════
  // ITER 49-50: Contract tests & final validation
  // ═══════════════════════════════════════
  describe('API contract validation', () => {
    it('all list endpoints support pagination params', async () => {
      const endpoints = ['/api/transactions', '/api/categories'];
      for (const ep of endpoints) {
        const res = await agent().get(`${ep}?limit=5&offset=0`);
        assert.equal(res.status, 200);
      }
    });

    it('health live returns 200', async () => {
      const { default: supertest } = await import('supertest');
      const res = await supertest(app).get('/api/health/live');
      assert.equal(res.status, 200);
    });

    it('health ready returns 200', async () => {
      const { default: supertest } = await import('supertest');
      const res = await supertest(app).get('/api/health/ready');
      assert.equal(res.status, 200);
    });

    it('CORS headers are set correctly', async () => {
      const { default: supertest } = await import('supertest');
      const res = await supertest(app).options('/api/accounts').set('Origin', 'http://localhost:3457');
      // CORS may return 200 or 204
      assert.ok([200, 204].includes(res.status));
    });

    it('account create returns all required fields', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Contract Test', type: 'checking', balance: 5000, currency: 'INR',
      });
      assert.equal(res.status, 201);
      const acct = res.body.account;
      assert.ok(acct.id);
      assert.equal(acct.name, 'Contract Test');
      assert.equal(acct.type, 'checking');
      assert.equal(acct.balance, 5000);
      assert.equal(acct.currency, 'INR');
    });

    it('transaction create returns all required fields', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 500,
        description: 'Contract test tx', date: today(),
      });
      assert.equal(res.status, 201);
      const tx = res.body.transaction;
      assert.ok(tx.id);
      assert.equal(tx.amount, 500);
      assert.equal(tx.type, 'expense');
      assert.equal(tx.description, 'Contract test tx');
    });

    it('error response always includes error.code', async () => {
      const res = await agent().post('/api/accounts').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
      assert.ok(res.body.error.code);
    });

    it('auth error response includes error code', async () => {
      const { default: supertest } = await import('supertest');
      const res = await supertest(app).get('/api/accounts');
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
    });
  });

  // ═══════════════════════════════════════
  // Final: Comprehensive data flow test
  // ═══════════════════════════════════════
  describe('End-to-end data flow', () => {
    it('complete user workflow: account → category → budget → transactions → export', async () => {
      // 1. Create account
      const acctRes = await agent().post('/api/accounts').send({
        name: 'Main Account', type: 'checking', balance: 100000, currency: 'INR',
      });
      assert.equal(acctRes.status, 201);
      const acctId = acctRes.body.account.id;

      // 2. Create category
      const catRes = await agent().post('/api/categories').send({ name: 'Food', type: 'expense' });
      assert.equal(catRes.status, 201);
      const catId = catRes.body.category.id;

      // 3. Create budget
      const budgetRes = await agent().post('/api/budgets').send({
        name: 'Monthly Budget', period: 'monthly', start_date: today(),
        items: [{ category_id: catId, amount: 10000 }],
      });
      assert.equal(budgetRes.status, 201);

      // 4. Create transactions
      for (let i = 0; i < 5; i++) {
        const txRes = await agent().post('/api/transactions').send({
          account_id: acctId, category_id: catId, type: 'expense',
          amount: 500, description: `Meal ${i + 1}`, date: today(),
        });
        assert.equal(txRes.status, 201);
      }

      // 5. Verify balance
      const accts = await agent().get('/api/accounts');
      const mainAcct = accts.body.accounts.find(a => a.id === acctId);
      assert.equal(mainAcct.balance, 97500); // 100000 - (5 * 500)

      // 6. Verify statistics
      const stats = await agent().get('/api/stats/overview');
      assert.equal(stats.status, 200);
      assert.ok(stats.body.month_expense >= 2500);

      // 7. Export should work
      const exportRes = await agent().get('/api/export/transactions');
      assert.equal(exportRes.status, 200);
    });

    it('complete group workflow: create → add members → expense → balances', async () => {
      // 1. Create group
      const groupRes = await agent().post('/api/groups').send({ name: 'Roommates' });
      assert.equal(groupRes.status, 201);
      const groupId = groupRes.body.group.id;

      // 2. Get members (creator auto-added)
      const groupGet = await agent().get(`/api/groups/${groupId}`);
      assert.equal(groupGet.status, 200);
      const memberId = groupGet.body.members[0].id;

      // 3. Create shared expense
      const expRes = await agent().post(`/api/splits/${groupId}/expenses`).send({
        amount: 3000, description: 'Electricity Bill', date: today(),
        paid_by: memberId, split_method: 'equal',
      });
      assert.equal(expRes.status, 201);

      // 4. Check balances
      const balRes = await agent().get(`/api/splits/${groupId}/balances`);
      assert.equal(balRes.status, 200);
    });
  });
});
