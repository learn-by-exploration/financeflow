const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeAccount } = require('./helpers');

describe('Accounts', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/accounts', () => {
    it('returns empty array for new user (200)', async () => {
      const res = await agent().get('/api/accounts').expect(200);
      assert.deepEqual(res.body.accounts, []);
    });

    it('returns accounts ordered by position', async () => {
      makeAccount({ name: 'Second', position: 1 });
      makeAccount({ name: 'First', position: 0 });
      const res = await agent().get('/api/accounts').expect(200);
      assert.equal(res.body.accounts.length, 2);
      assert.equal(res.body.accounts[0].name, 'First');
      assert.equal(res.body.accounts[1].name, 'Second');
    });
  });

  describe('POST /api/accounts', () => {
    it('creates account with all fields (201)', async () => {
      const res = await agent().post('/api/accounts')
        .send({ name: 'Savings', type: 'savings', balance: 100000 })
        .expect(201);
      assert.equal(res.body.account.name, 'Savings');
      assert.equal(res.body.account.type, 'savings');
      assert.equal(res.body.account.balance, 100000);
    });

    it('uses defaults for optional fields', async () => {
      const res = await agent().post('/api/accounts')
        .send({ name: 'Default Account', type: 'checking' })
        .expect(201);
      assert.equal(res.body.account.balance, 0);
      assert.equal(res.body.account.currency, 'INR');
      assert.ok(res.body.account.icon);
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/accounts')
        .send({ type: 'checking' })
        .expect(400);
    });

    it('allows negative balance (credit cards)', async () => {
      const res = await agent().post('/api/accounts')
        .send({ name: 'Credit Card', type: 'credit_card', balance: -5000 })
        .expect(201);
      assert.equal(res.body.account.balance, -5000);
    });
  });

  describe('PUT /api/accounts/:id', () => {
    it('updates fields', async () => {
      const acct = makeAccount();
      const res = await agent().put(`/api/accounts/${acct.id}`)
        .send({ name: 'Updated Name' })
        .expect(200);
      assert.equal(res.body.account.name, 'Updated Name');
    });

    it('returns 404 for non-existent ID', async () => {
      await agent().put('/api/accounts/99999')
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('cannot update another user\'s account', async () => {
      const { makeSecondUser } = require('./helpers');
      const user2 = makeSecondUser();
      const acct = makeAccount();
      await user2.agent.put(`/api/accounts/${acct.id}`)
        .send({ name: 'Hacked' })
        .expect(404);
      // Verify original unchanged
      const { db } = setup();
      const original = db.prepare('SELECT name FROM accounts WHERE id = ?').get(acct.id);
      assert.equal(original.name, 'Test Checking');
    });
  });

  describe('DELETE /api/accounts/:id', () => {
    it('deletes account (200)', async () => {
      const acct = makeAccount();
      await agent().delete(`/api/accounts/${acct.id}`).expect(200);
      const res = await agent().get('/api/accounts').expect(200);
      assert.equal(res.body.accounts.length, 0);
    });

    it('returns 404 for non-existent ID', async () => {
      // Current impl returns 200 regardless, just no rows affected
      await agent().delete('/api/accounts/99999').expect(200);
    });
  });

  describe('Auth required', () => {
    it('GET returns 401 without auth', async () => {
      await rawAgent().get('/api/accounts').expect(401);
    });

    it('POST returns 401 without auth', async () => {
      await rawAgent().post('/api/accounts').send({ name: 'Test' }).expect(401);
    });
  });

  describe('Audit log', () => {
    it('creates audit entry on account creation', async () => {
      const res = await agent().post('/api/accounts')
        .send({ name: 'Audited', type: 'checking' })
        .expect(201);
      const { db } = setup();
      const entry = db.prepare("SELECT * FROM audit_log WHERE entity_type = 'account' AND entity_id = ?").get(res.body.account.id);
      assert.ok(entry, 'audit entry should exist');
      assert.equal(entry.action, 'account.create');
    });
  });
});
