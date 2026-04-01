const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeTransaction, makeRecurringRule, makeCategory, today, daysFromNow } = require('./helpers');

describe('Calendar API', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount();
    category = makeCategory({ name: 'Food' });
  });

  describe('GET /api/calendar', () => {
    it('returns calendar for current month (200)', async () => {
      const res = await agent().get('/api/calendar').expect(200);
      assert.ok(res.body.month);
      assert.ok(res.body.start_date);
      assert.ok(res.body.end_date);
      assert.ok(res.body.days);
      assert.equal(typeof res.body.transaction_count, 'number');
      assert.equal(typeof res.body.recurring_event_count, 'number');
    });

    it('returns transactions grouped by day', async () => {
      const todayStr = today();
      makeTransaction(account.id, { description: 'Lunch', amount: 250, date: todayStr, category_id: category.id });
      makeTransaction(account.id, { description: 'Coffee', amount: 50, date: todayStr, category_id: category.id });

      const month = todayStr.slice(0, 7);
      const res = await agent().get(`/api/calendar?month=${month}`).expect(200);
      assert.equal(res.body.month, month);
      const dayData = res.body.days[todayStr];
      assert.ok(dayData);
      assert.equal(dayData.transactions.length, 2);
    });

    it('accepts month parameter in YYYY-MM format', async () => {
      const res = await agent().get('/api/calendar?month=2026-01').expect(200);
      assert.equal(res.body.month, '2026-01');
      assert.equal(res.body.start_date, '2026-01-01');
      assert.equal(res.body.end_date, '2026-01-31');
      // January has 31 days
      assert.equal(Object.keys(res.body.days).length, 31);
    });

    it('handles February correctly (28/29 days)', async () => {
      const res = await agent().get('/api/calendar?month=2026-02').expect(200);
      assert.equal(res.body.end_date, '2026-02-28');
      assert.equal(Object.keys(res.body.days).length, 28);
    });

    it('includes recurring events in calendar', async () => {
      const todayStr = today();
      const month = todayStr.slice(0, 7);
      makeRecurringRule(account.id, {
        description: 'Daily coffee',
        amount: 100,
        frequency: 'daily',
        next_date: todayStr,
      });

      const res = await agent().get(`/api/calendar?month=${month}`).expect(200);
      assert.ok(res.body.recurring_event_count > 0);
    });

    it('falls back to current month for invalid month param', async () => {
      const res = await agent().get('/api/calendar?month=invalid').expect(200);
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      assert.equal(res.body.month, expected);
    });

    it('returns empty days when no transactions', async () => {
      const res = await agent().get('/api/calendar?month=2025-06').expect(200);
      assert.equal(res.body.transaction_count, 0);
      const dayValues = Object.values(res.body.days);
      for (const day of dayValues) {
        assert.equal(day.transactions.length, 0);
      }
    });

    it('includes account and category names in transactions', async () => {
      const todayStr = today();
      makeTransaction(account.id, { description: 'Test', amount: 100, date: todayStr, category_id: category.id });

      const month = todayStr.slice(0, 7);
      const res = await agent().get(`/api/calendar?month=${month}`).expect(200);
      const dayData = res.body.days[todayStr];
      assert.ok(dayData.transactions[0].account_name);
      assert.ok(dayData.transactions[0].category_name);
    });

    it('does not show other users transactions', async () => {
      const todayStr = today();
      makeTransaction(account.id, { description: 'My txn', amount: 100, date: todayStr });

      const { makeSecondUser } = require('./helpers');
      const { agent: user2Agent } = makeSecondUser();
      const month = todayStr.slice(0, 7);
      const res = await user2Agent.get(`/api/calendar?month=${month}`).expect(200);
      assert.equal(res.body.transaction_count, 0);
    });

    it('rejects unauthenticated request (401)', async () => {
      await rawAgent().get('/api/calendar').expect(401);
    });

    it('handles months at year boundary', async () => {
      const res = await agent().get('/api/calendar?month=2025-12').expect(200);
      assert.equal(res.body.month, '2025-12');
      assert.equal(res.body.end_date, '2025-12-31');
    });

    it('recurring rules with end_date are excluded after end', async () => {
      makeRecurringRule(account.id, {
        description: 'Short-lived rule',
        amount: 100,
        frequency: 'daily',
        next_date: '2025-01-01',
        end_date: '2025-01-15',
      });

      const res = await agent().get('/api/calendar?month=2025-02').expect(200);
      assert.equal(res.body.recurring_event_count, 0);
    });

    it('transactions are sorted by date ascending', async () => {
      const month = today().slice(0, 7);
      const day1 = `${month}-05`;
      const day2 = `${month}-15`;
      makeTransaction(account.id, { description: 'Later', amount: 100, date: day2 });
      makeTransaction(account.id, { description: 'Earlier', amount: 200, date: day1 });

      const res = await agent().get(`/api/calendar?month=${month}`).expect(200);
      const txns = Object.values(res.body.days).flatMap(d => d.transactions);
      for (let i = 1; i < txns.length; i++) {
        assert.ok(txns[i].date >= txns[i - 1].date);
      }
    });
  });
});
