// tests/budget-recommendations.test.js — Smart budget recommendations + upcoming forecast
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeRecurringRule, today, daysFromNow } = require('./helpers');

describe('Budget Recommendations & Upcoming Forecast', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);
  beforeEach(cleanDb);

  describe('GET /api/stats/budget-recommendations', () => {
    it('returns empty categories when no spending', async () => {
      const res = await agent().get('/api/stats/budget-recommendations');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.categories));
      assert.equal(res.body.categories.length, 0);
    });

    it('returns recommendations based on spending', async () => {
      const account = makeAccount();
      const category = makeCategory({ name: 'Food', type: 'expense' });
      // Create transactions over recent months
      makeTransaction(account.id, { category_id: category.id, type: 'expense', amount: 3000, date: today() });
      makeTransaction(account.id, { category_id: category.id, type: 'expense', amount: 4000, date: today() });

      const res = await agent().get('/api/stats/budget-recommendations');
      assert.equal(res.status, 200);
      assert.ok(res.body.categories.length >= 1);
      const food = res.body.categories.find(c => c.category_name === 'Food');
      assert.ok(food);
      assert.ok(food.suggestions.recommended > 0);
      assert.ok(food.suggestions.aggressive > 0);
      assert.ok(food.suggestions.conservative > 0);
      // Conservative >= recommended >= aggressive
      assert.ok(food.suggestions.conservative >= food.suggestions.recommended);
      assert.ok(food.suggestions.recommended >= food.suggestions.aggressive);
    });

    it('accepts months parameter', async () => {
      const account = makeAccount();
      const category = makeCategory({ name: 'Shopping', type: 'expense' });
      makeTransaction(account.id, { category_id: category.id, type: 'expense', amount: 5000 });

      const res = await agent().get('/api/stats/budget-recommendations?months=6');
      assert.equal(res.status, 200);
      assert.equal(res.body.period_months, 6);
    });

    it('includes total monthly average', async () => {
      const account = makeAccount();
      const cat1 = makeCategory({ name: 'Food', type: 'expense' });
      const cat2 = makeCategory({ name: 'Transport', type: 'expense' });
      makeTransaction(account.id, { category_id: cat1.id, type: 'expense', amount: 5000 });
      makeTransaction(account.id, { category_id: cat2.id, type: 'expense', amount: 2000 });

      const res = await agent().get('/api/stats/budget-recommendations');
      assert.equal(res.status, 200);
      assert.ok(res.body.total_monthly_average > 0);
    });

    it('orders categories by total spent descending', async () => {
      const account = makeAccount();
      const catLow = makeCategory({ name: 'Low', type: 'expense' });
      const catHigh = makeCategory({ name: 'High', type: 'expense' });
      makeTransaction(account.id, { category_id: catLow.id, type: 'expense', amount: 500 });
      makeTransaction(account.id, { category_id: catHigh.id, type: 'expense', amount: 10000 });

      const res = await agent().get('/api/stats/budget-recommendations');
      assert.ok(res.body.categories[0].total_spent >= res.body.categories[1].total_spent);
    });

    it('ignores income categories', async () => {
      const account = makeAccount();
      const incomeCat = makeCategory({ name: 'Salary', type: 'income' });
      makeTransaction(account.id, { category_id: incomeCat.id, type: 'income', amount: 50000 });

      const res = await agent().get('/api/stats/budget-recommendations');
      assert.equal(res.body.categories.length, 0);
    });
  });

  describe('GET /api/stats/upcoming-forecast', () => {
    it('returns empty when no recurring rules', async () => {
      const res = await agent().get('/api/stats/upcoming-forecast');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.upcoming));
      assert.equal(res.body.upcoming.length, 0);
    });

    it('returns upcoming recurring transactions', async () => {
      const account = makeAccount();
      makeRecurringRule(account.id, {
        type: 'expense',
        amount: 5000,
        frequency: 'monthly',
        next_date: today(),
        description: 'Rent',
      });

      const res = await agent().get('/api/stats/upcoming-forecast');
      assert.equal(res.status, 200);
      assert.ok(res.body.upcoming.length >= 1);
      assert.ok(res.body.total_expected_expense > 0);
    });

    it('includes income rules in forecast', async () => {
      const account = makeAccount();
      makeRecurringRule(account.id, {
        type: 'income',
        amount: 50000,
        frequency: 'monthly',
        next_date: today(),
        description: 'Salary',
      });

      const res = await agent().get('/api/stats/upcoming-forecast');
      assert.ok(res.body.total_expected_income > 0);
    });

    it('calculates net expected correctly', async () => {
      const account = makeAccount();
      makeRecurringRule(account.id, {
        type: 'income', amount: 50000, frequency: 'monthly',
        next_date: today(), description: 'Salary',
      });
      makeRecurringRule(account.id, {
        type: 'expense', amount: 15000, frequency: 'monthly',
        next_date: today(), description: 'Rent',
      });

      const res = await agent().get('/api/stats/upcoming-forecast');
      assert.equal(res.body.net_expected, res.body.total_expected_income - res.body.total_expected_expense);
    });

    it('accepts custom days parameter', async () => {
      const res = await agent().get('/api/stats/upcoming-forecast?days=7');
      assert.equal(res.status, 200);
      assert.equal(res.body.days, 7);
    });

    it('caps at 90 days', async () => {
      const res = await agent().get('/api/stats/upcoming-forecast?days=500');
      assert.equal(res.body.days, 90);
    });

    it('sorts upcoming by date', async () => {
      const account = makeAccount();
      makeRecurringRule(account.id, {
        type: 'expense', amount: 1000, frequency: 'daily',
        next_date: today(), description: 'Daily',
      });

      const res = await agent().get('/api/stats/upcoming-forecast?days=5');
      for (let i = 1; i < res.body.upcoming.length; i++) {
        assert.ok(res.body.upcoming[i].date >= res.body.upcoming[i - 1].date);
      }
    });
  });
});
