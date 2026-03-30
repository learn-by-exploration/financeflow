const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeRecurringRule } = require('./helpers');

describe('Recurring Rules API — v0.2.2', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/recurring', () => {
    it('returns empty list when no rules exist', async () => {
      const res = await agent().get('/api/recurring').expect(200);
      assert.deepEqual(res.body.rules, []);
    });

    it('returns user recurring rules', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeRecurringRule(acct.id, { description: 'Monthly Rent', amount: 15000 });
      makeRecurringRule(acct.id, { description: 'Gym Fee', amount: 1500 });

      const res = await agent().get('/api/recurring').expect(200);
      assert.equal(res.body.rules.length, 2);
      assert.ok(res.body.rules[0].description);
    });
  });

  describe('POST /api/recurring', () => {
    it('creates a recurring rule (201)', async () => {
      const acct = makeAccount({ name: 'Savings' });
      const res = await agent().post('/api/recurring')
        .send({
          account_id: acct.id,
          type: 'expense',
          amount: 5000,
          description: 'Monthly Rent',
          frequency: 'monthly',
          next_date: '2025-02-01',
        }).expect(201);
      assert.ok(res.body.rule.id);
      assert.equal(res.body.rule.description, 'Monthly Rent');
      assert.equal(res.body.rule.amount, 5000);
      assert.equal(res.body.rule.frequency, 'monthly');
      assert.equal(res.body.rule.is_active, 1);
    });

    it('rejects missing required fields (400)', async () => {
      await agent().post('/api/recurring')
        .send({ amount: 100 })
        .expect(400);
    });

    it('rejects invalid frequency (400)', async () => {
      const acct = makeAccount({ name: 'Checking' });
      await agent().post('/api/recurring')
        .send({
          account_id: acct.id,
          type: 'expense',
          amount: 100,
          description: 'Test',
          frequency: 'biweekly',
          next_date: '2025-01-01',
        }).expect(400);
    });
  });

  describe('PUT /api/recurring/:id', () => {
    it('updates a recurring rule', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, { description: 'Old', amount: 100 });

      const res = await agent().put(`/api/recurring/${rule.id}`)
        .send({ description: 'Updated', amount: 200 })
        .expect(200);
      assert.equal(res.body.rule.description, 'Updated');
      assert.equal(res.body.rule.amount, 200);
    });

    it('can pause a rule', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, { description: 'Test' });

      const res = await agent().put(`/api/recurring/${rule.id}`)
        .send({ is_active: 0 })
        .expect(200);
      assert.equal(res.body.rule.is_active, 0);
    });

    it('can resume a paused rule', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, { description: 'Test', is_active: 0 });

      const res = await agent().put(`/api/recurring/${rule.id}`)
        .send({ is_active: 1 })
        .expect(200);
      assert.equal(res.body.rule.is_active, 1);
    });

    it('rejects update on non-existent rule (404)', async () => {
      await agent().put('/api/recurring/9999')
        .send({ description: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /api/recurring/:id', () => {
    it('deletes a recurring rule', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, { description: 'Test' });

      await agent().delete(`/api/recurring/${rule.id}`).expect(200);
      const res = await agent().get('/api/recurring').expect(200);
      assert.equal(res.body.rules.length, 0);
    });

    it('rejects delete on non-existent rule (404)', async () => {
      await agent().delete('/api/recurring/9999').expect(404);
    });
  });

  describe('POST /api/recurring/:id/skip', () => {
    it('advances next_date to next occurrence', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, {
        description: 'Monthly',
        frequency: 'monthly',
        next_date: '2025-03-01',
      });

      const res = await agent().post(`/api/recurring/${rule.id}/skip`).expect(200);
      assert.equal(res.body.rule.next_date, '2025-04-01');
    });

    it('advances weekly rule by 7 days', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, {
        description: 'Weekly',
        frequency: 'weekly',
        next_date: '2025-03-01',
      });

      const res = await agent().post(`/api/recurring/${rule.id}/skip`).expect(200);
      assert.equal(res.body.rule.next_date, '2025-03-08');
    });

    it('rejects skip on non-existent rule (404)', async () => {
      await agent().post('/api/recurring/9999/skip').expect(404);
    });
  });

  describe('Cross-user isolation', () => {
    it('user cannot see or modify other user rules', async () => {
      const { setup: s } = require('./helpers');
      const { makeSecondUser } = require('./helpers');

      const acct = makeAccount({ name: 'My Account' });
      const rule = makeRecurringRule(acct.id, { description: 'My Rule' });

      const { agent: agentB } = makeSecondUser();
      const list = await agentB.get('/api/recurring').expect(200);
      assert.equal(list.body.rules.length, 0);

      await agentB.put(`/api/recurring/${rule.id}`).send({ description: 'Hacked' }).expect(404);
      await agentB.delete(`/api/recurring/${rule.id}`).expect(404);
    });
  });
});
