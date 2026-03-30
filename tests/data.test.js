const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction, makeBudget, makeSubscription, makeGoal, makeGroup, makeGroupMember, makeSharedExpense, makeRecurringRule, makeSecondUser } = require('./helpers');

describe('Data Portability', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/data/export', () => {
    it('returns complete JSON with all user data', async () => {
      const acct = makeAccount({ name: 'Savings' });
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      makeTransaction(acct.id, { category_id: cat.id, description: 'Lunch' });
      makeBudget({ name: 'Monthly' });
      makeGoal({ name: 'Vacation', target_amount: 50000 });
      makeSubscription({ name: 'Netflix', amount: 499, frequency: 'monthly' });

      const res = await agent().get('/api/data/export').expect(200);
      assert.ok(Array.isArray(res.body.accounts));
      assert.ok(Array.isArray(res.body.transactions));
      assert.ok(Array.isArray(res.body.categories));
      assert.ok(Array.isArray(res.body.budgets));
      assert.ok(Array.isArray(res.body.goals));
      assert.ok(Array.isArray(res.body.subscriptions));
      assert.ok(Array.isArray(res.body.settings));
      assert.ok(Array.isArray(res.body.rules));
      assert.ok(res.body.accounts.length >= 1);
      assert.ok(res.body.transactions.length >= 1);
    });

    it('includes nested data (budget_items within budgets)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      makeBudget({ name: 'Monthly', items: [{ category_id: cat.id, amount: 5000 }] });
      const res = await agent().get('/api/data/export').expect(200);
      assert.ok(res.body.budgets[0].items);
      assert.ok(res.body.budgets[0].items.length >= 1);
    });

    it('excludes password_hash, session tokens, audit_log', async () => {
      const res = await agent().get('/api/data/export').expect(200);
      assert.equal(res.body.sessions, undefined);
      assert.equal(res.body.audit_log, undefined);
      // Check user info doesn't contain password_hash
      if (res.body.user) {
        assert.equal(res.body.user.password_hash, undefined);
      }
    });
  });

  describe('POST /api/data/import', () => {
    it('requires password confirmation (403 without)', async () => {
      await agent().post('/api/data/import').send({ accounts: [] }).expect(403);
    });

    it('replaces all data with imported data', async () => {
      // Create some initial data
      makeAccount({ name: 'Old Account' });

      // Export, then import with new data
      const exportRes = await agent().get('/api/data/export').expect(200);
      const importData = exportRes.body;
      importData.accounts = [{ name: 'New Checking', type: 'checking', currency: 'INR', balance: 75000, icon: '🏦', color: '#000', is_active: 1, include_in_net_worth: 1, position: 0 }];
      importData.transactions = [];

      const res = await agent().post('/api/data/import').send({ password: 'testpassword', confirm: 'DELETE ALL DATA', data: importData }).expect(200);
      assert.ok(res.body.ok);

      // Verify data replaced
      const accounts = await agent().get('/api/accounts').expect(200);
      assert.equal(accounts.body.accounts.length, 1);
      assert.equal(accounts.body.accounts[0].name, 'New Checking');
    });

    it('remaps category IDs in transactions correctly', async () => {
      const cat = makeCategory({ name: 'Unique Cat', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { category_id: cat.id, description: 'Test' });

      const exportRes = await agent().get('/api/data/export').expect(200);
      const importData = exportRes.body;

      const res = await agent().post('/api/data/import').send({ password: 'testpassword', confirm: 'DELETE ALL DATA', data: importData }).expect(200);
      assert.ok(res.body.ok);

      // Verify transactions have valid category references
      const txns = await agent().get('/api/transactions').expect(200);
      for (const t of txns.body.transactions) {
        if (t.category_id) {
          // Category should exist
          const { db } = setup();
          const catExists = db.prepare('SELECT id FROM categories WHERE id = ?').get(t.category_id);
          assert.ok(catExists, `category_id ${t.category_id} should exist`);
        }
      }
    });

    it('atomic — failure rolls back everything', async () => {
      makeAccount({ name: 'Original Account' });
      // Send malformed import data that should cause failure
      const res = await agent().post('/api/data/import').send({
        password: 'testpassword',
        confirm: 'DELETE ALL DATA',
        data: { accounts: [{ name: null }], categories: 'invalid' }
      });
      // Should fail
      assert.ok(res.status >= 400);
      // Original data should still exist
      const accounts = await agent().get('/api/accounts').expect(200);
      assert.equal(accounts.body.accounts.length, 1);
      assert.equal(accounts.body.accounts[0].name, 'Original Account');
    });

    it('rejects wrong password (403)', async () => {
      await agent().post('/api/data/import').send({ password: 'wrongpassword', data: {} }).expect(403);
    });
  });

  describe('GET /api/data/csv-template', () => {
    it('returns CSV file with header row and examples', async () => {
      const res = await agent().get('/api/data/csv-template').expect(200);
      assert.ok(res.headers['content-type'].includes('text/csv'));
      assert.ok(res.headers['content-disposition'].includes('attachment'));
      assert.ok(res.text.includes('date'));
      assert.ok(res.text.includes('description'));
      assert.ok(res.text.includes('amount'));
      assert.ok(res.text.includes('type'));
    });
  });

  describe('POST /api/data/csv-import', () => {
    it('imports CSV matching template format', async () => {
      const acct = makeAccount({ name: 'Checking', balance: 0 });
      const csv = 'date,description,amount,type,category\n2025-01-15,Salary,50000,income,\n2025-01-16,Lunch,500,expense,\n';
      const res = await agent()
        .post(`/api/data/csv-import?account_id=${acct.id}`)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(200);
      assert.equal(res.body.imported, 2);
    });

    it('rejects CSV with wrong column headers (400)', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const csv = 'wrong,columns,here\n1,2,3\n';
      await agent()
        .post(`/api/data/csv-import?account_id=${acct.id}`)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(400);
    });

    it('auto-categorizes using rules engine', async () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking', balance: 0 });
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, 0)').run(1, 'swiggy|zomato', cat.id);

      const csv = 'date,description,amount,type,category\n2025-01-15,Swiggy order,500,expense,\n';
      const res = await agent()
        .post(`/api/data/csv-import?account_id=${acct.id}`)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(200);
      assert.equal(res.body.categorized, 1);
    });

    it('requires account_id query param', async () => {
      const csv = 'date,description,amount,type,category\n2025-01-15,Test,100,expense,\n';
      await agent()
        .post('/api/data/csv-import')
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(400);
    });

    it('returns imported=0 for empty CSV', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const csv = 'date,description,amount,type,category\n';
      const res = await agent()
        .post(`/api/data/csv-import?account_id=${acct.id}`)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(200);
      assert.equal(res.body.imported, 0);
    });

    it('ignores extra columns gracefully', async () => {
      const acct = makeAccount({ name: 'Checking', balance: 0 });
      const csv = 'date,description,amount,type,category,extra_col\n2025-01-15,Test,100,expense,,whatever\n';
      const res = await agent()
        .post(`/api/data/csv-import?account_id=${acct.id}`)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(200);
      assert.equal(res.body.imported, 1);
    });

    it('rejects non-existent account_id (400)', async () => {
      const csv = 'date,description,amount,type,category\n2025-01-15,Test,100,expense,\n';
      await agent()
        .post('/api/data/csv-import?account_id=99999')
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(400);
    });

    it('rejects account_id belonging to another user', async () => {
      const acct = makeAccount({ name: 'My Account' });
      const { agent: agentB } = makeSecondUser();
      const csv = 'date,description,amount,type,category\n2025-01-15,Test,100,expense,\n';
      await agentB
        .post(`/api/data/csv-import?account_id=${acct.id}`)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(400);
    });
  });

  describe('Import recurring_rules and groups round-trip', () => {
    it('preserves recurring_rules through export/import', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeRecurringRule(acct.id, { description: 'Monthly Rent', frequency: 'monthly', amount: 15000 });

      const exportRes = await agent().get('/api/data/export').expect(200);
      assert.ok(exportRes.body.recurring_rules.length >= 1);

      const importRes = await agent().post('/api/data/import').send({
        password: 'testpassword', confirm: 'DELETE ALL DATA', data: exportRes.body
      }).expect(200);
      assert.ok(importRes.body.ok);

      const checkRes = await agent().get('/api/data/export').expect(200);
      assert.ok(checkRes.body.recurring_rules.length >= 1);
      assert.ok(checkRes.body.recurring_rules.some(r => r.description === 'Monthly Rent'));
    });

    it('preserves groups through export/import', async () => {
      const group = makeGroup({ name: 'Roommates' });
      makeGroupMember(group.id, { display_name: 'Guest' });

      const exportRes = await agent().get('/api/data/export').expect(200);
      assert.ok(exportRes.body.groups.length >= 1);
      assert.ok(exportRes.body.groups[0].members.length >= 1);

      const importRes = await agent().post('/api/data/import').send({
        password: 'testpassword', confirm: 'DELETE ALL DATA', data: exportRes.body
      }).expect(200);
      assert.ok(importRes.body.ok);

      const checkRes = await agent().get('/api/data/export').expect(200);
      assert.ok(checkRes.body.groups.length >= 1);
      assert.ok(checkRes.body.groups.some(g => g.name === 'Roommates'));
    });

    it('does not leak internal errors on import failure', async () => {
      const res = await agent().post('/api/data/import').send({
        password: 'testpassword',
        confirm: 'DELETE ALL DATA',
        data: { accounts: [{ name: null }], categories: 'invalid' }
      });
      assert.ok(res.status >= 400);
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('SQLITE'), 'Should not leak SQL errors');
      assert.ok(!body.includes('constraint'), 'Should not leak constraint details');
    });
  });
});
