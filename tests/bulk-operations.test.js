const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

let db;

function makeTag(overrides = {}) {
  const o = { name: 'TestTag', color: '#ff0000', ...overrides };
  const r = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(1, o.name, o.color);
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(r.lastInsertRowid);
}

before(() => {
  const ctx = setup();
  db = ctx.db;
});

after(() => teardown());

describe('Transaction Bulk Operations', () => {

  beforeEach(() => cleanDb());

  // ─── Bulk Delete ─────────────────────────────────────────────

  describe('POST /api/transactions/bulk-delete', () => {

    it('should delete multiple transactions and update balances', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 1000 });
      const t2 = makeTransaction(acct.id, { type: 'expense', amount: 2000 });
      const t3 = makeTransaction(acct.id, { type: 'income', amount: 500 });

      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids: [t1.id, t2.id, t3.id] });

      assert.equal(res.status, 200);
      assert.equal(res.body.deleted, 3);

      // Balance should be restored: 50000 - 1000 - 2000 + 500 = 47500 start
      // After reversing: +1000 +2000 -500 => 50000
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      assert.equal(updated.balance, 50000);
    });

    it('should reject transfer transactions in bulk delete', async () => {
      const acct1 = makeAccount({ balance: 50000, name: 'A1' });
      const acct2 = makeAccount({ balance: 50000, name: 'A2' });

      // Create a transfer via API
      const transferRes = await agent()
        .post('/api/transactions')
        .send({
          account_id: acct1.id,
          type: 'transfer',
          amount: 1000,
          currency: 'INR',
          description: 'Transfer test',
          date: new Date().toISOString().slice(0, 10),
          transfer_to_account_id: acct2.id,
        });
      const transferId = transferRes.body.transaction.id;

      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids: [transferId] });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.toLowerCase().includes('transfer'));
    });

    it('should reject IDs belonging to another user', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100 });

      // Manually insert a transaction for a different user
      db.prepare(
        'INSERT INTO users (username, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?)'
      ).run('otheruser', 'hash', 'Other', 'INR');
      const otherUserId = db.prepare('SELECT id FROM users WHERE username = ?').get('otheruser').id;
      const otherAcct = db.prepare(
        'INSERT INTO accounts (user_id, name, type, currency, balance) VALUES (?, ?, ?, ?, ?)'
      ).run(otherUserId, 'Other Acct', 'checking', 'INR', 10000);
      const otherTx = db.prepare(
        'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(otherUserId, otherAcct.lastInsertRowid, 'expense', 500, 'INR', 'Other tx', '2025-01-01');

      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids: [t1.id, otherTx.lastInsertRowid] });

      // Should fail because not all IDs belong to the requesting user
      assert.equal(res.status, 400);
    });

    it('should return count of deleted rows', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100 });
      const t2 = makeTransaction(acct.id, { type: 'expense', amount: 200 });

      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids: [t1.id, t2.id] });

      assert.equal(res.status, 200);
      assert.equal(res.body.deleted, 2);
    });

    it('should be atomic — if one fails, none are deleted', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 1000 });

      // Create a transfer (which should be rejected in bulk delete)
      const acct2 = makeAccount({ balance: 50000, name: 'A2' });
      const transferRes = await agent()
        .post('/api/transactions')
        .send({
          account_id: acct.id, type: 'transfer', amount: 500,
          currency: 'INR', description: 'xfer', date: '2025-01-01',
          transfer_to_account_id: acct2.id,
        });
      const transferId = transferRes.body.transaction.id;

      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids: [t1.id, transferId] });

      assert.equal(res.status, 400);

      // t1 should still exist (atomic rollback)
      const still = db.prepare('SELECT * FROM transactions WHERE id = ?').get(t1.id);
      assert.ok(still, 'Transaction should not have been deleted');
    });
  });

  // ─── Validation ──────────────────────────────────────────────

  describe('Validation', () => {

    it('should reject empty ids array', async () => {
      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids: [] });
      assert.equal(res.status, 400);
    });

    it('should reject more than 100 ids', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => i + 1);
      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids });
      assert.equal(res.status, 400);
    });

    it('should reject non-positive ids', async () => {
      const res = await agent()
        .post('/api/transactions/bulk-delete')
        .send({ ids: [-1, 0] });
      assert.equal(res.status, 400);
    });
  });

  // ─── Bulk Categorize ────────────────────────────────────────

  describe('POST /api/transactions/bulk-categorize', () => {

    it('should update category for multiple transactions', async () => {
      const acct = makeAccount({ balance: 50000 });
      const cat1 = makeCategory({ name: 'Food' });
      const cat2 = makeCategory({ name: 'Transport' });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: cat1.id });
      const t2 = makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: cat1.id });
      const t3 = makeTransaction(acct.id, { type: 'expense', amount: 300 });

      const res = await agent()
        .post('/api/transactions/bulk-categorize')
        .send({ ids: [t1.id, t2.id, t3.id], category_id: cat2.id });

      assert.equal(res.status, 200);
      assert.equal(res.body.updated, 3);

      const updated1 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(t1.id);
      const updated2 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(t2.id);
      const updated3 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(t3.id);
      assert.equal(updated1.category_id, cat2.id);
      assert.equal(updated2.category_id, cat2.id);
      assert.equal(updated3.category_id, cat2.id);
    });

    it('should return count of affected rows', async () => {
      const acct = makeAccount({ balance: 50000 });
      const cat = makeCategory({ name: 'Cat' });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100 });

      const res = await agent()
        .post('/api/transactions/bulk-categorize')
        .send({ ids: [t1.id], category_id: cat.id });

      assert.equal(res.status, 200);
      assert.equal(res.body.updated, 1);
    });
  });

  // ─── Bulk Tag ────────────────────────────────────────────────

  describe('POST /api/transactions/bulk-tag', () => {

    it('should add tags to multiple transactions', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100 });
      const t2 = makeTransaction(acct.id, { type: 'expense', amount: 200 });
      const tag1 = makeTag({ name: 'urgent' });
      const tag2 = makeTag({ name: 'review' });

      const res = await agent()
        .post('/api/transactions/bulk-tag')
        .send({ ids: [t1.id, t2.id], tag_ids: [tag1.id, tag2.id] });

      assert.equal(res.status, 200);
      assert.equal(res.body.tagged, 2);

      const tags1 = db.prepare('SELECT tag_id FROM transaction_tags WHERE transaction_id = ?').all(t1.id);
      const tags2 = db.prepare('SELECT tag_id FROM transaction_tags WHERE transaction_id = ?').all(t2.id);
      assert.equal(tags1.length, 2);
      assert.equal(tags2.length, 2);
    });

    it('should not duplicate existing tags (INSERT OR IGNORE)', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100 });
      const tag1 = makeTag({ name: 'existing' });

      // Pre-link the tag
      db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(t1.id, tag1.id);

      const res = await agent()
        .post('/api/transactions/bulk-tag')
        .send({ ids: [t1.id], tag_ids: [tag1.id] });

      assert.equal(res.status, 200);

      const tags = db.prepare('SELECT tag_id FROM transaction_tags WHERE transaction_id = ?').all(t1.id);
      assert.equal(tags.length, 1); // no duplicates
    });
  });

  // ─── Bulk Untag ──────────────────────────────────────────────

  describe('POST /api/transactions/bulk-untag', () => {

    it('should remove tags from multiple transactions', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100 });
      const t2 = makeTransaction(acct.id, { type: 'expense', amount: 200 });
      const tag1 = makeTag({ name: 'remove-me' });
      const tag2 = makeTag({ name: 'keep-me' });

      // Link tags
      db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(t1.id, tag1.id);
      db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(t1.id, tag2.id);
      db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(t2.id, tag1.id);
      db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(t2.id, tag2.id);

      const res = await agent()
        .post('/api/transactions/bulk-untag')
        .send({ ids: [t1.id, t2.id], tag_ids: [tag1.id] });

      assert.equal(res.status, 200);
      assert.equal(res.body.untagged, 2);

      // tag1 should be removed, tag2 should remain
      const t1Tags = db.prepare('SELECT tag_id FROM transaction_tags WHERE transaction_id = ?').all(t1.id);
      const t2Tags = db.prepare('SELECT tag_id FROM transaction_tags WHERE transaction_id = ?').all(t2.id);
      assert.equal(t1Tags.length, 1);
      assert.equal(t1Tags[0].tag_id, tag2.id);
      assert.equal(t2Tags.length, 1);
      assert.equal(t2Tags[0].tag_id, tag2.id);
    });

    it('should succeed even if tags are not present', async () => {
      const acct = makeAccount({ balance: 50000 });
      const t1 = makeTransaction(acct.id, { type: 'expense', amount: 100 });
      const tag1 = makeTag({ name: 'not-linked' });

      const res = await agent()
        .post('/api/transactions/bulk-untag')
        .send({ ids: [t1.id], tag_ids: [tag1.id] });

      assert.equal(res.status, 200);
    });
  });
});
