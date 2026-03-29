const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, today, daysFromNow } = require('./helpers');

describe('Transactions', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── GET ──────────────────────────────────────────

  describe('GET /api/transactions', () => {
    it('returns empty list initially (200)', async () => {
      const res = await agent().get('/api/transactions').expect(200);
      assert.deepEqual(res.body.transactions, []);
      assert.equal(res.body.total, 0);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/transactions').expect(401);
    });

    it('filters by account_id', async () => {
      const a1 = makeAccount({ name: 'Account A' });
      const a2 = makeAccount({ name: 'Account B' });
      makeTransaction(a1.id, { description: 'From A' });
      makeTransaction(a2.id, { description: 'From B' });
      const res = await agent().get(`/api/transactions?account_id=${a1.id}`).expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'From A');
    });

    it('filters by type', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { type: 'expense', description: 'Spent' });
      makeTransaction(acct.id, { type: 'income', description: 'Earned' });
      const res = await agent().get('/api/transactions?type=income').expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'Earned');
    });

    it('filters by date range', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { date: '2024-01-01', description: 'Old' });
      makeTransaction(acct.id, { date: '2024-06-15', description: 'Mid' });
      makeTransaction(acct.id, { date: '2024-12-31', description: 'New' });
      const res = await agent().get('/api/transactions?from=2024-06-01&to=2024-06-30').expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'Mid');
    });

    it('filters by search', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'Grocery shopping' });
      makeTransaction(acct.id, { description: 'Rent payment' });
      const res = await agent().get('/api/transactions?search=grocery').expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'Grocery shopping');
    });

    it('paginates with limit and offset', async () => {
      const acct = makeAccount();
      for (let i = 0; i < 5; i++) {
        makeTransaction(acct.id, { description: `Tx${i}`, date: `2024-01-0${i + 1}` });
      }
      const res = await agent().get('/api/transactions?limit=2&offset=2').expect(200);
      assert.equal(res.body.transactions.length, 2);
      assert.equal(res.body.total, 5);
    });

    it('orders by date DESC then id DESC', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { description: 'Oldest', date: '2024-01-01' });
      makeTransaction(acct.id, { description: 'Newest', date: '2024-12-31' });
      const res = await agent().get('/api/transactions').expect(200);
      assert.equal(res.body.transactions[0].description, 'Newest');
      assert.equal(res.body.transactions[1].description, 'Oldest');
    });
  });

  // ─── POST ─────────────────────────────────────────

  describe('POST /api/transactions', () => {
    it('creates expense and debits account (201)', async () => {
      const acct = makeAccount({ balance: 1000 });
      const res = await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'expense', amount: 250, description: 'Groceries', date: today() })
        .expect(201);
      assert.equal(res.body.transaction.amount, 250);
      assert.equal(res.body.transaction.type, 'expense');
      // Check balance
      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      assert.equal(updated.balance, 750);
    });

    it('creates income and credits account (201)', async () => {
      const acct = makeAccount({ balance: 500 });
      const res = await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'income', amount: 300, description: 'Salary', date: today() })
        .expect(201);
      assert.equal(res.body.transaction.type, 'income');
      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      assert.equal(updated.balance, 800);
    });

    it('rejects missing required fields (400)', async () => {
      const acct = makeAccount();
      // Missing description
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'expense', amount: 100, date: today() })
        .expect(400);
    });

    it('rejects invalid type (400)', async () => {
      const acct = makeAccount();
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'bogus', amount: 100, description: 'Bad', date: today() })
        .expect(400);
    });

    it('rejects zero amount (400)', async () => {
      const acct = makeAccount();
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'expense', amount: 0, description: 'Zero', date: today() })
        .expect(400);
    });

    it('rejects negative amount (400)', async () => {
      const acct = makeAccount();
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'expense', amount: -50, description: 'Neg', date: today() })
        .expect(400);
    });

    it('logs audit entry on creation', async () => {
      const acct = makeAccount();
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'expense', amount: 100, description: 'Audited', date: today() })
        .expect(201);
      const { db } = setup();
      const log = db.prepare('SELECT * FROM audit_log WHERE action = ?').get('transaction.create');
      assert.ok(log);
      assert.equal(log.entity_type, 'transaction');
    });
  });

  // ─── PUT ──────────────────────────────────────────

  describe('PUT /api/transactions/:id', () => {
    it('updates description, note, category, date', async () => {
      const acct = makeAccount();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const tx = makeTransaction(acct.id, { description: 'Old desc' });
      const res = await agent().put(`/api/transactions/${tx.id}`)
        .send({ description: 'New desc', note: 'A note', category_id: cat.id, date: '2024-06-15' })
        .expect(200);
      assert.equal(res.body.transaction.description, 'New desc');
      assert.equal(res.body.transaction.note, 'A note');
      assert.equal(res.body.transaction.category_id, cat.id);
      assert.equal(res.body.transaction.date, '2024-06-15');
    });

    it('updates amount with delta balance recalculation (expense 100→150)', async () => {
      const acct = makeAccount({ balance: 1000 });
      const tx = makeTransaction(acct.id, { type: 'expense', amount: 100 });
      // After creation: balance = 1000 - 100 = 900
      const res = await agent().put(`/api/transactions/${tx.id}`)
        .send({ amount: 150 })
        .expect(200);
      assert.equal(res.body.transaction.amount, 150);
      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      // Delta = 150 - 100 = 50, expense: balance -= delta → 900 - 50 = 850
      assert.equal(updated.balance, 850);
    });

    it('updates amount with delta balance recalculation (expense 100→50)', async () => {
      const acct = makeAccount({ balance: 1000 });
      const tx = makeTransaction(acct.id, { type: 'expense', amount: 100 });
      // After creation: balance = 900
      const res = await agent().put(`/api/transactions/${tx.id}`)
        .send({ amount: 50 })
        .expect(200);
      assert.equal(res.body.transaction.amount, 50);
      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      // Delta = 50 - 100 = -50, expense: balance -= delta → 900 - (-50) = 950
      assert.equal(updated.balance, 950);
    });

    it('updates amount for income (delta recalculation)', async () => {
      const acct = makeAccount({ balance: 500 });
      const tx = makeTransaction(acct.id, { type: 'income', amount: 200 });
      // After creation: balance = 500 + 200 = 700
      const res = await agent().put(`/api/transactions/${tx.id}`)
        .send({ amount: 350 })
        .expect(200);
      assert.equal(res.body.transaction.amount, 350);
      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      // Delta = 350 - 200 = 150, income: balance += delta → 700 + 150 = 850
      assert.equal(updated.balance, 850);
    });

    it('returns 404 for non-existent', async () => {
      await agent().put('/api/transactions/99999')
        .send({ description: 'Ghost' })
        .expect(404);
    });
  });

  // ─── DELETE ───────────────────────────────────────

  describe('DELETE /api/transactions/:id', () => {
    it('reverses balance change on delete (expense)', async () => {
      const acct = makeAccount({ balance: 1000 });
      const tx = makeTransaction(acct.id, { type: 'expense', amount: 200 });
      // balance: 800
      await agent().delete(`/api/transactions/${tx.id}`).expect(200);
      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      assert.equal(updated.balance, 1000);
    });

    it('reverses balance change on delete (income)', async () => {
      const acct = makeAccount({ balance: 500 });
      const tx = makeTransaction(acct.id, { type: 'income', amount: 300 });
      // balance: 800
      await agent().delete(`/api/transactions/${tx.id}`).expect(200);
      const { db } = setup();
      const updated = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      assert.equal(updated.balance, 500);
    });

    it('returns 404 for non-existent', async () => {
      await agent().delete('/api/transactions/99999').expect(404);
    });
  });

  // ─── TRANSFERS ────────────────────────────────────

  describe('Transfers (double-entry)', () => {
    it('creates TWO linked transactions (201)', async () => {
      const source = makeAccount({ name: 'Checking', balance: 1000 });
      const dest = makeAccount({ name: 'Savings', balance: 500 });
      const res = await agent().post('/api/transactions')
        .send({
          account_id: source.id,
          transfer_to_account_id: dest.id,
          type: 'transfer',
          amount: 200,
          description: 'Move to savings',
          date: today()
        })
        .expect(201);

      // Should return the source transaction
      assert.equal(res.body.transaction.type, 'transfer');
      assert.equal(res.body.transaction.amount, 200);
      assert.equal(res.body.transaction.transfer_to_account_id, dest.id);

      // Both transactions should exist and be linked
      const { db } = setup();
      const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id').all(1);
      assert.equal(txs.length, 2);
      assert.equal(txs[0].transfer_transaction_id, txs[1].id);
      assert.equal(txs[1].transfer_transaction_id, txs[0].id);
    });

    it('debits source and credits destination', async () => {
      const source = makeAccount({ name: 'Checking', balance: 1000 });
      const dest = makeAccount({ name: 'Savings', balance: 500 });
      await agent().post('/api/transactions')
        .send({
          account_id: source.id,
          transfer_to_account_id: dest.id,
          type: 'transfer',
          amount: 200,
          description: 'Transfer',
          date: today()
        })
        .expect(201);

      const { db } = setup();
      const srcAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(source.id);
      const dstAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(dest.id);
      assert.equal(srcAcct.balance, 800);
      assert.equal(dstAcct.balance, 700);
    });

    it('rejects missing transfer_to_account_id (400)', async () => {
      const acct = makeAccount({ balance: 1000 });
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'transfer', amount: 200, description: 'Bad transfer', date: today() })
        .expect(400);
    });

    it('rejects transfer to same account (400)', async () => {
      const acct = makeAccount({ balance: 1000 });
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, transfer_to_account_id: acct.id, type: 'transfer', amount: 200, description: 'Self', date: today() })
        .expect(400);
    });

    it('deleting transfer reverses both balances and deletes both records', async () => {
      const source = makeAccount({ name: 'Checking', balance: 1000 });
      const dest = makeAccount({ name: 'Savings', balance: 500 });
      const res = await agent().post('/api/transactions')
        .send({
          account_id: source.id,
          transfer_to_account_id: dest.id,
          type: 'transfer',
          amount: 200,
          description: 'Transfer',
          date: today()
        })
        .expect(201);

      await agent().delete(`/api/transactions/${res.body.transaction.id}`).expect(200);

      const { db } = setup();
      const srcAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(source.id);
      const dstAcct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(dest.id);
      assert.equal(srcAcct.balance, 1000);
      assert.equal(dstAcct.balance, 500);
      const remaining = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
      assert.equal(remaining.count, 0);
    });
  });
});
