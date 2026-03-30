const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeSecondUser } = require('./helpers');

describe('Cache Invalidation & Request Timeouts', () => {
  let acct, cat;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    acct = makeAccount({ name: 'Checking', balance: 50000 });
    cat = makeCategory({ name: 'Food', type: 'expense' });
  });

  describe('X-Cache header', () => {
    it('returns MISS on first request and HIT on second', async () => {
      // Seed data so reports return something
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2025-03-10', category_id: cat.id });

      const res1 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      const res2 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res2.status, 200);
      assert.equal(res2.headers['x-cache'], 'HIT');
    });
  });

  describe('invalidation on transaction create', () => {
    it('invalidates cache after creating a transaction', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2025-03-10', category_id: cat.id });

      // Populate cache
      const res1 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      // Confirm cached
      const res2 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res2.headers['x-cache'], 'HIT');

      // Create a new transaction via API — should invalidate cache
      const txRes = await agent().post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 1000,
        description: 'Dinner',
        date: '2025-03-12'
      });
      assert.equal(txRes.status, 201);

      // Cache should be invalidated — MISS again
      const res3 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res3.status, 200);
      assert.equal(res3.headers['x-cache'], 'MISS');
    });
  });

  describe('invalidation on account update', () => {
    it('invalidates cache after updating an account', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2025-03-10', category_id: cat.id });

      // Populate cache
      await agent().get('/api/reports/monthly?month=2025-03');
      const res2 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res2.headers['x-cache'], 'HIT');

      // Update account — should invalidate cache
      const updateRes = await agent().put(`/api/accounts/${acct.id}`).send({ name: 'Updated Checking' });
      assert.equal(updateRes.status, 200);

      // Cache should be invalidated
      const res3 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res3.headers['x-cache'], 'MISS');
    });
  });

  describe('user isolation', () => {
    it('different users do not share cache', async () => {
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2025-03-10', category_id: cat.id });

      // User 1 populates cache
      const res1 = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      const res1b = await agent().get('/api/reports/monthly?month=2025-03');
      assert.equal(res1b.headers['x-cache'], 'HIT');

      // User 2 should get MISS (no shared cache)
      const { agent: agent2 } = makeSecondUser();
      const res2 = await agent2.get('/api/reports/monthly?month=2025-03');
      assert.equal(res2.status, 200);
      assert.equal(res2.headers['x-cache'], 'MISS');
    });
  });

  describe('request timeout', () => {
    it('returns 503 on slow request (simulated)', async () => {
      // We test the timeout middleware directly by creating a mini express app
      const express = require('express');
      const request = require('supertest');
      const { timeoutMiddleware } = require('../src/middleware/timeout');

      const testApp = express();
      testApp.use(timeoutMiddleware(50)); // 50ms timeout for testing

      testApp.get('/slow', (_req, res) => {
        // Respond after 200ms — well past the 50ms timeout
        setTimeout(() => {
          if (!res.headersSent) {
            res.json({ ok: true });
          }
        }, 200);
      });

      const res = await request(testApp).get('/slow');
      assert.equal(res.status, 503);
      assert.equal(res.body.error, 'Request timeout');
    });
  });

  describe('cache tag system', () => {
    it('stores tags on cached entries', async () => {
      const { getCacheStore } = require('../src/middleware/cache');

      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2025-03-10', category_id: cat.id });

      await agent().get('/api/reports/monthly?month=2025-03');

      // Verify cache entry has tags
      const store = getCacheStore();
      let foundTags = false;
      for (const [key, entry] of store) {
        if (key.includes('/api/reports/')) {
          assert.ok(Array.isArray(entry.tags));
          assert.ok(entry.tags.length > 0);
          assert.ok(entry.tags.includes('transactions'));
          foundTags = true;
        }
      }
      assert.ok(foundTags, 'Expected to find a cached report entry with tags');
    });

    it('invalidateCacheByTags clears matching entries', async () => {
      const { invalidateCacheByTags, getCacheStore } = require('../src/middleware/cache');

      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2025-03-10', category_id: cat.id });
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2025-03-01', category_id: cat.id });

      // Populate cache with two distinct report URLs
      await agent().get('/api/reports/monthly?month=2025-03');
      await agent().get('/api/reports/monthly?month=2025-02');

      const store = getCacheStore();
      const sizeBefore = store.size;
      assert.ok(sizeBefore >= 2, `Expected at least 2 cached entries, got ${sizeBefore}`);

      // Get user id (user 1)
      const { db } = setup();
      const user = db.prepare('SELECT id FROM users WHERE id = 1').get();

      // Invalidate by "transactions" tag — should clear reports
      invalidateCacheByTags(user.id, ['transactions']);

      // All entries for this user with 'transactions' tag should be gone
      for (const [key, entry] of store) {
        if (key.startsWith(`${user.id}:`)) {
          assert.ok(!entry.tags.includes('transactions'), 'Expected transactions-tagged entries to be invalidated');
        }
      }
    });
  });
});
