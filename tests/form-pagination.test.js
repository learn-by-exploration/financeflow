const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

let db;

before(() => {
  const s = setup();
  db = s.db;
});
after(() => teardown());
beforeEach(() => cleanDb());

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ════════════════════════════════════════════
// FORM VALIDATION (server-side via API)
// ════════════════════════════════════════════

describe('Form Validation & Pagination — v0.3.46', () => {

  // ─── Transaction validation ───

  describe('Transaction creation validation', () => {
    it('rejects transaction with missing description (400)', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 100,
        date: today(),
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('rejects transaction with zero amount (400)', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 0,
        description: 'Nothing',
        date: today(),
      });
      assert.equal(res.status, 400);
    });

    it('rejects transaction with negative amount (400)', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: -50,
        description: 'Negative',
        date: today(),
      });
      assert.equal(res.status, 400);
    });

    it('creates valid transaction (201)', async () => {
      const acct = makeAccount({ balance: 5000 });
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 250,
        description: 'Groceries',
        date: today(),
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.transaction);
      assert.equal(res.body.transaction.description, 'Groceries');
      assert.equal(res.body.transaction.amount, 250);
    });

    it('rejects transaction with invalid type (400)', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'refund',
        amount: 100,
        description: 'Bad type',
        date: today(),
      });
      assert.equal(res.status, 400);
    });
  });

  // ─── Account validation ───

  describe('Account creation validation', () => {
    it('rejects account without name (400)', async () => {
      const res = await agent().post('/api/accounts').send({ type: 'checking' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('creates valid account (201)', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'My Savings',
        type: 'savings',
        balance: 10000,
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.account.name, 'My Savings');
    });
  });

  // ─── Budget validation ───

  describe('Budget creation validation', () => {
    it('rejects budget without name (400)', async () => {
      const res = await agent().post('/api/budgets').send({ period: 'monthly' });
      assert.equal(res.status, 400);
    });

    it('rejects budget with invalid period (400)', async () => {
      const res = await agent().post('/api/budgets').send({ name: 'Test', period: 'biweekly' });
      assert.equal(res.status, 400);
    });

    it('creates valid budget (201)', async () => {
      const res = await agent().post('/api/budgets').send({
        name: 'March Budget',
        period: 'monthly',
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.id);
    });
  });

  // ─── Pagination ───

  describe('Pagination controls', () => {
    it('pagination params (page via offset, limit) work correctly', async () => {
      const acct = makeAccount();
      for (let i = 0; i < 5; i++) {
        makeTransaction(acct.id, { description: `Txn ${i}`, amount: 10 * (i + 1) });
      }
      const res = await agent().get('/api/transactions?limit=2&offset=0').expect(200);
      assert.equal(res.body.transactions.length, 2);
      assert.equal(res.body.total, 5);
      assert.equal(res.body.limit, 2);
      assert.equal(res.body.offset, 0);
    });

    it('offset moves to next page of results', async () => {
      const acct = makeAccount();
      for (let i = 0; i < 5; i++) {
        makeTransaction(acct.id, { description: `Txn ${i}` });
      }
      const res = await agent().get('/api/transactions?limit=2&offset=2').expect(200);
      assert.equal(res.body.transactions.length, 2);
      assert.equal(res.body.offset, 2);
    });

    it('page beyond range returns empty results (not error)', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'Only one' });
      const res = await agent().get('/api/transactions?limit=10&offset=100').expect(200);
      assert.equal(res.body.transactions.length, 0);
      assert.equal(res.body.total, 1);
    });

    it('default pagination values work when no params given', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'Default test' });
      const res = await agent().get('/api/transactions').expect(200);
      assert.ok(res.body.transactions.length >= 1);
      assert.equal(res.body.limit, 50);
      assert.equal(res.body.offset, 0);
    });
  });
});
