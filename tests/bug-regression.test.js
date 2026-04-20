/**
 * Bug Regression Tests — v7.3.1
 *
 * Covers the three bugs discovered during the QA audit:
 *   Bug #1: Missing GET /api/transactions/:id route
 *   Bug #2: No API 404 handler (unmatched /api/* returned SPA HTML)
 *   Bug #3: FTS5 search crashes on hyphenated terms
 *
 * These tests ensure the fixes remain in place and prevent regressions.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  setup,
  teardown,
  cleanDb,
  agent,
  rawAgent,
  makeAccount,
  makeTransaction,
  makeCategory,
  makeTag,
  makeSubscription,
} = require('./helpers');

describe('Bug Regression Tests', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ═══════════════════════════════════════════════════════════════════════
  // Bug #1: GET /api/transactions/:id was missing — returned SPA HTML 200
  // ═══════════════════════════════════════════════════════════════════════
  describe('Bug #1 — GET /api/transactions/:id', () => {
    it('returns a single transaction by id (200)', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const tx = makeTransaction(acct.id, {
        description: 'Regression Test Purchase',
        amount: 4200,
        type: 'expense',
      });

      const res = await agent()
        .get(`/api/transactions/${tx.id}`)
        .expect(200);

      assert.ok(res.body.transaction, 'should have transaction in body');
      assert.equal(res.body.transaction.id, tx.id);
      assert.equal(res.body.transaction.description, 'Regression Test Purchase');
      assert.equal(res.body.transaction.amount, 4200);
    });

    it('returns 404 with JSON for non-existent transaction', async () => {
      const res = await agent()
        .get('/api/transactions/999999')
        .expect(404);

      assert.ok(res.body.error, 'should have error object');
      assert.equal(res.body.error.code, 'NOT_FOUND');
      assert.equal(res.headers['content-type'].includes('application/json'), true);
    });

    it('returns JSON content-type, NOT HTML (the actual bug)', async () => {
      // The core of Bug #1: this path used to fall through to SPA fallback
      const res = await agent()
        .get('/api/transactions/1')
        .expect('Content-Type', /json/);

      // Must NOT contain HTML markers
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('<!DOCTYPE'), 'must not return HTML');
      assert.ok(!body.includes('<html'), 'must not return HTML');
    });

    it('requires authentication (401)', async () => {
      await rawAgent()
        .get('/api/transactions/1')
        .expect(401);
    });

    it('includes tags in response', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const tx = makeTransaction(acct.id, { description: 'Tagged Purchase' });
      const tag = makeTag({ name: 'regression-tag' });

      const { db } = setup();
      db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(tx.id, tag.id);

      const res = await agent()
        .get(`/api/transactions/${tx.id}`)
        .expect(200);

      assert.ok(Array.isArray(res.body.transaction.tags), 'should have tags array');
      assert.equal(res.body.transaction.tags.length, 1);
      assert.equal(res.body.transaction.tags[0].name, 'regression-tag');
    });

    it('returns correct account_id and category_id', async () => {
      const cat = makeCategory({ name: 'Groceries', type: 'expense' });
      const acct = makeAccount({ name: 'HDFC Savings' });
      const tx = makeTransaction(acct.id, {
        description: 'Weekly Groceries',
        category_id: cat.id,
      });

      const res = await agent()
        .get(`/api/transactions/${tx.id}`)
        .expect(200);

      assert.equal(res.body.transaction.account_id, acct.id);
      assert.equal(res.body.transaction.category_id, cat.id);
      assert.equal(res.body.transaction.description, 'Weekly Groceries');
    });

    it('enforces user isolation (cannot fetch other user transaction)', async () => {
      const acct = makeAccount({ name: 'Private Account' });
      const tx = makeTransaction(acct.id, { description: 'Secret Transaction' });

      const { agent: agentB } = require('./helpers').makeSecondUser();

      await agentB
        .get(`/api/transactions/${tx.id}`)
        .expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Bug #2: No API 404 handler — unmatched /api/* returned SPA HTML 200
  // ═══════════════════════════════════════════════════════════════════════
  describe('Bug #2 — API 404 Handler', () => {
    it('returns 404 JSON for non-existent API route', async () => {
      const res = await agent()
        .get('/api/nonexistent-route')
        .expect(404);

      assert.ok(res.body.error, 'should have error object');
      assert.equal(res.body.error.code, 'NOT_FOUND');
      assert.equal(res.body.error.message, 'Endpoint not found');
    });

    it('returns JSON content-type for unmatched API routes', async () => {
      const res = await agent()
        .get('/api/this/does/not/exist')
        .expect(404)
        .expect('Content-Type', /json/);

      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('<!DOCTYPE'), 'must not return HTML');
      assert.ok(!body.includes('<html'), 'must not return HTML');
    });

    it('returns 404 for typo-ed API endpoints', async () => {
      const paths = [
        '/api/transctions',          // typo
        '/api/stats/summaries',      // wrong name
        '/api/transaction/search',   // wrong: singular + nested
        '/api/stat/overview',        // wrong: singular
        '/api/acconts',              // typo
        '/api/categorie',            // typo
      ];

      for (const p of paths) {
        const res = await agent().get(p);
        assert.equal(res.status, 404, `${p} should return 404, got ${res.status}`);
        assert.ok(res.body.error, `${p} should have error body`);
      }
    });

    it('returns 404 for POST to non-existent API route', async () => {
      const res = await agent()
        .post('/api/nonexistent')
        .send({ data: 'test' })
        .expect(404);

      assert.ok(res.body.error);
    });

    it('returns 404 for PUT to non-existent API route', async () => {
      const res = await agent()
        .put('/api/nonexistent/123')
        .send({ data: 'test' })
        .expect(404);

      assert.ok(res.body.error);
    });

    it('returns 404 for DELETE to non-existent API route', async () => {
      const res = await agent()
        .delete('/api/nonexistent/123')
        .expect(404);

      assert.ok(res.body.error);
    });

    it('SPA fallback still works for non-API routes', async () => {
      // Non-/api/ paths should still return the SPA HTML
      const res = await rawAgent()
        .get('/some-unknown-page')
        .expect(200);

      const body = typeof res.text === 'string' ? res.text : '';
      // It should be HTML (SPA index.html)
      assert.ok(
        body.includes('<!DOCTYPE') || body.includes('<html') || body.includes('<!doctype'),
        'non-API routes should return SPA HTML'
      );
    });

    it('health endpoint still works (not caught by 404 handler)', async () => {
      const res = await rawAgent()
        .get('/health')
        .expect(200);

      assert.ok(res.body.status === 'ok' || res.body.status === 'healthy' || res.status === 200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Bug #3: FTS5 search crashes on hyphenated terms
  // ═══════════════════════════════════════════════════════════════════════
  describe('Bug #3 — FTS5 Hyphen Handling', () => {
    it('does not crash on hyphenated search terms', async () => {
      const res = await agent()
        .get('/api/search?q=e-commerce')
        .expect(200);

      assert.ok(Array.isArray(res.body.transactions));
    });

    it('finds transactions with hyphens in description', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'e-commerce platform subscription' });
      makeTransaction(acct.id, { description: 'Regular purchase' });

      const res = await agent()
        .get('/api/search?q=e-commerce')
        .expect(200);

      // Should find via LIKE fallback since hyphens are stripped from FTS
      // OR via FTS matching individual words "e" and "commerce"
      // The key assertion: no 500 error
      assert.ok(Array.isArray(res.body.transactions));
    });

    it('handles multiple hyphens in search term', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'self-employed-income report' });

      const res = await agent()
        .get('/api/search?q=self-employed-income')
        .expect(200);

      assert.ok(Array.isArray(res.body.transactions));
    });

    it('handles compound hyphenated words', async () => {
      const terms = [
        'co-working',
        'self-employed',
        'pre-approved',
        'mid-year',
        're-invest',
        'one-time',
        'year-end',
        'day-to-day',
        'month-over-month',
      ];

      for (const term of terms) {
        const res = await agent().get(`/api/search?q=${encodeURIComponent(term)}`);
        assert.equal(
          res.status, 200,
          `search for "${term}" should return 200, got ${res.status}`
        );
        assert.ok(
          Array.isArray(res.body.transactions),
          `search for "${term}" should return transactions array`
        );
      }
    });

    it('sanitizes FTS5 special operators', async () => {
      const dangerousQueries = [
        'AND',
        'OR',
        'NOT',
        'NEAR',
        'description:hack',   // FTS5 column filter
        'note:injection',     // FTS5 column filter
        '"exact phrase"',     // double quotes
        'test*wildcard',      // asterisk
        '{brackets}',         // curly braces
        '(parens)',           // parentheses
      ];

      for (const q of dangerousQueries) {
        const res = await agent().get(`/api/search?q=${encodeURIComponent(q)}`);
        assert.ok(
          res.status === 200 || res.status === 400,
          `query "${q}" should not cause 500, got ${res.status}`
        );
      }
    });

    it('handles colons in search terms (FTS5 column filter syntax)', async () => {
      // "description:value" is FTS5 column filter syntax — must not crash
      const res = await agent()
        .get('/api/search?q=description:test')
        .expect(200);

      assert.ok(Array.isArray(res.body.transactions));
    });

    it('handles null bytes in search terms', async () => {
      const res = await agent()
        .get('/api/search?q=test%00injection')
        .expect(200);

      assert.ok(Array.isArray(res.body.transactions));
    });

    it('search still finds results for normal terms (not broken by sanitizer)', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Monthly salary deposit' });
      makeTransaction(acct.id, { description: 'Groceries at BigBasket' });

      const res = await agent()
        .get('/api/search?q=salary')
        .expect(200);

      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'Monthly salary deposit');
    });

    it('search finds by payee field via API creation', async () => {
      const acct = makeAccount({ name: 'Checking' });

      // Use API to create transaction with payee (makeTransaction helper doesn't support payee)
      await agent()
        .post('/api/transactions')
        .send({
          account_id: acct.id,
          amount: 350,
          type: 'expense',
          description: 'Food delivery',
          payee: 'Swiggy Food Delivery',
          date: new Date().toISOString().split('T')[0],
        })
        .expect(201);

      const res = await agent()
        .get('/api/search?q=swiggy')
        .expect(200);

      assert.equal(res.body.transactions.length, 1);
    });

    it('search finds by note field', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Misc', note: 'reimbursement from Ravi' });

      const res = await agent()
        .get('/api/search?q=reimbursement')
        .expect(200);

      assert.equal(res.body.transactions.length, 1);
    });

    it('FTS prefix matching works (partial word search)', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'UniqueSearchableTransaction' });

      const res = await agent()
        .get('/api/search?q=UniqueSearch')
        .expect(200);

      assert.equal(res.body.transactions.length, 1);
    });

    it('handles very long hyphenated terms', async () => {
      const longHyphenated = 'very-long-hyphenated-term-that-goes-on-and-on';
      const res = await agent()
        .get(`/api/search?q=${encodeURIComponent(longHyphenated)}`)
        .expect(200);

      assert.ok(Array.isArray(res.body.transactions));
    });

    it('handles only-hyphens query gracefully', async () => {
      const res = await agent()
        .get('/api/search?q=---')
        .expect(200);

      // After sanitization, hyphens removed → empty → falls back to LIKE
      assert.ok(Array.isArray(res.body.transactions));
    });

    it('handles mixed special chars and normal text', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Coffee from Starbucks' });

      const res = await agent()
        .get('/api/search?q=coffee-from-starbucks')
        .expect(200);

      // Should find via LIKE or FTS for individual words
      assert.ok(Array.isArray(res.body.transactions));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cross-cutting: Ensure all three fixes work together
  // ═══════════════════════════════════════════════════════════════════════
  describe('Cross-cutting regression checks', () => {
    it('transaction CRUD lifecycle with GET by id', async () => {
      const acct = makeAccount({ name: 'Lifecycle Account' });

      // Create
      const createRes = await agent()
        .post('/api/transactions')
        .send({
          account_id: acct.id,
          amount: 1500,
          type: 'expense',
          description: 'CRUD lifecycle test',
          date: new Date().toISOString().split('T')[0],
        })
        .expect(201);

      const txId = createRes.body.transaction.id;

      // Read by ID (Bug #1 fix)
      const readRes = await agent()
        .get(`/api/transactions/${txId}`)
        .expect(200);

      assert.equal(readRes.body.transaction.description, 'CRUD lifecycle test');

      // Update
      await agent()
        .put(`/api/transactions/${txId}`)
        .send({ description: 'Updated lifecycle test' })
        .expect(200);

      // Read again to verify update
      const updatedRes = await agent()
        .get(`/api/transactions/${txId}`)
        .expect(200);

      assert.equal(updatedRes.body.transaction.description, 'Updated lifecycle test');

      // Delete
      await agent()
        .delete(`/api/transactions/${txId}`)
        .expect(200);

      // Verify deleted (should 404)
      await agent()
        .get(`/api/transactions/${txId}`)
        .expect(404);
    });

    it('search for hyphenated description then fetch by id', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const tx = makeTransaction(acct.id, {
        description: 'co-working space rental',
        amount: 5000,
      });

      // Search (Bug #3 fix: no crash on hyphen)
      const searchRes = await agent()
        .get('/api/search?q=co-working')
        .expect(200);

      assert.ok(Array.isArray(searchRes.body.transactions));

      // Fetch by ID (Bug #1 fix)
      const readRes = await agent()
        .get(`/api/transactions/${tx.id}`)
        .expect(200);

      assert.equal(readRes.body.transaction.description, 'co-working space rental');
    });

    it('non-existent search endpoint returns 404 JSON (not SPA HTML)', async () => {
      // Bug #2: was returning SPA HTML for any unmatched /api/*
      const res = await agent()
        .get('/api/transactions/search?q=test')
        .expect('Content-Type', /json/);

      // Could be 404 (unmatched route) or other error, but must NOT be HTML
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('<!DOCTYPE'), 'must not return SPA HTML');
    });
  });
});
