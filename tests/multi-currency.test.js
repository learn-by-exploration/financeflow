const { describe, it, before, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeTransaction, today } = require('./helpers');
const { convert, buildRateMap } = require('../src/utils/currency-converter');

describe('Multi-Currency Display (v0.3.12)', () => {
  before(() => setup());
  afterEach(() => cleanDb());
  after(() => teardown());

  // ─── Exchange Rate CRUD ───

  describe('POST /api/exchange-rates', () => {
    it('should add an exchange rate', async () => {
      const res = await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '2026-03-30' })
        .expect(201);
      assert.ok(res.body.rate.id);
      assert.equal(res.body.rate.base_currency, 'USD');
      assert.equal(res.body.rate.target_currency, 'INR');
      assert.equal(res.body.rate.rate, 83.5);
      assert.equal(res.body.rate.date, '2026-03-30');
    });

    it('should reject same base and target currency', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'USD', rate: 1, date: '2026-03-30' })
        .expect(400);
    });

    it('should reject invalid currency code length', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'US', target_currency: 'INR', rate: 83.5, date: '2026-03-30' })
        .expect(400);
    });

    it('should reject negative rate', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: -1, date: '2026-03-30' })
        .expect(400);
    });

    it('should reject invalid date format', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '30-03-2026' })
        .expect(400);
    });

    it('should reject duplicate rate for same pair and date', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '2026-03-30' })
        .expect(201);
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 84.0, date: '2026-03-30' })
        .expect(400);
    });
  });

  describe('GET /api/exchange-rates', () => {
    it('should list exchange rates', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '2026-03-30' });
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'EUR', target_currency: 'INR', rate: 90.2, date: '2026-03-30' });

      const res = await agent().get('/api/exchange-rates').expect(200);
      assert.equal(res.body.rates.length, 2);
      assert.equal(res.body.total, 2);
    });

    it('should filter by base_currency', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '2026-03-30' });
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'EUR', target_currency: 'INR', rate: 90.2, date: '2026-03-30' });

      const res = await agent().get('/api/exchange-rates?base_currency=USD').expect(200);
      assert.equal(res.body.rates.length, 1);
      assert.equal(res.body.rates[0].base_currency, 'USD');
    });
  });

  describe('DELETE /api/exchange-rates/:id', () => {
    it('should delete an exchange rate', async () => {
      const created = await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '2026-03-30' })
        .expect(201);

      await agent()
        .delete(`/api/exchange-rates/${created.body.rate.id}`)
        .expect(200);

      const res = await agent().get('/api/exchange-rates').expect(200);
      assert.equal(res.body.rates.length, 0);
    });

    it('should 404 for non-existent rate', async () => {
      await agent().delete('/api/exchange-rates/99999').expect(404);
    });
  });

  // ─── Currency Conversion Utility ───

  describe('currency-converter utility', () => {
    it('should convert using direct rate', () => {
      const rateMap = buildRateMap([
        { base_currency: 'USD', target_currency: 'INR', rate: 83.5 },
      ]);
      const result = convert(100, 'USD', 'INR', rateMap);
      assert.equal(result.converted, 8350);
      assert.equal(result.rate, 83.5);
    });

    it('should return same amount for same currency', () => {
      const result = convert(100, 'INR', 'INR', {});
      assert.equal(result.converted, 100);
      assert.equal(result.rate, 1);
    });

    it('should calculate reverse rate (INR→USD from USD→INR)', () => {
      const rateMap = buildRateMap([
        { base_currency: 'USD', target_currency: 'INR', rate: 83.5 },
      ]);
      const result = convert(8350, 'INR', 'USD', rateMap);
      assert.ok(result);
      assert.ok(Math.abs(result.converted - 100) < 0.01);
    });

    it('should return null for missing rate', () => {
      const result = convert(100, 'USD', 'JPY', {});
      assert.equal(result, null);
    });

    it('should build rate map from array', () => {
      const rates = [
        { base_currency: 'USD', target_currency: 'INR', rate: 83.5 },
        { base_currency: 'EUR', target_currency: 'INR', rate: 90.2 },
      ];
      const map = buildRateMap(rates);
      assert.equal(map['USD->INR'], 83.5);
      assert.equal(map['EUR->INR'], 90.2);
    });
  });

  // ─── Net Worth Multi-Currency ───

  describe('GET /api/net-worth (multi-currency)', () => {
    it('should convert foreign currency accounts to default currency', async () => {
      // Create INR account
      makeAccount({ name: 'INR Savings', currency: 'INR', balance: 100000, type: 'savings' });
      // Create USD account
      makeAccount({ name: 'USD Account', currency: 'USD', balance: 1000, type: 'checking' });

      // Add USD→INR rate
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: today() });

      const res = await agent().get('/api/net-worth').expect(200);
      assert.equal(res.body.currency, 'INR');
      // INR 100000 + USD 1000 * 83.5 = 183500
      assert.equal(res.body.net_worth, 183500);
      assert.equal(res.body.total_assets, 183500);
    });

    it('should handle missing exchange rate gracefully with unconvertible list', async () => {
      makeAccount({ name: 'INR Savings', currency: 'INR', balance: 100000, type: 'savings' });
      makeAccount({ name: 'JPY Account', currency: 'JPY', balance: 50000, type: 'checking' });
      // No JPY→INR rate added

      const res = await agent().get('/api/net-worth').expect(200);
      // Only INR account contributes to net worth
      assert.equal(res.body.net_worth, 100000);
      assert.ok(res.body.unconvertible);
      assert.equal(res.body.unconvertible.length, 1);
      assert.equal(res.body.unconvertible[0].currency, 'JPY');
    });

    it('should use reverse rate for conversion', async () => {
      makeAccount({ name: 'INR Savings', currency: 'INR', balance: 83500, type: 'savings' });
      makeAccount({ name: 'EUR Account', currency: 'EUR', balance: 1000, type: 'checking' });

      // Only add INR→EUR rate (reverse of what we need)
      // We need EUR→INR but only have this direction via reverse lookup
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'EUR', target_currency: 'INR', rate: 90.0, date: today() });

      const res = await agent().get('/api/net-worth').expect(200);
      // EUR 1000 * 90 = 90000 INR, plus 83500 INR
      assert.equal(res.body.net_worth, 173500);
    });

    it('should handle liabilities in foreign currency', async () => {
      makeAccount({ name: 'INR Savings', currency: 'INR', balance: 200000, type: 'savings' });
      makeAccount({ name: 'USD Credit Card', currency: 'USD', balance: -500, type: 'credit_card' });

      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: today() });

      const res = await agent().get('/api/net-worth').expect(200);
      // Assets: 200000, Liabilities: 500 * 83.5 = 41750
      assert.equal(res.body.total_assets, 200000);
      assert.equal(res.body.total_liabilities, 41750);
      assert.equal(res.body.net_worth, 158250);
    });
  });

  // ─── Transaction Currency Display ───

  describe('GET /api/transactions (multi-currency)', () => {
    it('should include converted_amount for foreign currency transactions', async () => {
      const account = makeAccount({ name: 'USD Account', currency: 'USD', balance: 10000 });

      // Add exchange rate
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: today() });

      // Create a USD transaction
      makeTransaction(account.id, { amount: 50, currency: 'USD', description: 'Foreign purchase' });

      const res = await agent().get('/api/transactions').expect(200);
      assert.ok(res.body.transactions.length > 0);
      const txn = res.body.transactions.find(t => t.currency === 'USD');
      assert.ok(txn);
      assert.equal(txn.converted_amount, 4175); // 50 * 83.5
      assert.equal(txn.converted_currency, 'INR');
    });

    it('should not include converted_amount for default currency transactions', async () => {
      const account = makeAccount({ name: 'INR Account', currency: 'INR', balance: 50000 });
      makeTransaction(account.id, { amount: 100, currency: 'INR', description: 'Local purchase' });

      const res = await agent().get('/api/transactions').expect(200);
      const txn = res.body.transactions[0];
      assert.equal(txn.converted_amount, undefined);
      assert.equal(txn.converted_currency, undefined);
    });

    it('should set converted_amount to null when rate is missing', async () => {
      const account = makeAccount({ name: 'JPY Account', currency: 'JPY', balance: 100000 });
      makeTransaction(account.id, { amount: 5000, currency: 'JPY', description: 'Tokyo dinner' });

      const res = await agent().get('/api/transactions').expect(200);
      const txn = res.body.transactions.find(t => t.currency === 'JPY');
      assert.ok(txn);
      assert.equal(txn.converted_amount, null);
      assert.equal(txn.converted_currency, 'INR');
    });
  });

  // ─── Exchange Rate Repository (reverse rate) ───

  describe('Exchange rate repository', () => {
    it('should derive reverse rate via getLatestRate', async () => {
      // Add USD→INR rate
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '2026-03-30' });

      const { db } = setup();
      const createExchangeRateRepository = require('../src/repositories/exchange-rate.repository');
      const rateRepo = createExchangeRateRepository({ db });

      // Direct lookup
      const direct = rateRepo.getLatestRate('USD', 'INR');
      assert.ok(direct);
      assert.equal(direct.rate, 83.5);

      // Reverse lookup — INR→USD
      const reverse = rateRepo.getLatestRate('INR', 'USD');
      assert.ok(reverse);
      assert.ok(Math.abs(reverse.rate - (1 / 83.5)) < 0.0001);
      assert.equal(reverse.base_currency, 'INR');
      assert.equal(reverse.target_currency, 'USD');
    });

    it('should get rate by specific date', async () => {
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 83.5, date: '2026-03-28' });
      await agent()
        .post('/api/exchange-rates')
        .send({ base_currency: 'USD', target_currency: 'INR', rate: 84.0, date: '2026-03-30' });

      const { db } = setup();
      const createExchangeRateRepository = require('../src/repositories/exchange-rate.repository');
      const rateRepo = createExchangeRateRepository({ db });

      const rate28 = rateRepo.getRate('USD', 'INR', '2026-03-28');
      assert.equal(rate28.rate, 83.5);

      const rate30 = rateRepo.getRate('USD', 'INR', '2026-03-30');
      assert.equal(rate30.rate, 84.0);
    });

    it('should return null for non-existent rate', async () => {
      const { db } = setup();
      const createExchangeRateRepository = require('../src/repositories/exchange-rate.repository');
      const rateRepo = createExchangeRateRepository({ db });

      const result = rateRepo.getRate('GBP', 'JPY', '2026-01-01');
      assert.equal(result, null);

      const latest = rateRepo.getLatestRate('GBP', 'JPY');
      assert.equal(latest, null);
    });
  });
});
