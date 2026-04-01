// tests/multi-currency-transfers.test.js — Multi-currency transfer tests (v5.0.0)
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb } = require('./helpers');

describe('Multi-Currency Transfers', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ─── Migration 030: New columns ───
  describe('Migration 030 — Transaction conversion columns', () => {
    it('transactions table has original_amount column', () => {
      const cols = db.prepare("PRAGMA table_info('transactions')").all();
      const col = cols.find(c => c.name === 'original_amount');
      assert.ok(col, 'original_amount column should exist');
      assert.equal(col.type, 'REAL');
    });

    it('transactions table has original_currency column', () => {
      const cols = db.prepare("PRAGMA table_info('transactions')").all();
      const col = cols.find(c => c.name === 'original_currency');
      assert.ok(col, 'original_currency column should exist');
      assert.equal(col.type, 'TEXT');
    });

    it('transactions table has exchange_rate_used column', () => {
      const cols = db.prepare("PRAGMA table_info('transactions')").all();
      const col = cols.find(c => c.name === 'exchange_rate_used');
      assert.ok(col, 'exchange_rate_used column should exist');
      assert.equal(col.type, 'REAL');
    });

    it('migration 030 is recorded in _migrations', () => {
      const row = db.prepare("SELECT * FROM _migrations WHERE name = '030_transaction_conversion_columns.sql'").get();
      assert.ok(row, 'migration 030 should be recorded');
    });
  });

  // ─── Cross-currency transfer: core fix ───
  describe('Cross-currency transfer with exchange rate', () => {
    let usdAcctId, inrAcctId;

    beforeEach(async () => {
      // Create USD account
      const usdRes = await agent().post('/api/accounts')
        .send({ name: 'USD Savings', type: 'savings', balance: 10000, currency: 'USD' });
      usdAcctId = usdRes.body.account.id;

      // Create INR account
      const inrRes = await agent().post('/api/accounts')
        .send({ name: 'INR Salary', type: 'checking', balance: 500000, currency: 'INR' });
      inrAcctId = inrRes.body.account.id;

      // Seed exchange rate: 1 USD = 83.50 INR
      db.prepare('INSERT INTO exchange_rates (base_currency, target_currency, rate, date) VALUES (?, ?, ?, ?)')
        .run('USD', 'INR', 83.50, '2026-04-01');
    });

    it('transfer USD→INR converts amount using exchange rate', async () => {
      const res = await agent().post('/api/transactions')
        .send({
          account_id: usdAcctId,
          transfer_to_account_id: inrAcctId,
          type: 'transfer',
          amount: 1000,
          currency: 'USD',
          description: 'Transfer to INR account',
          date: '2026-04-01',
        });
      assert.equal(res.status, 201);
      const tx = res.body.transaction;

      // Source transaction: 1000 USD debited
      assert.equal(tx.amount, 1000);
      assert.equal(tx.currency, 'USD');

      // Verify source account balance: 10000 - 1000 = 9000 USD
      const srcAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(usdAcctId);
      assert.equal(srcAcct.balance, 9000);

      // Verify destination account balance: 500000 + 83500 = 583500 INR
      const dstAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(inrAcctId);
      assert.equal(dstAcct.balance, 583500);

      // Verify destination transaction stores conversion data
      const paired = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx.transfer_transaction_id);
      assert.equal(paired.amount, 83500);
      assert.equal(paired.currency, 'INR');
      assert.equal(paired.original_amount, 1000);
      assert.equal(paired.original_currency, 'USD');
      assert.equal(paired.exchange_rate_used, 83.50);
    });

    it('transfer INR→USD converts using reverse rate', async () => {
      const res = await agent().post('/api/transactions')
        .send({
          account_id: inrAcctId,
          transfer_to_account_id: usdAcctId,
          type: 'transfer',
          amount: 83500,
          currency: 'INR',
          description: 'Transfer to USD account',
          date: '2026-04-01',
        });
      assert.equal(res.status, 201);

      // Source balance: 500000 - 83500 = 416500 INR
      const srcAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(inrAcctId);
      assert.equal(srcAcct.balance, 416500);

      // Dest balance: 10000 + 1000 = 11000 USD (83500 / 83.50)
      const dstAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(usdAcctId);
      assert.equal(dstAcct.balance, 11000);
    });

    it('same-currency transfer works without conversion (USD→USD)', async () => {
      // Create second USD account
      const usd2 = await agent().post('/api/accounts')
        .send({ name: 'USD Checking', type: 'checking', balance: 5000, currency: 'USD' });
      const usd2Id = usd2.body.account.id;

      const res = await agent().post('/api/transactions')
        .send({
          account_id: usdAcctId,
          transfer_to_account_id: usd2Id,
          type: 'transfer',
          amount: 2000,
          currency: 'USD',
          description: 'USD to USD transfer',
          date: '2026-04-01',
        });
      assert.equal(res.status, 201);

      const srcAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(usdAcctId);
      assert.equal(srcAcct.balance, 8000);

      const dstAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(usd2Id);
      assert.equal(dstAcct.balance, 7000);

      // No conversion data stored for same-currency
      const paired = db.prepare('SELECT * FROM transactions WHERE id = ?').get(res.body.transaction.transfer_transaction_id);
      assert.equal(paired.original_amount, null);
      assert.equal(paired.exchange_rate_used, null);
    });

    it('transfer fails gracefully when no exchange rate exists', async () => {
      // Create EUR account (no EUR→INR rate seeded)
      const eurRes = await agent().post('/api/accounts')
        .send({ name: 'EUR Account', type: 'savings', balance: 5000, currency: 'EUR' });
      const eurAcctId = eurRes.body.account.id;

      const res = await agent().post('/api/transactions')
        .send({
          account_id: eurAcctId,
          transfer_to_account_id: inrAcctId,
          type: 'transfer',
          amount: 1000,
          currency: 'EUR',
          description: 'EUR to INR transfer',
          date: '2026-04-01',
        });
      // Should fail with validation error — no rate available
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('transfer with explicit exchange_rate overrides lookup', async () => {
      const res = await agent().post('/api/transactions')
        .send({
          account_id: usdAcctId,
          transfer_to_account_id: inrAcctId,
          type: 'transfer',
          amount: 500,
          currency: 'USD',
          description: 'Transfer with custom rate',
          date: '2026-04-01',
          exchange_rate: 84.00,
        });
      assert.equal(res.status, 201);

      // Dest should get 500 * 84 = 42000 INR
      const dstAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(inrAcctId);
      assert.equal(dstAcct.balance, 542000);

      // Verify stored rate
      const paired = db.prepare('SELECT * FROM transactions WHERE id = ?').get(res.body.transaction.transfer_transaction_id);
      assert.equal(paired.exchange_rate_used, 84.00);
      assert.equal(paired.amount, 42000);
    });

    it('delete cross-currency transfer reverses both balances correctly', async () => {
      // Create a cross-currency transfer
      const res = await agent().post('/api/transactions')
        .send({
          account_id: usdAcctId,
          transfer_to_account_id: inrAcctId,
          type: 'transfer',
          amount: 1000,
          currency: 'USD',
          description: 'To delete',
          date: '2026-04-01',
        });
      const txId = res.body.transaction.id;

      // Delete the transfer
      await agent().delete(`/api/transactions/${txId}`);

      // Balances restored to original
      const srcAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(usdAcctId);
      assert.equal(srcAcct.balance, 10000);

      const dstAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(inrAcctId);
      assert.equal(dstAcct.balance, 500000);
    });
  });

  // ─── Transaction with foreign currency recording ───
  describe('Foreign currency transaction recording', () => {
    let inrAcctId;

    beforeEach(async () => {
      const res = await agent().post('/api/accounts')
        .send({ name: 'INR Main', type: 'checking', balance: 100000, currency: 'INR' });
      inrAcctId = res.body.account.id;

      db.prepare('INSERT INTO exchange_rates (base_currency, target_currency, rate, date) VALUES (?, ?, ?, ?)')
        .run('USD', 'INR', 83.50, '2026-04-01');
    });

    it('expense in foreign currency stores conversion fields', async () => {
      const res = await agent().post('/api/transactions')
        .send({
          account_id: inrAcctId,
          type: 'expense',
          amount: 100,
          currency: 'USD',
          description: 'Amazon purchase in USD',
          date: '2026-04-01',
        });
      assert.equal(res.status, 201);
      const tx = res.body.transaction;

      // Stored in account currency (INR)
      assert.equal(tx.amount, 8350);
      assert.equal(tx.currency, 'INR');
      assert.equal(tx.original_amount, 100);
      assert.equal(tx.original_currency, 'USD');
      assert.equal(tx.exchange_rate_used, 83.50);

      // Balance updated in INR
      const acct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(inrAcctId);
      assert.equal(acct.balance, 91650); // 100000 - 8350
    });

    it('same-currency expense has no conversion fields', async () => {
      const res = await agent().post('/api/transactions')
        .send({
          account_id: inrAcctId,
          type: 'expense',
          amount: 500,
          currency: 'INR',
          description: 'Local purchase',
          date: '2026-04-01',
        });
      assert.equal(res.status, 201);
      const tx = res.body.transaction;
      assert.equal(tx.amount, 500);
      assert.equal(tx.currency, 'INR');
      assert.equal(tx.original_amount, null);
      assert.equal(tx.original_currency, null);
      assert.equal(tx.exchange_rate_used, null);
    });

    it('income in foreign currency stores conversion fields', async () => {
      const res = await agent().post('/api/transactions')
        .send({
          account_id: inrAcctId,
          type: 'income',
          amount: 2000,
          currency: 'USD',
          description: 'Freelance payment in USD',
          date: '2026-04-01',
        });
      assert.equal(res.status, 201);
      const tx = res.body.transaction;
      assert.equal(tx.amount, 167000);
      assert.equal(tx.currency, 'INR');
      assert.equal(tx.original_amount, 2000);
      assert.equal(tx.original_currency, 'USD');
      assert.equal(tx.exchange_rate_used, 83.50);

      const acct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(inrAcctId);
      assert.equal(acct.balance, 267000); // 100000 + 167000
    });
  });

  // ─── Currency filter on transaction list ───
  describe('Transaction currency filter', () => {
    beforeEach(async () => {
      const usd = await agent().post('/api/accounts')
        .send({ name: 'USD Acct', type: 'savings', balance: 5000, currency: 'USD' });
      const inr = await agent().post('/api/accounts')
        .send({ name: 'INR Acct', type: 'checking', balance: 50000, currency: 'INR' });

      await agent().post('/api/transactions')
        .send({ account_id: usd.body.account.id, type: 'expense', amount: 100, description: 'USD expense', date: '2026-04-01' });
      await agent().post('/api/transactions')
        .send({ account_id: inr.body.account.id, type: 'expense', amount: 500, description: 'INR expense', date: '2026-04-01' });
      await agent().post('/api/transactions')
        .send({ account_id: usd.body.account.id, type: 'income', amount: 200, description: 'USD income', date: '2026-04-01' });
    });

    it('filter transactions by currency=USD', async () => {
      const res = await agent().get('/api/transactions?currency=USD');
      assert.equal(res.status, 200);
      assert.equal(res.body.transactions.length, 2);
      for (const tx of res.body.transactions) {
        assert.equal(tx.currency, 'USD');
      }
    });

    it('filter transactions by currency=INR', async () => {
      const res = await agent().get('/api/transactions?currency=INR');
      assert.equal(res.status, 200);
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].currency, 'INR');
    });

    it('no currency filter returns all transactions', async () => {
      const res = await agent().get('/api/transactions');
      assert.equal(res.status, 200);
      assert.equal(res.body.transactions.length, 3);
    });
  });

  // ─── Schema validation for new fields ───
  describe('Schema validation', () => {
    it('exchange_rate must be positive number', async () => {
      const acct = await agent().post('/api/accounts')
        .send({ name: 'Test', type: 'checking', balance: 1000, currency: 'USD' });
      const acct2 = await agent().post('/api/accounts')
        .send({ name: 'Test2', type: 'checking', balance: 1000, currency: 'INR' });

      const res = await agent().post('/api/transactions')
        .send({
          account_id: acct.body.account.id,
          transfer_to_account_id: acct2.body.account.id,
          type: 'transfer',
          amount: 100,
          currency: 'USD',
          description: 'Bad rate',
          date: '2026-04-01',
          exchange_rate: -5,
        });
      assert.equal(res.status, 400);
    });

    it('exchange_rate is optional for same-currency', async () => {
      const acct = await agent().post('/api/accounts')
        .send({ name: 'Test', type: 'checking', balance: 1000, currency: 'USD' });
      const acct2 = await agent().post('/api/accounts')
        .send({ name: 'Test2', type: 'checking', balance: 1000, currency: 'USD' });

      const res = await agent().post('/api/transactions')
        .send({
          account_id: acct.body.account.id,
          transfer_to_account_id: acct2.body.account.id,
          type: 'transfer',
          amount: 100,
          currency: 'USD',
          description: 'Same currency',
          date: '2026-04-01',
        });
      assert.equal(res.status, 201);
    });
  });

  // ─── Reports currency normalization ───
  describe('Reports currency normalization', () => {
    beforeEach(async () => {
      const usd = await agent().post('/api/accounts')
        .send({ name: 'USD', type: 'savings', balance: 10000, currency: 'USD' });
      const inr = await agent().post('/api/accounts')
        .send({ name: 'INR', type: 'checking', balance: 500000, currency: 'INR' });

      db.prepare('INSERT INTO exchange_rates (base_currency, target_currency, rate, date) VALUES (?, ?, ?, ?)')
        .run('USD', 'INR', 83.50, '2026-04-01');

      await agent().post('/api/transactions')
        .send({ account_id: usd.body.account.id, type: 'expense', amount: 100, description: 'USD expense', date: '2026-04-01' });
      await agent().post('/api/transactions')
        .send({ account_id: inr.body.account.id, type: 'expense', amount: 5000, description: 'INR expense', date: '2026-04-01' });
    });

    it('monthly report includes currency_breakdown', async () => {
      const res = await agent().get('/api/reports/monthly?month=2026-04');
      assert.equal(res.status, 200);
      assert.ok(res.body.currency_breakdown, 'should include currency_breakdown');
    });

    it('stats overview includes currency_balances', async () => {
      const res = await agent().get('/api/stats/overview');
      assert.equal(res.status, 200);
      assert.ok(res.body.currency_balances, 'should include currency_balances');
    });
  });

  // ─── Dashboard currency breakdown ───
  describe('Dashboard currency breakdown widget', () => {
    it('GET /api/stats/currency-breakdown returns per-currency totals', async () => {
      await agent().post('/api/accounts')
        .send({ name: 'USD', type: 'savings', balance: 10000, currency: 'USD' });
      await agent().post('/api/accounts')
        .send({ name: 'INR', type: 'checking', balance: 500000, currency: 'INR' });
      await agent().post('/api/accounts')
        .send({ name: 'EUR', type: 'savings', balance: 3000, currency: 'EUR' });

      const res = await agent().get('/api/stats/currency-breakdown');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.breakdown));
      assert.ok(res.body.breakdown.length >= 3);

      const usd = res.body.breakdown.find(b => b.currency === 'USD');
      assert.ok(usd);
      assert.equal(usd.total_balance, 10000);
      assert.equal(usd.account_count, 1);
    });
  });
});
