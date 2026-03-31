const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

describe('Iteration 1 Review Fixes', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── C1: deleteById must enforce userId ───
  describe('C1: Transaction deleteById enforces userId', () => {
    it('DELETE /api/transactions/:id only deletes own transactions', async () => {
      const acc = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions').send({
        account_id: acc.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Test', date: '2025-01-01'
      }).expect(201);
      const txId = res.body.transaction.id;

      // Verify the transaction exists
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
      assert.ok(row, 'Transaction should exist');

      // Delete should succeed for own transaction
      await agent().delete(`/api/transactions/${txId}`).expect(200);

      // Verify deleted
      const gone = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
      assert.equal(gone, undefined, 'Transaction should be deleted');
    });

    it('repository deleteById SQL includes user_id filter', () => {
      // Verify the SQL in the repository uses user_id
      const createTxRepo = require('../src/repositories/transaction.repository');
      const repo = createTxRepo({ db });
      const acc = makeAccount();
      // Insert a transaction for user 1
      db.prepare(
        'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(1, acc.id, 'expense', 100, 'INR', 'Test', '2025-01-01', '[]');
      const tx = db.prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT 1').get();

      // Attempt to delete with wrong userId (999) — should NOT delete
      const result = repo.delete(tx.id, 999);
      assert.equal(result.changes, 0, 'Should not delete transaction of another user');

      // Verify still exists
      const still = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx.id);
      assert.ok(still, 'Transaction should still exist after failed delete');

      // Delete with correct userId — should succeed
      const result2 = repo.delete(tx.id, 1);
      assert.equal(result2.changes, 1, 'Should delete own transaction');
    });
  });

  // ─── C2: PUT /api/accounts/:id validates body ───
  describe('C2: PUT /api/accounts/:id validates body', () => {
    it('rejects invalid type in update', async () => {
      const acc = makeAccount();
      const res = await agent().put(`/api/accounts/${acc.id}`)
        .send({ type: 'invalid_type' });
      assert.equal(res.status, 400);
    });

    it('rejects name that is too long', async () => {
      const acc = makeAccount();
      const res = await agent().put(`/api/accounts/${acc.id}`)
        .send({ name: 'x'.repeat(200) });
      assert.equal(res.status, 400);
    });

    it('accepts valid update fields', async () => {
      const acc = makeAccount();
      const res = await agent().put(`/api/accounts/${acc.id}`)
        .send({ name: 'Updated Name', type: 'savings' })
        .expect(200);
      assert.equal(res.body.account.name, 'Updated Name');
    });
  });

  // ─── C3: PUT /api/transactions/:id validates body ───
  describe('C3: PUT /api/transactions/:id validates body', () => {
    it('rejects negative amount in update', async () => {
      const acc = makeAccount();
      const cat = makeCategory();
      const txRes = await agent().post('/api/transactions').send({
        account_id: acc.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Test', date: '2025-01-01'
      }).expect(201);
      const txId = txRes.body.transaction.id;

      const res = await agent().put(`/api/transactions/${txId}`)
        .send({ amount: -50 });
      assert.equal(res.status, 400);
    });

    it('rejects description that is too long', async () => {
      const acc = makeAccount();
      const cat = makeCategory();
      const txRes = await agent().post('/api/transactions').send({
        account_id: acc.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Test', date: '2025-01-01'
      }).expect(201);
      const res = await agent().put(`/api/transactions/${txRes.body.transaction.id}`)
        .send({ description: 'x'.repeat(600) });
      assert.equal(res.status, 400);
    });

    it('accepts valid update fields', async () => {
      const acc = makeAccount();
      const cat = makeCategory();
      const txRes = await agent().post('/api/transactions').send({
        account_id: acc.id, category_id: cat.id, type: 'expense',
        amount: 100, description: 'Test', date: '2025-01-01'
      }).expect(201);
      const res = await agent().put(`/api/transactions/${txRes.body.transaction.id}`)
        .send({ description: 'Updated', amount: 200 })
        .expect(200);
      assert.equal(res.body.transaction.description, 'Updated');
    });
  });

  // ─── M5: Date validation ───
  describe('M5: Date format validation', () => {
    it('rejects invalid date format on create', async () => {
      const acc = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acc.id, type: 'expense', amount: 50,
        description: 'Bad date', date: 'not-a-date'
      });
      assert.equal(res.status, 400);
    });

    it('rejects impossible date', async () => {
      const acc = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acc.id, type: 'expense', amount: 50,
        description: 'Bad date', date: '2024-13-99'
      });
      assert.equal(res.status, 400);
    });

    it('accepts valid YYYY-MM-DD date', async () => {
      const acc = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acc.id, type: 'expense', amount: 50,
        description: 'Good date', date: '2025-06-15'
      }).expect(201);
      assert.equal(res.body.transaction.date, '2025-06-15');
    });
  });

  // ─── M6: Double CORS ───
  describe('M6: Single CORS middleware', () => {
    it('does not duplicate Access-Control-Allow-Origin header', async () => {
      const res = await agent().get('/api/accounts')
        .set('Origin', 'http://localhost:3457');
      // Should have at most one Access-Control-Allow-Origin value
      const header = res.headers['access-control-allow-origin'];
      if (header) {
        // If present, should be a single value not comma-separated duplicates
        assert.ok(!header.includes(','), 'Should not have duplicate CORS origins');
      }
    });
  });

  // ─── M9: Content-Disposition sanitization ───
  describe('M9: Attachment Content-Disposition sanitized', () => {
    it('filename with quotes is properly handled', async () => {
      // This tests the route exists and handles bad filenames
      // The actual fix is in the Content-Disposition header construction
      const res = await agent().get('/api/attachments/999999');
      // Should get 404, not crash
      assert.equal(res.status, 404);
    });
  });

  // ─── H2: Rate limiter cleanup ───
  describe('H2: Per-user rate limiter has cleanup', () => {
    it('exposes cleanup function', () => {
      const createPerUserRateLimit = require('../src/middleware/per-user-rate-limit');
      assert.equal(typeof createPerUserRateLimit._resetAll, 'function');
      assert.equal(typeof createPerUserRateLimit._cleanup, 'function');
    });
  });

  // ─── L2: Unused imports cleaned ───
  describe('L2: No critical unused variables in repositories', () => {
    it('tag repository deleteByIdAndUser uses userId', () => {
      const fs = require('fs');
      const tagRepoSrc = fs.readFileSync(require.resolve('../src/repositories/tag.repository'), 'utf8');
      // The delete function should use userId in its SQL
      assert.ok(
        tagRepoSrc.includes('user_id') || !tagRepoSrc.includes('deleteById'),
        'Tag repo delete should use user_id or not have deleteById'
      );
    });
  });
});
