const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeSubscription, makeRecurringRule, makeAccount, daysFromNow, today } = require('./helpers');

describe('Bill Reminders & Upcoming Expenses', () => {
  let account;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount();
  });

  // ─── CRUD: Reminders ───

  describe('POST /api/reminders', () => {
    it('creates reminder for subscription (201)', async () => {
      const sub = makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly', next_billing_date: daysFromNow(5) });
      const res = await agent().post('/api/reminders')
        .send({ subscription_id: sub.id, days_before: 3 })
        .expect(201);
      assert.ok(res.body.reminder.id);
      assert.equal(res.body.reminder.subscription_id, sub.id);
      assert.equal(res.body.reminder.recurring_rule_id, null);
      assert.equal(res.body.reminder.days_before, 3);
      assert.equal(res.body.reminder.is_enabled, 1);
    });

    it('creates reminder for recurring rule (201)', async () => {
      const rule = makeRecurringRule(account.id, { description: 'Rent', amount: 15000, frequency: 'monthly', next_date: daysFromNow(10) });
      const res = await agent().post('/api/reminders')
        .send({ recurring_rule_id: rule.id, days_before: 5 })
        .expect(201);
      assert.ok(res.body.reminder.id);
      assert.equal(res.body.reminder.recurring_rule_id, rule.id);
      assert.equal(res.body.reminder.subscription_id, null);
      assert.equal(res.body.reminder.days_before, 5);
    });

    it('rejects when both subscription_id and recurring_rule_id set (400)', async () => {
      const sub = makeSubscription({ name: 'Spotify', amount: 119, frequency: 'monthly' });
      const rule = makeRecurringRule(account.id, { description: 'Internet', amount: 999, frequency: 'monthly', next_date: daysFromNow(5) });
      await agent().post('/api/reminders')
        .send({ subscription_id: sub.id, recurring_rule_id: rule.id, days_before: 3 })
        .expect(400);
    });

    it('rejects when neither subscription_id nor recurring_rule_id set (400)', async () => {
      await agent().post('/api/reminders')
        .send({ days_before: 3 })
        .expect(400);
    });

    it('rejects invalid subscription_id (400)', async () => {
      await agent().post('/api/reminders')
        .send({ subscription_id: 99999, days_before: 3 })
        .expect(400);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().post('/api/reminders')
        .send({ subscription_id: 1, days_before: 3 })
        .expect(401);
    });
  });

  describe('GET /api/reminders', () => {
    it('lists reminders (200)', async () => {
      const sub = makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly', next_billing_date: daysFromNow(5) });
      const rule = makeRecurringRule(account.id, { description: 'Rent', amount: 15000, frequency: 'monthly', next_date: daysFromNow(10) });
      await agent().post('/api/reminders').send({ subscription_id: sub.id, days_before: 3 }).expect(201);
      await agent().post('/api/reminders').send({ recurring_rule_id: rule.id, days_before: 5 }).expect(201);

      const res = await agent().get('/api/reminders').expect(200);
      assert.equal(res.body.reminders.length, 2);
      // Verify joined data is present
      const subReminder = res.body.reminders.find(r => r.subscription_id != null);
      assert.ok(subReminder.subscription_name);
    });

    it('returns empty list initially (200)', async () => {
      const res = await agent().get('/api/reminders').expect(200);
      assert.deepEqual(res.body.reminders, []);
    });
  });

  describe('PUT /api/reminders/:id', () => {
    it('updates days_before (200)', async () => {
      const sub = makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      const create = await agent().post('/api/reminders').send({ subscription_id: sub.id, days_before: 3 }).expect(201);

      const res = await agent().put(`/api/reminders/${create.body.reminder.id}`)
        .send({ days_before: 7 })
        .expect(200);
      assert.equal(res.body.reminder.days_before, 7);
    });

    it('updates is_enabled (200)', async () => {
      const sub = makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      const create = await agent().post('/api/reminders').send({ subscription_id: sub.id }).expect(201);

      const res = await agent().put(`/api/reminders/${create.body.reminder.id}`)
        .send({ is_enabled: 0 })
        .expect(200);
      assert.equal(res.body.reminder.is_enabled, 0);
    });

    it('returns 404 for non-existent reminder', async () => {
      await agent().put('/api/reminders/99999')
        .send({ days_before: 7 })
        .expect(404);
    });
  });

  describe('DELETE /api/reminders/:id', () => {
    it('deletes reminder (200)', async () => {
      const sub = makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      const create = await agent().post('/api/reminders').send({ subscription_id: sub.id }).expect(201);

      await agent().delete(`/api/reminders/${create.body.reminder.id}`).expect(200);

      const list = await agent().get('/api/reminders').expect(200);
      assert.equal(list.body.reminders.length, 0);
    });

    it('returns 404 for non-existent reminder', async () => {
      await agent().delete('/api/reminders/99999').expect(404);
    });
  });

  // ─── Upcoming Expenses ───

  describe('GET /api/upcoming', () => {
    it('returns upcoming subscriptions and recurring rules sorted by date (200)', async () => {
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly', next_billing_date: daysFromNow(5) });
      makeSubscription({ name: 'Spotify', amount: 119, frequency: 'monthly', next_billing_date: daysFromNow(2) });
      makeRecurringRule(account.id, { description: 'Rent', amount: 15000, frequency: 'monthly', next_date: daysFromNow(3) });

      const res = await agent().get('/api/upcoming').expect(200);
      assert.ok(res.body.upcoming.length >= 3);
      // Verify sorted by due_date ascending
      for (let i = 1; i < res.body.upcoming.length; i++) {
        assert.ok(res.body.upcoming[i].due_date >= res.body.upcoming[i - 1].due_date);
      }
      // Verify source_type present
      const types = res.body.upcoming.map(u => u.source_type);
      assert.ok(types.includes('subscription'));
      assert.ok(types.includes('recurring'));
    });

    it('filters by days=7 (next 7 days)', async () => {
      makeSubscription({ name: 'Soon', amount: 199, frequency: 'monthly', next_billing_date: daysFromNow(3) });
      makeSubscription({ name: 'Later', amount: 299, frequency: 'monthly', next_billing_date: daysFromNow(20) });

      const res = await agent().get('/api/upcoming?days=7').expect(200);
      assert.equal(res.body.days, 7);
      assert.equal(res.body.upcoming.length, 1);
      assert.equal(res.body.upcoming[0].name, 'Soon');
    });

    it('filters by days=30 (next 30 days)', async () => {
      makeSubscription({ name: 'Soon', amount: 199, frequency: 'monthly', next_billing_date: daysFromNow(3) });
      makeSubscription({ name: 'MidMonth', amount: 299, frequency: 'monthly', next_billing_date: daysFromNow(20) });
      makeSubscription({ name: 'FarAway', amount: 399, frequency: 'monthly', next_billing_date: daysFromNow(60) });

      const res = await agent().get('/api/upcoming?days=30').expect(200);
      assert.equal(res.body.days, 30);
      assert.equal(res.body.upcoming.length, 2);
    });

    it('excludes inactive subscriptions', async () => {
      makeSubscription({ name: 'Active', amount: 199, frequency: 'monthly', next_billing_date: daysFromNow(5), is_active: 1 });
      makeSubscription({ name: 'Cancelled', amount: 299, frequency: 'monthly', next_billing_date: daysFromNow(5), is_active: 0 });

      const res = await agent().get('/api/upcoming').expect(200);
      assert.equal(res.body.upcoming.length, 1);
      assert.equal(res.body.upcoming[0].name, 'Active');
    });

    it('excludes past-due items', async () => {
      // Subscription with billing date in the past
      const { db } = setup();
      const past = new Date();
      past.setUTCDate(past.getUTCDate() - 5);
      const pastDate = past.toISOString().slice(0, 10);
      makeSubscription({ name: 'PastDue', amount: 199, frequency: 'monthly', next_billing_date: pastDate });
      makeSubscription({ name: 'Future', amount: 299, frequency: 'monthly', next_billing_date: daysFromNow(5) });

      const res = await agent().get('/api/upcoming').expect(200);
      assert.equal(res.body.upcoming.length, 1);
      assert.equal(res.body.upcoming[0].name, 'Future');
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/upcoming').expect(401);
    });
  });

  describe('GET /api/reminders/upcoming', () => {
    it('also accessible under /api/reminders/upcoming (200)', async () => {
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly', next_billing_date: daysFromNow(5) });
      const res = await agent().get('/api/reminders/upcoming').expect(200);
      assert.ok(Array.isArray(res.body.upcoming));
    });
  });
});
