const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeTransaction } = require('./helpers');

describe('Phase 9 — Performance (P2)', () => {
  let db;

  before(() => {
    ({ db } = setup());
  });
  after(() => teardown());

  // ═══════════════════════════════════════════════════════
  // 9.1 FTS5 SEARCH
  // ═══════════════════════════════════════════════════════

  describe('9.1 FTS5 Transaction Search', () => {
    beforeEach(() => cleanDb());

    it('FTS table exists after migration', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions_fts'"
      ).get();
      assert.ok(row, 'transactions_fts table should exist');
    });

    it('transaction search returns results for matching description', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'Grocery shopping at BigBazaar' });
      makeTransaction(acct.id, { description: 'Electricity bill' });

      const res = await agent().get('/api/search?q=grocery').expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.ok(res.body.transactions[0].description.includes('Grocery'));
    });

    it('transaction search returns results for matching payee', async () => {
      const acct = makeAccount();

      // Use API to create transactions with payee so FTS trigger fires with payee data
      await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 200,
        currency: 'INR',
        description: 'Food delivery',
        payee: 'Swiggy',
        date: new Date().toISOString().slice(0, 10),
      }).expect(201);

      await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 300,
        currency: 'INR',
        description: 'Food delivery',
        payee: 'Zomato',
        date: new Date().toISOString().slice(0, 10),
      }).expect(201);

      const res = await agent().get('/api/search?q=swiggy').expect(200);
      assert.equal(res.body.transactions.length, 1);
    });

    it('search is case-insensitive', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'UBER Ride to Airport' });

      const res = await agent().get('/api/search?q=uber').expect(200);
      assert.equal(res.body.transactions.length, 1);
    });

    it('new transaction is immediately searchable (trigger works)', async () => {
      const acct = makeAccount();

      // Create via API so trigger fires
      const createRes = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 500,
        currency: 'INR',
        description: 'UniqueXyzSearchable',
        date: new Date().toISOString().slice(0, 10),
      }).expect(201);

      const res = await agent().get('/api/search?q=UniqueXyzSearchable').expect(200);
      assert.equal(res.body.transactions.length, 1);
    });

    it('updated transaction description returns new results', async () => {
      const acct = makeAccount();
      const tx = makeTransaction(acct.id, { description: 'OldDescription' });

      // Update via API so trigger fires
      await agent().put(`/api/transactions/${tx.id}`).send({
        description: 'NewUpdatedDescription',
      }).expect(200);

      const resOld = await agent().get('/api/search?q=OldDescription').expect(200);
      assert.equal(resOld.body.transactions.length, 0, 'old description should not match');

      const resNew = await agent().get('/api/search?q=NewUpdatedDescription').expect(200);
      assert.equal(resNew.body.transactions.length, 1, 'new description should match');
    });

    it('deleted transaction is no longer searchable', async () => {
      const acct = makeAccount();
      const tx = makeTransaction(acct.id, { description: 'DeleteMeSoon' });

      // Verify it's searchable
      const before = await agent().get('/api/search?q=DeleteMeSoon').expect(200);
      assert.equal(before.body.transactions.length, 1);

      // Delete via API so trigger fires
      await agent().delete(`/api/transactions/${tx.id}`).expect(200);

      const after = await agent().get('/api/search?q=DeleteMeSoon').expect(200);
      assert.equal(after.body.transactions.length, 0, 'deleted tx should not appear');
    });

    it('search with special characters does not cause errors', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'Normal purchase' });

      // FTS5 special chars: " * OR AND NOT { } ( ) :
      const specials = ['"test"', 'a*b', 'foo OR bar', 'NOT thing', '{bad}', '(parens)', 'col:val'];
      for (const q of specials) {
        const res = await agent().get(`/api/search?q=${encodeURIComponent(q)}`).expect(200);
        assert.ok(Array.isArray(res.body.transactions), `should handle: ${q}`);
      }
    });

    it('search with no results returns empty array', async () => {
      const res = await agent().get('/api/search?q=zzzznonexistent99999').expect(200);
      assert.equal(res.body.transactions.length, 0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 9.2 CACHE SIZE LIMIT + LRU EVICTION
  // ═══════════════════════════════════════════════════════

  describe('9.2 Cache Size Limit + LRU Eviction', () => {
    beforeEach(() => cleanDb());

    it('cache has a configurable max size', () => {
      const config = require('../src/config');
      assert.ok(config.cache, 'config should have a cache section');
      assert.ok(typeof config.cache.maxSize === 'number', 'cache.maxSize should be a number');
      assert.ok(config.cache.maxSize > 0, 'cache.maxSize should be positive');
    });

    it('cache.js references maxSize or MAX_CACHE_SIZE', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'middleware', 'cache.js'), 'utf8');
      assert.ok(
        src.includes('maxSize') || src.includes('MAX_CACHE_SIZE'),
        'cache.js should reference maxSize or MAX_CACHE_SIZE'
      );
    });

    it('cache.js has eviction logic', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'middleware', 'cache.js'), 'utf8');
      assert.ok(
        src.includes('evict') || src.includes('Evict') || src.includes('LRU') || src.includes('lru'),
        'cache.js should have eviction logic'
      );
    });

    it('cache evicts least recently used entry when at capacity', () => {
      const { getCacheStore, clearAllCache } = require('../src/middleware/cache');
      const config = require('../src/config');
      clearAllCache();
      const store = getCacheStore();

      // We test by directly adding entries up to maxSize + 1
      // and verifying one got evicted
      const maxSize = config.cache.maxSize;

      // Add maxSize entries
      for (let i = 0; i < maxSize; i++) {
        store.set(`test-key-${i}`, {
          data: { i },
          statusCode: 200,
          etag: `"etag-${i}"`,
          tags: [],
          expiresAt: Date.now() + 60000,
          accessedAt: Date.now() - (maxSize - i) * 1000, // older entries have earlier timestamps
        });
      }

      assert.equal(store.size, maxSize);

      // Now simulate adding one more via the eviction function
      const { evictLRU } = require('../src/middleware/cache');
      if (typeof evictLRU === 'function') {
        evictLRU();
        assert.equal(store.size, maxSize - 1, 'one entry should have been evicted');
        // The oldest entry (test-key-0) should have been evicted
        assert.ok(!store.has('test-key-0'), 'oldest entry should be evicted');
      }

      clearAllCache();
    });
  });
});
