const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction } = require('./helpers');

describe('Phase 5 – Indian Market Fit', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ─── 5.1 Financial Year Toggle ────────────────────────────────────────

  describe('Financial Year Preferences', () => {
    it('should accept financial_year_start in preferences (1-12)', async () => {
      const res = await agent(app).put('/api/preferences').send({ financial_year_start: 4 });
      assert.equal(res.status, 200);
      assert.equal(res.body.preferences.financial_year_start, 4);
    });

    it('GET /api/preferences returns financial_year_start', async () => {
      await agent(app).put('/api/preferences').send({ financial_year_start: 4 });
      const res = await agent(app).get('/api/preferences');
      assert.equal(res.status, 200);
      assert.equal(res.body.preferences.financial_year_start, 4);
    });

    it('should reject financial_year_start = 0', async () => {
      const res = await agent(app).put('/api/preferences').send({ financial_year_start: 0 });
      assert.equal(res.status, 400);
    });

    it('should reject financial_year_start = 13', async () => {
      const res = await agent(app).put('/api/preferences').send({ financial_year_start: 13 });
      assert.equal(res.status, 400);
    });

    it('should reject financial_year_start = -1', async () => {
      const res = await agent(app).put('/api/preferences').send({ financial_year_start: -1 });
      assert.equal(res.status, 400);
    });

    it('should default financial_year_start to 1 when not set', async () => {
      const res = await agent(app).get('/api/preferences');
      assert.equal(res.status, 200);
      assert.equal(res.body.preferences.financial_year_start, 1);
    });

    it('GET /api/stats/trends respects FY preference (start=4)', async () => {
      // Set FY to April
      await agent(app).put('/api/preferences').send({ financial_year_start: 4 });

      const acct = makeAccount();
      // Create transactions across FY boundary
      // FY 2025-26: April 2025 to March 2026
      makeTransaction(acct.id, { type: 'expense', amount: 1000, date: '2025-04-15', description: 'Apr expense' });
      makeTransaction(acct.id, { type: 'expense', amount: 2000, date: '2025-06-15', description: 'Jun expense' });
      makeTransaction(acct.id, { type: 'income', amount: 50000, date: '2026-01-15', description: 'Jan income' });
      makeTransaction(acct.id, { type: 'expense', amount: 3000, date: '2026-03-10', description: 'Mar expense' });

      const res = await agent(app).get('/api/stats/trends?months=12&fy=2025');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.trends));
      // FY trends should start from April
      if (res.body.trends.length > 0) {
        assert.ok(res.body.trends[0].month >= '2025-04');
      }
    });
  });

  // ─── 5.2 UPI Reference Field ─────────────────────────────────────────

  describe('UPI Reference Field', () => {
    it('POST /api/transactions with reference_id stores it', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 500,
        description: 'UPI payment',
        date: '2025-10-01',
        reference_id: 'UPI123456789',
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.transaction.reference_id, 'UPI123456789');
    });

    it('GET /api/transactions returns reference_id', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      await agent(app).post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 500,
        description: 'UPI payment',
        date: '2025-10-01',
        reference_id: 'UPI-REF-001',
      });
      const res = await agent(app).get('/api/transactions');
      assert.equal(res.status, 200);
      const txn = res.body.transactions.find(t => t.description === 'UPI payment');
      assert.ok(txn);
      assert.equal(txn.reference_id, 'UPI-REF-001');
    });

    it('reference_id is optional (null when not provided)', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 500,
        description: 'Cash payment',
        date: '2025-10-01',
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.transaction.reference_id, null);
    });

    it('reference_id validation: rejects > 50 chars', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent(app).post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 500,
        description: 'Test',
        date: '2025-10-01',
        reference_id: 'A'.repeat(51),
      });
      assert.equal(res.status, 400);
    });

    it('reference_id is searchable via search endpoint', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      await agent(app).post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 500,
        description: 'UPI payment',
        date: '2025-10-01',
        reference_id: 'UPIREF99887766',
      });
      const res = await agent(app).get('/api/search?q=UPIREF99887766');
      assert.equal(res.status, 200);
      assert.ok(res.body.transactions.length > 0);
      assert.equal(res.body.transactions[0].reference_id, 'UPIREF99887766');
    });

    it('PUT /api/transactions/:id can update reference_id', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const createRes = await agent(app).post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 500,
        description: 'UPI payment',
        date: '2025-10-01',
        reference_id: 'OLD-REF',
      });
      const txId = createRes.body.transaction.id;
      const res = await agent(app).put(`/api/transactions/${txId}`).send({
        reference_id: 'NEW-REF-123',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.transaction.reference_id, 'NEW-REF-123');
    });

    it('GET /api/export/transactions?format=json includes reference_id', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      await agent(app).post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat.id,
        type: 'expense',
        amount: 500,
        description: 'UPI export test',
        date: '2025-10-01',
        reference_id: 'EXPORT-REF-001',
      });
      const res = await agent(app).get('/api/export/transactions?format=json');
      assert.equal(res.status, 200);
      const txn = res.body.find(t => t.description === 'UPI export test');
      assert.ok(txn);
      assert.equal(txn.reference_id, 'EXPORT-REF-001');
    });
  });

  // ─── 5.3 Date and Number Formatting ──────────────────────────────────

  describe('Formatting utilities', () => {
    it('fmt() with en-IN formats with lakh grouping', () => {
      // We test the function logic directly since it's a frontend module
      // Simulate the fmt function
      function fmt(amount, currency = 'INR', locale = 'en-IN') {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount || 0);
      }
      const result = fmt(150000);
      // en-IN should produce lakh grouping: ₹1,50,000.00
      assert.ok(result.includes('1,50,000'), `Expected lakh grouping but got: ${result}`);
    });

    it('fmt() accepts locale parameter and formats accordingly', () => {
      function fmt(amount, currency = 'INR', locale = 'en-IN') {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount || 0);
      }
      const inResult = fmt(150000, 'INR', 'en-IN');
      assert.ok(inResult.includes('1,50,000'), `Expected lakh grouping but got: ${inResult}`);

      const usResult = fmt(150000, 'USD', 'en-US');
      assert.ok(usResult.includes('150,000'), `Expected US grouping but got: ${usResult}`);
    });
  });
});
