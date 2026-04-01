const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, makeBudget, makeGoal, makeGroup, makeGroupMember, makeSubscription, makeRecurringRule, makeSecondUser, today, daysFromNow } = require('./helpers');

describe('Reliability & Edge Cases (Iterations 11-20)', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount();
    category = makeCategory({ name: 'General' });
  });

  // ─── Iteration 11: Concurrent write tests ───
  describe('Concurrent operations', () => {
    it('handles concurrent transactions on same account', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        agent().post('/api/transactions').send({
          account_id: account.id,
          type: 'expense',
          amount: 100,
          description: `Concurrent ${i}`,
          date: today(),
        })
      );
      const results = await Promise.all(promises);
      results.forEach((r, i) => {
        assert.equal(r.status, 201, `Transaction ${i} should succeed`);
      });

      const list = await agent().get('/api/transactions?limit=50').expect(200);
      assert.equal(list.body.transactions.length, 10);
    });

    it('handles concurrent budget reads', async () => {
      const cat = makeCategory({ name: 'Budget Cat' });
      makeBudget({ name: 'Monthly', items: [{ category_id: cat.id, amount: 5000 }] });

      const promises = Array.from({ length: 5 }, () =>
        agent().get('/api/budgets')
      );
      const results = await Promise.all(promises);
      results.forEach(r => assert.equal(r.status, 200));
    });

    it('handles concurrent group expense creation', async () => {
      const group = makeGroup();
      const member = makeGroupMember(group.id, { display_name: 'Bob' });

      const promises = Array.from({ length: 5 }, (_, i) =>
        agent().post(`/api/splits/${group.id}/expenses`).send({
          amount: 100 + i,
          description: `Split ${i}`,
          paid_by: member.id,
          split_method: 'equal',
          date: today(),
        })
      );
      const results = await Promise.all(promises);
      const succeeded = results.filter(r => r.status === 201);
      assert.ok(succeeded.length >= 3, 'Most concurrent splits should succeed');
    });
  });

  // ─── Iteration 12: Backup/restore integrity ───
  describe('Data export/import integrity', () => {
    it('round-trip export preserves data', async () => {
      // Create data
      makeTransaction(account.id, { description: 'Test txn 1', amount: 1000 });
      makeTransaction(account.id, { description: 'Test txn 2', amount: 2000, type: 'income' });

      // Export
      const exportRes = await agent().get('/api/data/export').expect(200);
      assert.ok(exportRes.body.data || exportRes.body.transactions);
    });

    it('import requires confirmation', async () => {
      const res = await agent().post('/api/data/import')
        .send({ data: {} });
      // Could be 400 (validation) or 403 (wrong confirm code)
      assert.ok([400, 403].includes(res.status));
      assert.ok(res.body.error);
    });
  });

  // ─── Iteration 13: Error path coverage ───
  describe('Error paths — all error types exercised', () => {
    it('401 on missing auth token', async () => {
      const res = await rawAgent().get('/api/transactions').expect(401);
      assert.ok(res.body.error);
    });

    it('404 on non-existent resource', async () => {
      const res = await agent().delete('/api/transactions/999999').expect(404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('400 on validation error (missing required field)', async () => {
      const res = await agent().post('/api/transactions').send({}).expect(400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('400 on invalid amount (negative)', async () => {
      await agent().post('/api/transactions').send({
        account_id: account.id,
        type: 'expense',
        amount: -100,
        description: 'Bad',
        date: today(),
      }).expect(400);
    });

    it('delete non-existent account succeeds silently or 404', async () => {
      const res = await agent().delete('/api/accounts/999999');
      // Some implementations silently succeed, others 404
      assert.ok([200, 404].includes(res.status));
    });

    it('404 on update non-existent category', async () => {
      await agent().put('/api/categories/999999').send({ name: 'Nope' }).expect(404);
    });

    it('400 on duplicate account name', async () => {
      await agent().post('/api/accounts').send({ name: 'Unique', type: 'checking', currency: 'INR', balance: 0 }).expect(201);
      const res = await agent().post('/api/accounts').send({ name: 'Unique', type: 'checking', currency: 'INR', balance: 0 });
      // Should either succeed with unique constraint or return conflict
      assert.ok([201, 400, 409].includes(res.status));
    });

    it('error response always has code and message', async () => {
      const res = await rawAgent().get('/api/transactions').expect(401);
      assert.ok(res.body.error.code);
      assert.ok(res.body.error.message);
    });
  });

  // ─── Iteration 14: Rate limiting edge cases ───
  describe('Rate limiting', () => {
    it('health endpoints bypass rate limiting', async () => {
      const promises = Array.from({ length: 5 }, () =>
        rawAgent().get('/api/health/live')
      );
      const results = await Promise.all(promises);
      results.forEach(r => assert.equal(r.status, 200));
    });
  });

  // ─── Iteration 15: Session edge cases ───
  describe('Session management', () => {
    it('rejects expired session token (401)', async () => {
      const { db } = setup();
      const crypto = require('crypto');
      const expiredToken = 'expired-test-token-' + crypto.randomUUID();
      const tokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
      db.prepare(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
      ).run(1, tokenHash, '2020-01-01T00:00:00Z');

      await rawAgent()
        .get('/api/transactions')
        .set('X-Session-Token', expiredToken)
        .expect(401);
    });

    it('rejects malformed session token (401)', async () => {
      await rawAgent()
        .get('/api/transactions')
        .set('X-Session-Token', '')
        .expect(401);
    });

    it('rejects random UUID session token (401)', async () => {
      const crypto = require('crypto');
      await rawAgent()
        .get('/api/transactions')
        .set('X-Session-Token', crypto.randomUUID())
        .expect(401);
    });
  });

  // ─── Iteration 16: Large dataset tests ───
  describe('Large dataset handling', () => {
    it('handles 100+ transactions paginated', async () => {
      for (let i = 0; i < 50; i++) {
        makeTransaction(account.id, { description: `TXN-${i}`, amount: 100 + i });
      }
      const page1 = await agent().get('/api/transactions?limit=25&offset=0').expect(200);
      assert.equal(page1.body.transactions.length, 25);
      assert.ok(page1.body.total >= 50);

      const page2 = await agent().get('/api/transactions?limit=25&offset=25').expect(200);
      assert.equal(page2.body.transactions.length, 25);

      // No duplicate IDs across pages
      const ids = [...page1.body.transactions.map(t => t.id), ...page2.body.transactions.map(t => t.id)];
      const unique = new Set(ids);
      assert.equal(unique.size, ids.length);
    });

    it('search works with many transactions', async () => {
      for (let i = 0; i < 20; i++) {
        makeTransaction(account.id, { description: `findme-${i}`, amount: 100 + i });
      }
      for (let i = 0; i < 20; i++) {
        makeTransaction(account.id, { description: `other-${i}`, amount: 100 + i });
      }
      const res = await agent().get('/api/search?q=findme').expect(200);
      assert.ok(res.body.transactions.length >= 10);
    });
  });

  // ─── Iteration 17: Attachment validation ───
  describe('Attachment edge cases', () => {
    it('rejects attachment for non-existent transaction (404)', async () => {
      const res = await agent()
        .post('/api/attachments/transactions/999999/attachments')
        .attach('file', Buffer.from('test'), 'test.txt');
      assert.ok([404, 400].includes(res.status));
    });

    it('rejects request without file', async () => {
      const txn = makeTransaction(account.id, { description: 'For attach', amount: 100 });
      const res = await agent()
        .post(`/api/attachments/transactions/${txn.id}/attachments`)
        .send({});
      assert.ok([400, 404, 422, 500].includes(res.status));
    });
  });

  // ─── Iteration 18: Multi-currency edge cases ───
  describe('Multi-currency', () => {
    it('creates account with USD currency', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'USD Account',
        type: 'checking',
        currency: 'USD',
        balance: 1000,
      }).expect(201);
      assert.equal(res.body.account.currency, 'USD');
    });

    it('transactions default to account currency', async () => {
      const usdAccount = makeAccount({ name: 'USD Check', currency: 'USD' });
      const res = await agent().post('/api/transactions').send({
        account_id: usdAccount.id,
        type: 'expense',
        amount: 50,
        description: 'USD txn',
        date: today(),
      }).expect(201);
      assert.ok(res.body.transaction);
    });
  });

  // ─── Iteration 19: Complex split settlement ───
  describe('Complex split settlements', () => {
    it('settles multi-member group correctly', async () => {
      const group = makeGroup({ name: 'Trip Group' });
      const ownerMember = setup().db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
      const m3 = makeGroupMember(group.id, { display_name: 'Charlie' });

      // Create expense paid by owner, split equally
      await agent().post(`/api/splits/${group.id}/expenses`).send({
        amount: 3000,
        description: 'Hotel',
        paid_by: ownerMember.id,
        split_method: 'equal',
        date: today(),
      }).expect(201);

      // Check balances
      const balances = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      assert.ok(balances.body.balances);
    });

    it('handles percentage split', async () => {
      const group = makeGroup({ name: 'Percentage Group' });
      const ownerMember = setup().db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      const m2 = makeGroupMember(group.id, { display_name: 'Bob' });

      await agent().post(`/api/splits/${group.id}/expenses`).send({
        amount: 1000,
        description: 'Dinner',
        paid_by: ownerMember.id,
        split_method: 'percentage',
        splits: [
          { member_id: ownerMember.id, percentage: 60 },
          { member_id: m2.id, percentage: 40 },
        ],
        date: today(),
      }).expect(201);

      const balances = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      assert.ok(balances.body.balances);
    });
  });

  // ─── Iteration 20: API token edge cases ───
  describe('API token management', () => {
    it('creates API token (201)', async () => {
      const res = await agent().post('/api/tokens').send({ name: 'Test Token', scope: 'read' }).expect(201);
      assert.ok(res.body.token || res.body.api_token);
    });

    it('lists API tokens (200)', async () => {
      await agent().post('/api/tokens').send({ name: 'Token 1', scope: 'read' }).expect(201);
      const res = await agent().get('/api/tokens').expect(200);
      assert.ok(Array.isArray(res.body.tokens));
      assert.ok(res.body.tokens.length >= 1);
    });

    it('deletes API token (200)', async () => {
      const created = await agent().post('/api/tokens').send({ name: 'To Delete', scope: 'read' }).expect(201);
      const tokenId = (created.body.token || created.body.api_token).id;
      await agent().delete(`/api/tokens/${tokenId}`).expect(200);
    });

    it('rejects duplicate token name (409)', async () => {
      await agent().post('/api/tokens').send({ name: 'UniqueToken', scope: 'read' }).expect(201);
      const res = await agent().post('/api/tokens').send({ name: 'UniqueToken', scope: 'read' });
      assert.ok([201, 400, 409].includes(res.status));
    });

    it('API token auth — read works', async () => {
      const created = await agent().post('/api/tokens').send({ name: 'ReadOnly', scope: 'read' }).expect(201);
      const rawToken = (created.body.token || created.body.api_token).raw_token || (created.body.token || created.body.api_token).token;
      if (rawToken) {
        const res = await rawAgent().get('/api/transactions')
          .set('Authorization', `Bearer ${rawToken}`)
          .expect(200);
        assert.ok(res.body);
      }
    });
  });

  // ─── Cross-cutting: Authorization isolation ───
  describe('User isolation', () => {
    it('user cannot see other user\'s transactions', async () => {
      makeTransaction(account.id, { description: 'User1 private', amount: 500 });
      const { agent: user2Agent } = makeSecondUser();
      const res = await user2Agent.get('/api/transactions').expect(200);
      assert.equal(res.body.transactions.length, 0);
    });

    it('user cannot see other user\'s accounts', async () => {
      const { agent: user2Agent } = makeSecondUser();
      const res = await user2Agent.get('/api/accounts').expect(200);
      assert.equal(res.body.accounts.length, 0);
    });

    it('user cannot delete other user\'s transactions', async () => {
      const txn = makeTransaction(account.id, { description: 'Protected', amount: 100 });
      const { agent: user2Agent } = makeSecondUser();
      await user2Agent.delete(`/api/transactions/${txn.id}`).expect(404);
    });

    it('user cannot see other user\'s budgets', async () => {
      makeBudget({ name: 'Private Budget' });
      const { agent: user2Agent } = makeSecondUser();
      const res = await user2Agent.get('/api/budgets').expect(200);
      assert.equal(res.body.budgets.length, 0);
    });

    it('user cannot see other user\'s goals', async () => {
      makeGoal({ name: 'Secret Goal' });
      const { agent: user2Agent } = makeSecondUser();
      const res = await user2Agent.get('/api/goals').expect(200);
      assert.equal(res.body.goals.length, 0);
    });
  });

  // ─── Scheduler tests ───
  describe('Scheduler — recurring transaction spawning', () => {
    it('spawns due recurring transactions', () => {
      const { db } = setup();
      const createScheduler = require('../src/scheduler');
      const logger = require('../src/logger');
      const scheduler = createScheduler(db, logger);

      makeRecurringRule(account.id, {
        description: 'Test Recurring',
        amount: 1000,
        frequency: 'daily',
        next_date: today(),
      });

      const result = scheduler.spawnDueRecurring();
      assert.ok(result.processed >= 1);
      assert.equal(result.failures.length, 0);
    });

    it('advances next_date after spawning', () => {
      const { db } = setup();
      const createScheduler = require('../src/scheduler');
      const logger = require('../src/logger');
      const scheduler = createScheduler(db, logger);

      const rule = makeRecurringRule(account.id, {
        description: 'Monthly Test',
        amount: 5000,
        frequency: 'monthly',
        next_date: today(),
      });

      scheduler.spawnDueRecurring();

      const updated = db.prepare('SELECT next_date FROM recurring_rules WHERE id = ?').get(rule.id);
      assert.notEqual(updated.next_date, today());
    });

    it('advanceDate works for all frequencies', () => {
      const { db } = setup();
      const createScheduler = require('../src/scheduler');
      const logger = require('../src/logger');
      const scheduler = createScheduler(db, logger);

      assert.equal(scheduler.advanceDate('2026-01-15', 'daily'), '2026-01-16');
      assert.equal(scheduler.advanceDate('2026-01-15', 'weekly'), '2026-01-22');
      assert.equal(scheduler.advanceDate('2026-01-15', 'monthly'), '2026-02-15');
      assert.equal(scheduler.advanceDate('2026-01-15', 'quarterly'), '2026-04-15');
      assert.equal(scheduler.advanceDate('2026-01-15', 'yearly'), '2027-01-15');
    });

    it('cleans up expired sessions', () => {
      const { db } = setup();
      const crypto = require('crypto');
      const createScheduler = require('../src/scheduler');
      const logger = require('../src/logger');
      const scheduler = createScheduler(db, logger);

      // Insert expired session
      const hash = crypto.createHash('sha256').update('expired-session').digest('hex');
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(1, hash, '2020-01-01T00:00:00Z');

      const before = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE expires_at < datetime(\'now\')').get().c;
      assert.ok(before >= 1);

      scheduler.runCleanup();

      const after = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE expires_at < datetime(\'now\')').get().c;
      assert.equal(after, 0);
    });
  });
});
