const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeTransaction, makeRecurringRule, today, daysFromNow } = require('./helpers');

describe('Recurring Suggestions & Financial Calendar — v0.3.35', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Suggestions endpoint ───

  describe('GET /api/recurring/suggestions', () => {
    it('returns empty suggestions when no transactions exist', async () => {
      const res = await agent().get('/api/recurring/suggestions').expect(200);
      assert.ok(Array.isArray(res.body.suggestions));
      assert.equal(res.body.suggestions.length, 0);
    });

    it('detects recurring patterns from transaction history', async () => {
      const acct = makeAccount({ name: 'Checking' });
      // Create 4 monthly transactions with the same description & amount
      for (let i = 0; i < 4; i++) {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - i);
        const dateStr = d.toISOString().slice(0, 10);
        makeTransaction(acct.id, { description: 'Netflix Subscription', amount: 199, type: 'expense', date: dateStr });
      }

      const res = await agent().get('/api/recurring/suggestions').expect(200);
      assert.ok(res.body.suggestions.length >= 1);
      const netflix = res.body.suggestions.find(s => s.description === 'Netflix Subscription');
      assert.ok(netflix, 'Should detect Netflix pattern');
      assert.equal(netflix.amount, 199);
      assert.equal(netflix.frequency, 'monthly');
      assert.ok(netflix.confidence > 0);
      assert.ok(netflix.pattern_hash);
    });

    it('excludes dismissed patterns', async () => {
      const { db } = setup();
      const acct = makeAccount({ name: 'Checking' });
      for (let i = 0; i < 4; i++) {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - i);
        makeTransaction(acct.id, { description: 'Gym Monthly', amount: 500, type: 'expense', date: d.toISOString().slice(0, 10) });
      }

      // Dismiss the pattern
      await agent().post('/api/recurring/suggestions/dismiss')
        .send({ pattern_hash: require('crypto').createHash('sha256').update(`gym monthly|500|${acct.id}`).digest('hex') })
        .expect(200);

      const res = await agent().get('/api/recurring/suggestions').expect(200);
      const gym = res.body.suggestions.find(s => s.description === 'Gym Monthly');
      assert.equal(gym, undefined, 'Dismissed pattern should not appear');
    });

    it('requires authentication', async () => {
      await rawAgent().get('/api/recurring/suggestions').expect(401);
    });
  });

  describe('POST /api/recurring/suggestions/accept', () => {
    it('creates a recurring rule from a suggestion', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const res = await agent().post('/api/recurring/suggestions/accept')
        .send({
          pattern_hash: 'abc123',
          description: 'Netflix',
          amount: 199,
          account_id: acct.id,
          frequency: 'monthly',
          type: 'expense',
          next_date: '2026-04-01',
        })
        .expect(201);
      assert.ok(res.body.rule);
      assert.equal(res.body.rule.description, 'Netflix');
      assert.equal(res.body.rule.frequency, 'monthly');
    });

    it('rejects missing fields', async () => {
      await agent().post('/api/recurring/suggestions/accept')
        .send({ pattern_hash: 'abc' })
        .expect(400);
    });
  });

  // ─── Calendar endpoint ───

  describe('GET /api/calendar', () => {
    it('returns calendar data for current month when no param given', async () => {
      const res = await agent().get('/api/calendar').expect(200);
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      assert.equal(res.body.month, expected);
      assert.ok(res.body.days);
      assert.equal(typeof res.body.transaction_count, 'number');
      assert.equal(typeof res.body.recurring_event_count, 'number');
    });

    it('returns transactions for the specified month', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeTransaction(acct.id, { description: 'Groceries', amount: 2000, date: '2026-03-15' });
      makeTransaction(acct.id, { description: 'Rent', amount: 15000, date: '2026-03-01' });
      makeTransaction(acct.id, { description: 'Salary', amount: 50000, type: 'income', date: '2026-03-28' });

      const res = await agent().get('/api/calendar?month=2026-03').expect(200);
      assert.equal(res.body.month, '2026-03');
      assert.equal(res.body.transaction_count, 3);

      // Check day grouping
      assert.ok(res.body.days['2026-03-15']);
      assert.equal(res.body.days['2026-03-15'].transactions.length, 1);
      assert.equal(res.body.days['2026-03-15'].transactions[0].description, 'Groceries');

      assert.equal(res.body.days['2026-03-01'].transactions.length, 1);
    });

    it('respects month parameter and returns empty for months with no data', async () => {
      const res = await agent().get('/api/calendar?month=2024-01').expect(200);
      assert.equal(res.body.month, '2024-01');
      assert.equal(res.body.transaction_count, 0);
      assert.equal(res.body.recurring_event_count, 0);

      // Should have 31 days in January
      assert.equal(Object.keys(res.body.days).length, 31);
    });

    it('includes recurring events in the calendar', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeRecurringRule(acct.id, {
        description: 'Monthly Rent',
        amount: 15000,
        frequency: 'monthly',
        next_date: '2026-04-01',
        type: 'expense',
      });

      const res = await agent().get('/api/calendar?month=2026-04').expect(200);
      assert.ok(res.body.recurring_event_count >= 1);
      assert.ok(res.body.days['2026-04-01'].recurring.length >= 1);
      assert.equal(res.body.days['2026-04-01'].recurring[0].description, 'Monthly Rent');
      assert.equal(res.body.days['2026-04-01'].recurring[0].is_recurring, true);
    });

    it('requires authentication', async () => {
      await rawAgent().get('/api/calendar').expect(401);
    });
  });

  // ─── Recurring CRUD (via existing API) ───

  describe('Recurring CRUD', () => {
    it('lists recurring rules', async () => {
      const acct = makeAccount({ name: 'Checking' });
      makeRecurringRule(acct.id, { description: 'Rent' });
      const res = await agent().get('/api/recurring').expect(200);
      assert.ok(res.body.rules.length >= 1);
    });

    it('creates a recurring rule', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const res = await agent().post('/api/recurring').send({
        account_id: acct.id,
        type: 'expense',
        amount: 1000,
        description: 'Test Rule',
        frequency: 'weekly',
        next_date: '2026-04-01',
      }).expect(201);
      assert.ok(res.body.rule.id);
    });

    it('updates a recurring rule', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, { description: 'Old Name' });
      const res = await agent().put(`/api/recurring/${rule.id}`).send({ description: 'New Name' }).expect(200);
      assert.equal(res.body.rule.description, 'New Name');
    });

    it('deletes a recurring rule', async () => {
      const acct = makeAccount({ name: 'Checking' });
      const rule = makeRecurringRule(acct.id, { description: 'To Delete' });
      await agent().delete(`/api/recurring/${rule.id}`).expect(200);
      const res = await agent().get('/api/recurring').expect(200);
      assert.equal(res.body.rules.length, 0);
    });
  });
});
