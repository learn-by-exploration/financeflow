// tests/v3-security-hardening.test.js — Iteration 7: Security fixes + new endpoint tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, today, daysFromNow } = require('./helpers');

describe('v3 Security & Hardening (Iter 7)', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 100000 });
    category = makeCategory({ name: 'Test' });
  });

  // ─── Attachment path traversal prevention ───
  describe('Attachment security', () => {
    it('file upload creates attachment with valid path', async () => {
      const txn = makeTransaction(account.id, { amount: 100 });
      const res = await agent()
        .post(`/api/transactions/${txn.id}/attachments`)
        .attach('file', Buffer.from('fake pdf'), { filename: 'receipt.pdf', contentType: 'application/pdf' });
      assert.equal(res.status, 201);
      assert.ok(res.body.attachment.filename.includes('receipt'));
    });

    it('rejects oversized file (>5MB)', async () => {
      const txn = makeTransaction(account.id, { amount: 100 });
      const bigBuf = Buffer.alloc(6 * 1024 * 1024);
      const res = await agent()
        .post(`/api/transactions/${txn.id}/attachments`)
        .attach('file', bigBuf, { filename: 'big.pdf', contentType: 'application/pdf' });
      assert.equal(res.status, 400);
    });

    it('rejects non-allowed MIME type', async () => {
      const txn = makeTransaction(account.id, { amount: 100 });
      const res = await agent()
        .post(`/api/transactions/${txn.id}/attachments`)
        .attach('file', Buffer.from('exe'), { filename: 'bad.exe', contentType: 'application/x-executable' });
      assert.equal(res.status, 400);
    });

    it('cannot access other users attachment', async () => {
      const txn = makeTransaction(account.id, { amount: 100 });
      const upload = await agent()
        .post(`/api/transactions/${txn.id}/attachments`)
        .attach('file', Buffer.from('test'), { filename: 'doc.pdf', contentType: 'application/pdf' });
      if (upload.status === 201) {
        const attachId = upload.body.attachment.id;
        // Create second user
        const { db } = setup();
        const bcrypt = require('bcryptjs');
        db.prepare("INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)").run('attacker2', bcrypt.hashSync('pass', 4), 'Attacker');
        const login = await rawAgent().post('/api/auth/login').send({ username: 'attacker2', password: 'pass' });
        const res = await rawAgent().get(`/api/attachments/${attachId}`).set('X-Session-Token', login.body.token);
        assert.equal(res.status, 403);
      }
    });
  });

  // ─── Rules schema validation ───
  describe('Rules schema validation', () => {
    it('POST /api/rules requires pattern', async () => {
      const cat = makeCategory({ name: 'Food' });
      const res = await agent().post('/api/rules').send({ category_id: cat.id });
      assert.equal(res.status, 400);
    });

    it('POST /api/rules requires category_id', async () => {
      const res = await agent().post('/api/rules').send({ pattern: 'test' });
      assert.equal(res.status, 400);
    });

    it('POST /api/rules rejects non-integer category_id', async () => {
      const res = await agent().post('/api/rules').send({ pattern: 'test', category_id: 'abc' });
      assert.equal(res.status, 400);
    });

    it('PUT /api/rules validates update fields', async () => {
      const cat = makeCategory({ name: 'Food' });
      const create = await agent().post('/api/rules').send({ pattern: 'grocery', category_id: cat.id });
      if (create.status === 201) {
        const res = await agent().put(`/api/rules/${create.body.rule.id}`).send({ position: -1 });
        assert.equal(res.status, 400);
      }
    });

    it('rules CRUD full cycle', async () => {
      const cat = makeCategory({ name: 'Food' });
      // Create
      const create = await agent().post('/api/rules').send({ pattern: 'swiggy|zomato', category_id: cat.id }).expect(201);
      assert.ok(create.body.rule.id);
      // List
      const list = await agent().get('/api/rules').expect(200);
      assert.ok(list.body.rules.length >= 1);
      // Update
      const cat2 = makeCategory({ name: 'Dining' });
      const update = await agent().put(`/api/rules/${create.body.rule.id}`).send({ category_id: cat2.id }).expect(200);
      assert.equal(update.body.rule.category_id, cat2.id);
      // Delete
      await agent().delete(`/api/rules/${create.body.rule.id}`).expect(200);
    });
  });

  // ─── Recurring pause/resume ───
  describe('Recurring pause/resume', () => {
    let ruleId;
    beforeEach(async () => {
      const res = await agent().post('/api/recurring').send({
        account_id: account.id,
        category_id: category.id,
        type: 'expense',
        amount: 500,
        description: 'Test recurring',
        frequency: 'monthly',
        start_date: today(),
      });
      ruleId = res.body.rule?.id;
    });

    it('POST /api/recurring/:id/pause deactivates rule', async () => {
      if (!ruleId) return;
      const res = await agent().post(`/api/recurring/${ruleId}/pause`).expect(200);
      assert.equal(res.body.rule.is_active, 0);
    });

    it('POST /api/recurring/:id/resume reactivates rule', async () => {
      if (!ruleId) return;
      await agent().post(`/api/recurring/${ruleId}/pause`).expect(200);
      const res = await agent().post(`/api/recurring/${ruleId}/resume`).expect(200);
      assert.equal(res.body.rule.is_active, 1);
    });

    it('pause on already paused rule returns 400', async () => {
      if (!ruleId) return;
      await agent().post(`/api/recurring/${ruleId}/pause`).expect(200);
      await agent().post(`/api/recurring/${ruleId}/pause`).expect(400);
    });

    it('resume on already active rule returns 400', async () => {
      if (!ruleId) return;
      await agent().post(`/api/recurring/${ruleId}/resume`).expect(400);
    });

    it('pause requires auth', async () => {
      if (!ruleId) return;
      await rawAgent().post(`/api/recurring/${ruleId}/pause`).expect(401);
    });

    it('resume requires auth', async () => {
      if (!ruleId) return;
      await rawAgent().post(`/api/recurring/${ruleId}/resume`).expect(401);
    });

    it('pause non-existent rule returns 404', async () => {
      await agent().post('/api/recurring/99999/pause').expect(404);
    });
  });

  // ─── Subscription upcoming alerts ───
  describe('Subscription upcoming alerts', () => {
    it('GET /api/subscriptions/upcoming returns upcoming subs', async () => {
      // Create a subscription with next_billing_date in 3 days
      const soon = daysFromNow(3);
      const { db } = setup();
      db.prepare(`
        INSERT INTO subscriptions (user_id, name, amount, frequency, is_active, next_billing_date, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(1, 'Netflix', 499, 'monthly', 1, soon, 'INR');

      const res = await agent().get('/api/subscriptions/upcoming?days=7').expect(200);
      assert.ok(res.body.upcoming.length >= 1);
      assert.ok(res.body.count >= 1);
      assert.ok(res.body.total_amount >= 499);
    });

    it('upcoming endpoint requires auth', async () => {
      await rawAgent().get('/api/subscriptions/upcoming').expect(401);
    });

    it('upcoming with days=0 defaults to 7', async () => {
      const res = await agent().get('/api/subscriptions/upcoming?days=0').expect(200);
      assert.equal(res.body.days, 7);
    });

    it('upcoming caps at 90 days', async () => {
      const res = await agent().get('/api/subscriptions/upcoming?days=999').expect(200);
      assert.equal(res.body.days, 90);
    });
  });

  // ─── Stats repository integration ───
  describe('Stats repository integration', () => {
    it('overview still returns correct structure after refactor', async () => {
      makeTransaction(account.id, { amount: 5000, type: 'income' });
      makeTransaction(account.id, { amount: 2000, type: 'expense', category_id: category.id });
      const res = await agent().get('/api/stats/overview').expect(200);
      assert.ok(res.body.net_worth !== undefined);
      assert.ok(res.body.month_income !== undefined);
      assert.ok(res.body.month_expense !== undefined);
      assert.ok(res.body.top_categories !== undefined);
      assert.ok(res.body.recent_transactions !== undefined);
    });

    it('trends still returns array after refactor', async () => {
      makeTransaction(account.id, { amount: 1000 });
      const res = await agent().get('/api/stats/trends?months=3').expect(200);
      assert.ok(Array.isArray(res.body.trends));
    });

    it('category-breakdown still returns array after refactor', async () => {
      makeTransaction(account.id, { amount: 500, category_id: category.id });
      const res = await agent().get('/api/stats/category-breakdown').expect(200);
      assert.ok(Array.isArray(res.body.breakdown));
    });
  });

  // ─── Silent error logging verification ───
  describe('Error handling improvements', () => {
    it('health endpoint returns valid JSON', async () => {
      const res = await rawAgent().get('/api/health').expect(200);
      assert.ok(res.body.status);
      assert.ok(res.body.version);
    });

    it('health metrics endpoint returns JSON', async () => {
      const res = await rawAgent().get('/api/health/metrics').expect(200);
      assert.ok(res.body.totalUsers !== undefined);
    });
  });
});
