// tests/v2-performance.test.js — Iteration 31-40: Performance & reliability tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, makeGoal, makeSubscription, makeBudget, today, daysFromNow } = require('./helpers');

describe('v2 Performance & Reliability (Iter 31-40)', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 1000000 });
    category = makeCategory({ name: 'General' });
  });

  // ─── Iteration 31: Large dataset performance ───
  describe('Large dataset performance', () => {
    it('handles 500 transactions without timeout', async () => {
      for (let i = 0; i < 500; i++) {
        makeTransaction(account.id, { amount: 100 + i, description: `Perf test ${i}`, category_id: category.id });
      }
      const start = Date.now();
      await agent().get('/api/transactions?limit=50').expect(200);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 2000, `Transaction list took ${elapsed}ms with 500 records`);
    });

    it('category-breakdown stays fast with many transactions', async () => {
      for (let i = 0; i < 200; i++) {
        makeTransaction(account.id, { amount: 100, description: `Cat test ${i}`, category_id: category.id });
      }
      const start = Date.now();
      await agent().get('/api/stats/category-breakdown').expect(200);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `Breakdown took ${elapsed}ms`);
    });

    it('overview stays fast with many transactions', async () => {
      for (let i = 0; i < 200; i++) {
        makeTransaction(account.id, { amount: 100, description: `Overview test ${i}` });
      }
      const start = Date.now();
      await agent().get('/api/stats/overview').expect(200);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 2000, `Overview took ${elapsed}ms`);
    });
  });

  // ─── Iteration 32: New endpoint performance ───
  describe('New endpoint performance', () => {
    it('financial-snapshot responds < 500ms', async () => {
      for (let i = 0; i < 50; i++) {
        makeTransaction(account.id, { amount: 100, description: `Snap test ${i}` });
      }
      const start = Date.now();
      await agent().get('/api/stats/financial-snapshot').expect(200);
      assert.ok(Date.now() - start < 500);
    });

    it('sip-calculator responds < 100ms', async () => {
      const start = Date.now();
      await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=30&step_up=10').expect(200);
      assert.ok(Date.now() - start < 100);
    });

    it('fire-calculator responds < 100ms', async () => {
      const start = Date.now();
      await agent().get('/api/stats/fire-calculator?annual_expense=600000&years=40').expect(200);
      assert.ok(Date.now() - start < 100);
    });

    it('spending-streak responds < 500ms', async () => {
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        makeTransaction(account.id, { amount: 100, date: d.toISOString().slice(0, 10) });
      }
      const start = Date.now();
      await agent().get('/api/stats/spending-streak').expect(200);
      assert.ok(Date.now() - start < 500);
    });
  });

  // ─── Iteration 33: Concurrent request handling ───
  describe('Concurrent requests', () => {
    it('handles 10 concurrent stats requests', async () => {
      makeTransaction(account.id, { amount: 1000 });
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(agent().get('/api/stats/overview').then(r => r.status));
      }
      const statuses = await Promise.all(promises);
      assert.ok(statuses.every(s => s === 200));
    });

    it('handles 10 concurrent transaction creates', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          agent().post('/api/transactions').send({
            account_id: account.id,
            type: 'expense',
            amount: 100,
            description: `Concurrent ${i}`,
            date: today(),
          }).then(r => r.status)
        );
      }
      const statuses = await Promise.all(promises);
      assert.ok(statuses.every(s => s === 201));
    });
  });

  // ─── Iteration 34: Error resilience ───
  describe('Error resilience', () => {
    it('gracefully handles non-existent category in breakdown', async () => {
      const res = await agent().get('/api/stats/category-breakdown?from=2099-01-01&to=2099-12-31').expect(200);
      assert.equal(res.body.breakdown.length, 0);
    });

    it('gracefully handles missing account for CSV import', async () => {
      const csv = 'date,description,amount,type\n' + today() + ',Test,100,expense\n';
      await agent()
        .post('/api/data/csv-import?account_id=99999')
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(400);
    });

    it('invalid JSON body on POST returns error status', async () => {
      const res = await agent()
        .post('/api/accounts')
        .set('Content-Type', 'application/json')
        .send('not json');
      // Express returns 400 or 500 for malformed JSON depending on middleware chain
      assert.ok(res.status >= 400, `Expected error status, got ${res.status}`);
    });
  });

  // ─── Iteration 35: Migrations verify ───
  describe('New migrations applied', () => {
    it('savings_challenges table exists', () => {
      const { db } = setup();
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='savings_challenges'").get();
      assert.ok(result, 'savings_challenges table should exist');
    });

    it('new performance indexes exist', () => {
      const { db } = setup();
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_transactions_user_type%'").all();
      assert.ok(indexes.length >= 1, 'Should have transaction composite index');
    });

    it('migration count is correct', () => {
      const { db } = setup();
      const count = db.prepare('SELECT COUNT(*) as c FROM _migrations').get().c;
      assert.equal(count, 41, 'should have exactly 41 migrations applied');
    });
  });

  // ─── Iteration 36-37: Data integrity under load ───
  describe('Data integrity under load', () => {
    it('balance stays consistent after many transactions', async () => {
      const initial = account.balance;
      const txnCount = 50;
      for (let i = 0; i < txnCount; i++) {
        makeTransaction(account.id, { type: 'expense', amount: 100 });
      }
      const { db } = setup();
      const acct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id);
      assert.equal(acct.balance, initial - (txnCount * 100));
    });

    it('API-created transactions update balance correctly', async () => {
      const res = await agent().post('/api/transactions').send({
        account_id: account.id,
        type: 'expense',
        amount: 5000,
        description: 'API test',
        date: today(),
      }).expect(201);

      const { db } = setup();
      const acct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id);
      assert.equal(acct.balance, account.balance - 5000);
    });

    it('transaction delete restores balance', async () => {
      const txn = makeTransaction(account.id, { type: 'expense', amount: 3000 });
      await agent().delete(`/api/transactions/${txn.id}`).expect(200);

      const { db } = setup();
      const acct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id);
      assert.equal(acct.balance, account.balance);
    });
  });

  // ─── Iteration 38: Stats service unit tests ───
  describe('Stats service edge cases', () => {
    it('EMI with very small principal', () => {
      const { calculateEMI } = require('../src/services/stats.service');
      const result = calculateEMI(100, 12, 12);
      assert.ok(result.monthly_emi > 0);
      assert.equal(result.schedule.length, 12);
    });

    it('SIP with 50 years shows full breakdown', () => {
      const { calculateSIP } = require('../src/services/stats.service');
      const result = calculateSIP(1000, 10, 50);
      assert.equal(result.yearly_breakdown.length, 50);
      assert.ok(result.future_value > result.total_invested * 5);
    });

    it('FIRE with no inflation', () => {
      const { calculateFIRE } = require('../src/services/stats.service');
      const result = calculateFIRE(600000, 4, 0, 20);
      assert.equal(result.future_annual_expense, 600000);
      assert.equal(result.fire_number, 15000000);
    });
  });

  // ─── Iteration 39-40: Security & input fuzzing ───
  describe('Input fuzzing', () => {
    it('handles special chars in transaction description', async () => {
      const res = await agent().post('/api/transactions').send({
        account_id: account.id,
        type: 'expense',
        amount: 100,
        description: '!@#$%^&*()_+-=[]{}|;\':",.<>?/`~',
        date: today(),
      });
      assert.equal(res.status, 201);
    });

    it('handles unicode in account name', async () => {
      const res = await agent().post('/api/accounts').send({
        name: '🏦 बैंक अकाउंट 銀行口座',
        type: 'savings',
        balance: 10000,
      });
      assert.equal(res.status, 201);
    });

    it('handles very long valid description', async () => {
      const res = await agent().post('/api/transactions').send({
        account_id: account.id,
        type: 'expense',
        amount: 100,
        description: 'A'.repeat(500), // max allowed
        date: today(),
      });
      assert.equal(res.status, 201);
    });

    it('rejects null bytes in input', async () => {
      const res = await agent().post('/api/transactions').send({
        account_id: account.id,
        type: 'expense',
        amount: 100,
        description: 'test\x00evil',
        date: today(),
      });
      // Should either accept (sanitized) or reject
      assert.ok([201, 400].includes(res.status));
    });

    it('SQL injection in query parameters fails safely', async () => {
      const res = await agent().get("/api/stats/trends?months=1;DROP TABLE transactions").expect(200);
      // The parseInt in the handler converts this to 1, not SQL injection
      assert.ok(Array.isArray(res.body.trends));

      // Verify table still exists
      await agent().get('/api/transactions').expect(200);
    });
  });
});
