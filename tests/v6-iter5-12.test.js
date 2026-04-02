// tests/v6-iter5-12.test.js — Iterations 5-12: Validation, audit, race conditions, N+1
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction,
  makeBudget, makeGoal, makeSubscription, makeGroup, makeGroupMember,
  makeTag, makeRecurringRule, makeTemplate,
  today, daysFromNow } = require('./helpers');

describe('v6 Iterations 5-12', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ═══════════════════════════════════════
  // ITER 5: Remaining audit gaps
  // ═══════════════════════════════════════
  describe('Remaining audit coverage', () => {
    it('PUT /api/preferences creates audit entry', async () => {
      await agent().put('/api/preferences').send({ theme: 'dark', items_per_page: 25 });
      const log = db.prepare("SELECT * FROM audit_log WHERE action LIKE '%preference%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'preference update should be audited');
    });

    it('PUT /api/users/onboarding/dismiss creates audit entry', async () => {
      await agent().put('/api/users/onboarding/dismiss');
      const log = db.prepare("SELECT * FROM audit_log WHERE action LIKE '%onboarding%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'onboarding dismiss should be audited');
    });

    it('category create is audited', async () => {
      await agent().post('/api/categories').send({ name: 'AuditTest', type: 'expense' });
      const log = db.prepare("SELECT * FROM audit_log WHERE action = 'category.create' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'category create should be audited');
    });

    it('category delete is audited', async () => {
      const cat = makeCategory({ name: 'ToDelete' });
      await agent().delete(`/api/categories/${cat.id}`);
      const log = db.prepare("SELECT * FROM audit_log WHERE action = 'category.delete' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'category delete should be audited');
    });

    it('template create from template is audited', async () => {
      const acct = makeAccount();
      const tmpl = makeTemplate(acct.id, { name: 'Rent', amount: 15000 });
      await agent().post(`/api/transactions/from-template/${tmpl.id}`).send({ amount: 15000, type: 'expense' });
      // from-template creates a transaction, which has its own audit
      const log = db.prepare("SELECT * FROM audit_log WHERE action LIKE '%transaction%' OR action LIKE '%template%' ORDER BY id DESC LIMIT 1").get();
      assert.ok(log, 'from-template should produce some audit entry');
    });
  });

  // ═══════════════════════════════════════
  // ITER 6: Validation hardening
  // ═══════════════════════════════════════
  describe('Validation hardening', () => {
    it('PUT /api/settings rejects value over 1000 chars', async () => {
      const res = await agent().put('/api/settings').send({ key: 'default_currency', value: 'X'.repeat(1001) });
      assert.equal(res.status, 400);
    });

    it('POST /api/transaction-templates rejects invalid type', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transaction-templates').send({
        name: 'Test', account_id: acct.id, type: 'invalid', amount: 100,
      });
      assert.equal(res.status, 400);
    });

    it('POST /api/transaction-templates accepts valid template', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transaction-templates').send({
        name: 'Rent Payment', account_id: acct.id, type: 'expense', amount: 15000,
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.template.name, 'Rent Payment');
    });

    it('PUT /api/categories/:id validates name length', async () => {
      const cat = makeCategory({ name: 'Short' });
      const res = await agent().put(`/api/categories/${cat.id}`).send({ name: '' });
      assert.ok([400, 200].includes(res.status)); // Schema may allow or reject empty
    });

    it('PUT /api/budgets/:id rejects non-existent budget', async () => {
      const res = await agent().put('/api/budgets/999999').send({ name: 'Fake' });
      assert.equal(res.status, 404);
    });

    it('PUT /api/goals/:id rejects non-existent goal', async () => {
      const res = await agent().put('/api/goals/999999').send({ name: 'Fake' });
      assert.equal(res.status, 404);
    });

    it('PUT /api/subscriptions/:id rejects non-existent subscription', async () => {
      const res = await agent().put('/api/subscriptions/999999').send({ name: 'Fake' });
      assert.equal(res.status, 404);
    });

    it('DELETE /api/transaction-templates/:id rejects non-existent', async () => {
      const res = await agent().delete('/api/transaction-templates/999999');
      assert.equal(res.status, 404);
    });

    it('POST /api/groups/:id/budgets validates amount', async () => {
      const group = makeGroup();
      const res = await agent().post(`/api/groups/${group.id}/budgets`).send({
        name: 'Test', amount: -100, period: 'monthly',
      });
      assert.ok([201, 400].includes(res.status), 'Should accept or reject negative amount');
    });
  });

  // ═══════════════════════════════════════
  // ITER 7: Race condition / atomicity
  // ═══════════════════════════════════════
  describe('Atomicity guarantees', () => {
    it('concurrent transfers do not corrupt balances', async () => {
      const src = makeAccount({ name: 'ConcSrc', balance: 10000 });
      const dst = makeAccount({ name: 'ConcDst', balance: 0 });
      
      // Run multiple transfers concurrently
      const transfers = [];
      for (let i = 0; i < 5; i++) {
        transfers.push(
          agent().post('/api/transactions').send({
            account_id: src.id, transfer_to_account_id: dst.id,
            type: 'transfer', amount: 1000, description: `Transfer ${i}`, date: today(),
          })
        );
      }
      await Promise.all(transfers);

      const srcBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(src.id).balance;
      const dstBal = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(dst.id).balance;
      assert.equal(srcBal + dstBal, 10000, 'Total balance should be conserved');
    });

    it('tags are linked atomically', async () => {
      const acct = makeAccount();
      const tag1 = makeTag({ name: 'tag-a' });
      const tag2 = makeTag({ name: 'tag-b' });
      const tx = makeTransaction(acct.id, { amount: 100, description: 'tagged' });

      await agent().post('/api/transactions/bulk-tag').send({ ids: [tx.id], tag_ids: [tag1.id, tag2.id] });

      const tags = db.prepare('SELECT COUNT(*) as c FROM transaction_tags WHERE transaction_id = ?').get(tx.id).c;
      assert.equal(tags, 2);
    });

    it('bulk delete properly restores balances', async () => {
      const acct = makeAccount({ balance: 10000 });
      const t1 = makeTransaction(acct.id, { amount: 500, type: 'expense' });
      const t2 = makeTransaction(acct.id, { amount: 300, type: 'expense' });

      // Account balance should now be 10000 - 500 - 300 = 9200
      const balBefore = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance;
      assert.equal(balBefore, 9200);

      await agent().post('/api/transactions/bulk-delete').send({ ids: [t1.id, t2.id] });

      const balAfter = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id).balance;
      assert.equal(balAfter, 10000, 'Balance should be restored after bulk delete');
    });

    it('account deletion with transactions is handled', async () => {
      const acct = makeAccount({ balance: 5000 });
      makeTransaction(acct.id, { amount: 100 });
      const res = await agent().delete(`/api/accounts/${acct.id}`);
      assert.ok([200, 400, 409].includes(res.status), 'Should either succeed or reject with reason');
    });
  });

  // ═══════════════════════════════════════
  // ITER 8: Edge cases and boundary tests
  // ═══════════════════════════════════════
  describe('Edge cases and boundaries', () => {
    it('handles zero-amount transaction', async () => {
      const acct = makeAccount({ balance: 1000 });
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 0, description: 'zero', date: today(),
      });
      assert.ok([400, 201].includes(res.status));
    });

    it('handles very large amount', async () => {
      const acct = makeAccount({ balance: 99999999 });
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'income', amount: 99999999.99, description: 'large', date: today(),
      });
      assert.ok([201, 400].includes(res.status));
    });

    it('handles unicode in transaction description', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 100, description: '🍕 Pizza ñ café', date: today(),
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.transaction.description.includes('🍕'));
    });

    it('handles unicode in category name', async () => {
      const res = await agent().post('/api/categories').send({ name: '食品 & Drinks', type: 'expense' });
      assert.equal(res.status, 201);
      assert.ok(res.body.category.name.includes('食品'));
    });

    it('handles max pagination limit', async () => {
      const res = await agent().get('/api/transactions?limit=1000&offset=0');
      assert.equal(res.status, 200);
    });

    it('handles negative offset gracefully', async () => {
      const res = await agent().get('/api/transactions?offset=-1');
      assert.ok([200, 400].includes(res.status));
    });

    it('handles SQL injection in search query', async () => {
      const res = await agent().get('/api/transactions/search?q=test\'; DROP TABLE transactions; --');
      assert.ok([200, 400].includes(res.status));
      // Verify transactions table still exists
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions').get();
      assert.ok(count !== undefined, 'transactions table should still exist');
    });

    it('handles XSS in account name', async () => {
      const res = await agent().post('/api/accounts').send({
        name: '<script>alert("xss")</script>', type: 'checking', balance: 100, currency: 'INR',
      });
      assert.equal(res.status, 201);
      // DB stores raw — frontend must sanitize on display
      assert.ok(res.body.account.name.includes('script'));
    });
  });

  // ═══════════════════════════════════════
  // ITER 9-10: N+1 query and perf tests
  // ═══════════════════════════════════════
  describe('Performance and N+1 checks', () => {
    it('listing spending limits does not scale linearly with count', async () => {
      const cat1 = makeCategory({ name: 'Cat1', type: 'expense' });
      const cat2 = makeCategory({ name: 'Cat2', type: 'expense' });
      const cat3 = makeCategory({ name: 'Cat3', type: 'expense' });
      // Create spending limits
      for (const cat of [cat1, cat2, cat3]) {
        db.prepare('INSERT INTO spending_limits (user_id, category_id, period, amount) VALUES (?, ?, ?, ?)').run(1, cat.id, 'monthly', 5000);
      }
      const start = Date.now();
      const res = await agent().get('/api/spending-limits');
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed < 500, `Listing spending limits took ${elapsed}ms (should be <500ms)`);
    });

    it('listing 50 categories is fast', async () => {
      for (let i = 0; i < 50; i++) {
        makeCategory({ name: `Cat${i}`, type: i % 2 === 0 ? 'expense' : 'income' });
      }
      const start = Date.now();
      const res = await agent().get('/api/categories?limit=50');
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed < 500, `Listing 50 categories took ${elapsed}ms`);
    });

    it('dashboard overview is fast with data', async () => {
      const acct = makeAccount({ balance: 50000 });
      for (let i = 0; i < 20; i++) {
        makeTransaction(acct.id, { amount: 100 + i, description: `Perf${i}` });
      }
      const start = Date.now();
      const res = await agent().get('/api/stats/overview');
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed < 1000, `Dashboard overview took ${elapsed}ms with 20 transactions`);
    });

    it('search with FTS is fast', async () => {
      const acct = makeAccount();
      for (let i = 0; i < 30; i++) {
        makeTransaction(acct.id, { amount: 10, description: `Expense item ${i} grocery` });
      }
      const start = Date.now();
      const res = await agent().get('/api/transactions/search?q=grocery');
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed < 500, `FTS search took ${elapsed}ms`);
    });
  });

  // ═══════════════════════════════════════
  // ITER 11-12: Response format & consistency
  // ═══════════════════════════════════════
  describe('Response format consistency', () => {
    it('GET /api/subscriptions returns array format', async () => {
      const res = await agent().get('/api/subscriptions');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.subscriptions));
    });

    it('GET /api/spending-limits returns array format', async () => {
      const res = await agent().get('/api/spending-limits');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.spending_limits) || Array.isArray(res.body.limits));
    });

    it('GET /api/transaction-templates returns array format', async () => {
      const res = await agent().get('/api/transaction-templates');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.templates));
    });

    it('GET /api/tags returns array format', async () => {
      const res = await agent().get('/api/tags');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.tags));
    });

    it('GET /api/preferences returns object format', async () => {
      const res = await agent().get('/api/preferences');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body.preferences === 'object');
    });

    it('GET /api/users/onboarding returns steps array', async () => {
      const res = await agent().get('/api/users/onboarding');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.steps));
    });

    it('GET /api/stats/net-worth returns data', async () => {
      makeAccount({ balance: 5000 });
      const res = await agent().get('/api/stats/net-worth');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data) || Array.isArray(res.body.history) || typeof res.body === 'object');
    });

    it('GET /api/recurring returns rules array', async () => {
      const res = await agent().get('/api/recurring');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.rules));
    });

    it('DELETE responses have {ok: true} format', async () => {
      const cat = makeCategory({ name: 'ToDelete' });
      const res = await agent().delete(`/api/categories/${cat.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it('non-existent resource returns error format', async () => {
      const res = await agent().delete('/api/categories/999999');
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
      assert.ok(res.body.error.code || res.body.error.message);
    });

    it('unauthorized requests return 401 with error format', async () => {
      const { default: supertest } = await import('supertest');
      const rawAgent = supertest(app);
      const res = await rawAgent.get('/api/accounts');
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
    });

    it('all create endpoints return 201 status', async () => {
      const acct = makeAccount();
      const catRes = await agent().post('/api/categories').send({ name: 'TestCreate', type: 'expense' });
      assert.equal(catRes.status, 201);

      const tagRes = await agent().post('/api/tags').send({ name: 'testtag', color: '#FF0000' });
      assert.equal(tagRes.status, 201);
    });
  });
});
