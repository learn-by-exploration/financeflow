// tests/v2-new-features.test.js — Iteration 16-25: New financial features
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction, makeGoal, makeSubscription, makeBudget, today, daysFromNow } = require('./helpers');

describe('v2 New Features (Iter 16-25)', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 500000 });
    category = makeCategory({ name: 'Food', type: 'expense' });
  });

  // ─── Iteration 16-17: Financial snapshot ───
  describe('Financial snapshot', () => {
    it('returns comprehensive snapshot with no data', async () => {
      const res = await agent().get('/api/stats/financial-snapshot').expect(200);
      assert.ok('net_worth' in res.body);
      assert.ok('savings_rate' in res.body);
      assert.ok('active_budgets' in res.body);
      assert.ok('active_goals' in res.body);
      assert.ok('active_subscriptions' in res.body);
      assert.ok('accounts_count' in res.body);
      assert.ok('transactions_this_month' in res.body);
    });

    it('reflects real data in snapshot', async () => {
      makeTransaction(account.id, { type: 'income', amount: 100000, date: today() });
      makeTransaction(account.id, { type: 'expense', amount: 30000, date: today(), category_id: category.id });
      makeGoal({ name: 'Emergency Fund', target_amount: 200000, current_amount: 50000 });
      makeSubscription({ name: 'Netflix', amount: 499, frequency: 'monthly' });

      const res = await agent().get('/api/stats/financial-snapshot').expect(200);
      assert.ok(res.body.month_income >= 100000);
      assert.ok(res.body.month_expense >= 30000);
      assert.ok(res.body.savings_rate > 0);
      assert.ok(res.body.active_goals >= 1);
      assert.ok(res.body.active_subscriptions >= 1);
      assert.ok(res.body.monthly_subscription_cost >= 499);
    });
  });

  // ─── Iteration 18-19: Savings rate history ───
  describe('Savings rate history', () => {
    it('returns empty history with no transactions', async () => {
      const res = await agent().get('/api/stats/savings-rate-history').expect(200);
      assert.ok(Array.isArray(res.body.history));
    });

    it('calculates savings rate per month', async () => {
      makeTransaction(account.id, { type: 'income', amount: 100000, date: today() });
      makeTransaction(account.id, { type: 'expense', amount: 40000, date: today() });

      const res = await agent().get('/api/stats/savings-rate-history').expect(200);
      assert.ok(res.body.history.length >= 1);
      const thisMonth = res.body.history[res.body.history.length - 1];
      assert.ok(thisMonth.savings_rate > 0);
      assert.ok(thisMonth.income >= 100000);
      assert.ok(thisMonth.expense >= 40000);
    });

    it('respects months parameter', async () => {
      const res = await agent().get('/api/stats/savings-rate-history?months=3').expect(200);
      assert.ok(Array.isArray(res.body.history));
    });
  });

  // ─── Iteration 20-21: Goal milestones ───
  describe('Goal milestones', () => {
    it('returns milestones for goals', async () => {
      makeGoal({ name: 'Car Fund', target_amount: 500000, current_amount: 275000 }); // 55%
      makeGoal({ name: 'Vacation', target_amount: 100000, current_amount: 10000 }); // 10%

      const res = await agent().get('/api/stats/goal-milestones').expect(200);
      assert.equal(res.body.milestones.length, 2);

      const carMilestone = res.body.milestones.find(m => m.goal_name === 'Car Fund');
      assert.ok(carMilestone.percentage >= 55);
      assert.deepEqual(carMilestone.milestones_achieved, [10, 25, 50]);
      assert.equal(carMilestone.next_milestone, 75);

      const vacationMilestone = res.body.milestones.find(m => m.goal_name === 'Vacation');
      assert.deepEqual(vacationMilestone.milestones_achieved, [10]);
      assert.equal(vacationMilestone.next_milestone, 25);
    });

    it('shows completed goal with all milestones', async () => {
      makeGoal({ name: 'Done Goal', target_amount: 100000, current_amount: 100000, is_completed: 1 });

      const res = await agent().get('/api/stats/goal-milestones').expect(200);
      const done = res.body.milestones[0];
      assert.deepEqual(done.milestones_achieved, [10, 25, 50, 75, 90, 100]);
      assert.equal(done.next_milestone, null);
      assert.equal(done.is_completed, true);
    });

    it('handles goal with zero target', async () => {
      makeGoal({ name: 'Zero Target', target_amount: 0, current_amount: 0 });

      const res = await agent().get('/api/stats/goal-milestones').expect(200);
      assert.equal(res.body.milestones[0].percentage, 0);
    });
  });

  // ─── Iteration 22-23: Auth-required for new endpoints ───
  describe('New endpoints require auth', () => {
    const newPaths = [
      '/api/stats/financial-snapshot',
      '/api/stats/savings-rate-history',
      '/api/stats/goal-milestones',
      '/api/stats/sip-calculator?monthly=10000&return=12&years=10',
      '/api/stats/lumpsum-calculator?principal=100000&return=10&years=5',
      '/api/stats/fire-calculator?annual_expense=600000',
      '/api/stats/spending-streak',
      '/api/stats/net-worth-trend',
    ];
    for (const path of newPaths) {
      it(`${path.split('?')[0]} requires auth`, async () => {
        const { rawAgent } = require('./helpers');
        await rawAgent().get(path).expect(401);
      });
    }
  });

  // ─── Iteration 24-25: Edge cases for all calculators ───
  describe('Calculator edge cases', () => {
    it('SIP with 1 year gives 12 months breakdown', async () => {
      const res = await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=1').expect(200);
      assert.equal(res.body.yearly_breakdown.length, 1);
      assert.equal(res.body.total_invested, 120000);
    });

    it('Lumpsum with 1 year', async () => {
      const res = await agent().get('/api/stats/lumpsum-calculator?principal=100000&return=10&years=1').expect(200);
      assert.equal(res.body.future_value, 110000);
    });

    it('FIRE with high inflation', async () => {
      const res = await agent().get('/api/stats/fire-calculator?annual_expense=500000&inflation_rate=10&years=30').expect(200);
      assert.ok(res.body.future_annual_expense > 5000000); // 10% compounded 30 years
    });

    it('EMI with 1 month tenure', async () => {
      const res = await agent().get('/api/stats/emi-calculator?principal=100000&rate=12&tenure=1').expect(200);
      assert.equal(res.body.schedule.length, 1);
      assert.ok(res.body.monthly_emi > 100000); // principal + 1 month interest
    });

    it('financial snapshot with multiple account types', async () => {
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -50000 });
      makeAccount({ name: 'Loan', type: 'loan', balance: -200000 });

      const res = await agent().get('/api/stats/financial-snapshot').expect(200);
      assert.ok(res.body.total_liabilities >= 250000);
      assert.ok(res.body.net_worth < res.body.total_assets);
    });
  });
});
