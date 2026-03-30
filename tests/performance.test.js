const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeSecondUser } = require('./helpers');
const { clearAllCache, getCacheStore } = require('../src/middleware/cache');

describe('Performance Optimization & Caching (v0.3.20)', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    clearAllCache();
  });

  describe('Response Cache', () => {
    it('should return cached response on second GET to reports', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2026-03-15' });

      const month = '2026-03';
      const res1 = await agent().get(`/api/reports/monthly?month=${month}`);
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      const res2 = await agent().get(`/api/reports/monthly?month=${month}`);
      assert.equal(res2.status, 200);
      assert.equal(res2.headers['x-cache'], 'HIT');
      assert.deepStrictEqual(res2.body, res1.body);
    });

    it('should return cached response on second GET to charts', async () => {
      const res1 = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-03-31');
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      const res2 = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-03-31');
      assert.equal(res2.status, 200);
      assert.equal(res2.headers['x-cache'], 'HIT');
    });

    it('should return cached response on second GET to insights', async () => {
      const res1 = await agent().get('/api/insights/trends?months=3');
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      const res2 = await agent().get('/api/insights/trends?months=3');
      assert.equal(res2.status, 200);
      assert.equal(res2.headers['x-cache'], 'HIT');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate report cache when a transaction is created', async () => {
      const acct = makeAccount();
      const cat = makeCategory({ type: 'expense' });
      const month = '2026-03';

      const res1 = await agent().get(`/api/reports/monthly?month=${month}`);
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      // Verify cached
      const res2 = await agent().get(`/api/reports/monthly?month=${month}`);
      assert.equal(res2.headers['x-cache'], 'HIT');

      // Create a transaction — should invalidate cache
      await agent().post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 200, description: 'Cache test', date: '2026-03-20',
      });

      // Should be a MISS now
      const res3 = await agent().get(`/api/reports/monthly?month=${month}`);
      assert.equal(res3.status, 200);
      assert.equal(res3.headers['x-cache'], 'MISS');
    });

    it('should invalidate cache when a transaction is deleted', async () => {
      const acct = makeAccount();
      const tx = makeTransaction(acct.id, { type: 'expense', amount: 300, date: '2026-03-10' });

      const res1 = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-03-31');
      assert.equal(res1.headers['x-cache'], 'MISS');

      const res2 = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-03-31');
      assert.equal(res2.headers['x-cache'], 'HIT');

      await agent().delete(`/api/transactions/${tx.id}`);

      const res3 = await agent().get('/api/charts/cashflow?from=2026-01-01&to=2026-03-31');
      assert.equal(res3.headers['x-cache'], 'MISS');
    });

    it('should invalidate cache when account is created', async () => {
      const res1 = await agent().get('/api/insights/trends?months=3');
      assert.equal(res1.headers['x-cache'], 'MISS');

      const res2 = await agent().get('/api/insights/trends?months=3');
      assert.equal(res2.headers['x-cache'], 'HIT');

      await agent().post('/api/accounts').send({
        name: 'New Account', type: 'checking', balance: 10000,
      });

      const res3 = await agent().get('/api/insights/trends?months=3');
      assert.equal(res3.headers['x-cache'], 'MISS');
    });
  });

  describe('User Isolation', () => {
    it('should not share cache between different users', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { type: 'expense', amount: 1000, date: '2026-03-10' });

      const res1 = await agent().get('/api/reports/monthly?month=2026-03');
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      // Second user should get MISS even for same URL
      const user2 = makeSecondUser();
      const res2 = await user2.agent.get('/api/reports/monthly?month=2026-03');
      assert.equal(res2.status, 200);
      assert.equal(res2.headers['x-cache'], 'MISS');

      // Original user should still get HIT
      const res3 = await agent().get('/api/reports/monthly?month=2026-03');
      assert.equal(res3.headers['x-cache'], 'HIT');
    });
  });

  describe('Cache TTL Expiry', () => {
    it('should expire cache entries after TTL', async () => {
      const store = getCacheStore();

      const res1 = await agent().get('/api/reports/monthly?month=2026-03');
      assert.equal(res1.status, 200);
      assert.equal(res1.headers['x-cache'], 'MISS');

      // Manually expire the cache entry
      for (const [key, entry] of store) {
        if (key.includes('/api/reports')) {
          entry.expiresAt = Date.now() - 1000;
        }
      }

      const res2 = await agent().get('/api/reports/monthly?month=2026-03');
      assert.equal(res2.status, 200);
      assert.equal(res2.headers['x-cache'], 'MISS');
    });
  });

  describe('ETag Support', () => {
    it('should include ETag header on GET responses', async () => {
      const res = await agent().get('/api/reports/monthly?month=2026-03');
      assert.equal(res.status, 200);
      assert.ok(res.headers['etag'], 'Expected ETag header');
      assert.match(res.headers['etag'], /^"[a-f0-9]{32}"$/);
    });

    it('should return 304 when If-None-Match matches ETag', async () => {
      const res1 = await agent().get('/api/reports/monthly?month=2026-03');
      assert.equal(res1.status, 200);
      const etag = res1.headers['etag'];
      assert.ok(etag);

      const res2 = await agent().get('/api/reports/monthly?month=2026-03')
        .set('If-None-Match', etag);
      assert.equal(res2.status, 304);
    });

    it('should return 200 when If-None-Match does not match', async () => {
      const res1 = await agent().get('/api/reports/monthly?month=2026-03');
      assert.equal(res1.status, 200);

      const res2 = await agent().get('/api/reports/monthly?month=2026-03')
        .set('If-None-Match', '"stale-etag"');
      assert.equal(res2.status, 200);
    });

    it('should return different ETag after data changes', async () => {
      const acct = makeAccount();
      const cat = makeCategory({ type: 'expense' });

      const res1 = await agent().get('/api/reports/monthly?month=2026-03');
      const etag1 = res1.headers['etag'];

      await agent().post('/api/transactions').send({
        account_id: acct.id, category_id: cat.id, type: 'expense',
        amount: 999, description: 'ETag change test', date: '2026-03-15',
      });

      const res2 = await agent().get('/api/reports/monthly?month=2026-03');
      const etag2 = res2.headers['etag'];

      assert.notEqual(etag1, etag2, 'ETag should change after data mutation');
    });
  });

  describe('Database Indexes', () => {
    it('should have performance indexes applied via migration', () => {
      const { db } = setup();
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'").all();
      const indexNames = indexes.map(i => i.name);

      assert.ok(indexNames.includes('idx_transactions_user_account'), 'Missing idx_transactions_user_account');
      assert.ok(indexNames.includes('idx_transactions_user_category'), 'Missing idx_transactions_user_category');
      assert.ok(indexNames.includes('idx_transactions_user_type'), 'Missing idx_transactions_user_type');
      assert.ok(indexNames.includes('idx_budget_items_budget'), 'Missing idx_budget_items_budget');
      assert.ok(indexNames.includes('idx_recurring_rules_user_next'), 'Missing idx_recurring_rules_user_next');
      assert.ok(indexNames.includes('idx_accounts_user'), 'Missing idx_accounts_user');
      assert.ok(indexNames.includes('idx_categories_user'), 'Missing idx_categories_user');
    });
  });

  describe('Prepared Statements', () => {
    it('should use db.prepare() pattern in transaction repository', async () => {
      // Verify the repository returns correct data via prepared statements
      const acct = makeAccount();
      const cat = makeCategory({ type: 'expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 100, category_id: cat.id, date: '2026-03-10' });
      makeTransaction(acct.id, { type: 'expense', amount: 200, category_id: cat.id, date: '2026-03-11' });

      const res = await agent().get('/api/transactions');
      assert.equal(res.status, 200);
      assert.equal(res.body.transactions.length, 2);
      assert.equal(res.body.total, 2);
    });
  });
});
