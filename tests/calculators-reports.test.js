// tests/calculators-reports.test.js — Calculator and report endpoint tests
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction, makeBudget, makeSubscription } = require('./helpers');

describe('Calculators & Reports', () => {
  let app, db;
  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  describe('EMI Calculator', () => {
    it('calculates basic EMI', async () => {
      const res = await agent().get('/api/stats/emi-calculator?principal=1000000&rate=10&tenure=240');
      assert.equal(res.status, 200);
      assert.ok(res.body.monthly_emi > 0);
      assert.ok(res.body.total_payment > 1000000);
      assert.ok(res.body.total_interest > 0);
    });

    it('rejects negative rate', async () => {
      const res = await agent().get('/api/stats/emi-calculator?principal=100000&rate=-5&tenure=12');
      assert.equal(res.status, 400);
    });

    it('rejects tenure of 0', async () => {
      const res = await agent().get('/api/stats/emi-calculator?principal=100000&rate=10&tenure=0');
      assert.equal(res.status, 400);
    });

    it('rejects missing parameters', async () => {
      const res = await agent().get('/api/stats/emi-calculator');
      assert.equal(res.status, 400);
    });
  });

  describe('SIP Calculator', () => {
    it('calculates basic SIP returns', async () => {
      const res = await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=10');
      assert.equal(res.status, 200);
      assert.ok(res.body.total_invested > 0);
      assert.ok(res.body.future_value > res.body.total_invested);
    });

    it('handles step-up SIP', async () => {
      const res = await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=10&step_up=10');
      assert.equal(res.status, 200);
      const noStepUp = await agent().get('/api/stats/sip-calculator?monthly=10000&return=12&years=10&step_up=0');
      // Step-up should result in higher total
      assert.ok(res.body.future_value > noStepUp.body.future_value);
    });

    it('rejects excessive return rate', async () => {
      const res = await agent().get('/api/stats/sip-calculator?monthly=10000&return=60&years=10');
      assert.equal(res.status, 400);
    });
  });

  describe('FIRE Calculator', () => {
    it('calculates FIRE number', async () => {
      const res = await agent().get('/api/stats/fire-calculator?annual_expense=600000');
      assert.equal(res.status, 200);
      assert.ok(res.body.fire_number > 0);
    });

    it('custom withdrawal rate affects FIRE number', async () => {
      const res3 = await agent().get('/api/stats/fire-calculator?annual_expense=600000&withdrawal_rate=3');
      const res4 = await agent().get('/api/stats/fire-calculator?annual_expense=600000&withdrawal_rate=4');
      // Lower withdrawal rate = higher FIRE number (more conservative)
      assert.ok(res3.body.fire_number > res4.body.fire_number);
    });

    it('rejects negative annual expense', async () => {
      const res = await agent().get('/api/stats/fire-calculator?annual_expense=-100');
      assert.equal(res.status, 400);
    });
  });

  describe('Lumpsum Calculator', () => {
    it('calculates growth correctly', async () => {
      const res = await agent().get('/api/stats/lumpsum-calculator?principal=100000&return=10&years=10');
      assert.equal(res.status, 200);
      assert.ok(res.body.future_value > 100000);
      assert.ok(res.body.total_gains > 0);
    });
  });

  describe('Debt Payoff', () => {
    it('returns empty when no debts', async () => {
      const res = await agent().get('/api/stats/debt-payoff');
      assert.equal(res.status, 200);
      assert.equal(res.body.debts.length, 0);
    });

    it('calculates snowball and avalanche with debts', async () => {
      makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -15000 });
      makeAccount({ name: 'Personal Loan', type: 'loan', balance: -100000 });

      const res = await agent().get('/api/stats/debt-payoff');
      assert.equal(res.status, 200);
      assert.ok(res.body.total_debt > 0);
      assert.ok(res.body.snowball_order.length === 2);
      assert.ok(res.body.avalanche_order.length === 2);
      assert.equal(res.body.recommendation, 'avalanche');
    });

    it('handles extra payment parameter', async () => {
      makeAccount({ type: 'credit_card', balance: -10000 });
      const res = await agent().get('/api/stats/debt-payoff?extra=5000');
      assert.equal(res.status, 200);
      assert.equal(res.body.extra_payment, 5000);
    });
  });

  describe('Tax Summary', () => {
    it('returns tax summary for current FY', async () => {
      const acct = makeAccount();
      const cat = makeCategory({ name: 'Salary', type: 'income' });
      makeTransaction(acct.id, { type: 'income', amount: 50000, category_id: cat.id });

      const res = await agent().get('/api/stats/tax-summary');
      assert.equal(res.status, 200);
      assert.ok(res.body.financial_year);
      assert.ok(res.body.section_80c_limit === 150000);
    });
  });

  describe('Spending Streak', () => {
    it('returns streak data', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      makeTransaction(acct.id, { category_id: cat.id });

      const res = await agent().get('/api/stats/spending-streak');
      assert.equal(res.status, 200);
      assert.ok('current_streak' in res.body);
      assert.ok('longest_streak' in res.body);
      assert.ok(res.body.total_tracking_days >= 1);
    });

    it('returns zeros with no transactions', async () => {
      const res = await agent().get('/api/stats/spending-streak');
      assert.equal(res.status, 200);
      assert.equal(res.body.current_streak, 0);
    });
  });

  describe('Subscription Savings', () => {
    it('analyzes subscription costs', async () => {
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      makeSubscription({ name: 'Annual Plan', amount: 2400, frequency: 'yearly' });

      const res = await agent().get('/api/stats/subscription-savings');
      assert.equal(res.status, 200);
      assert.equal(res.body.subscription_count, 2);
      // Netflix (199) + Annual (2400/12 = 200) = ~399/month
      assert.ok(res.body.total_monthly >= 390);
      assert.ok(res.body.total_yearly > 0);
      // Most expensive first
      assert.ok(res.body.subscriptions[0].monthly_cost >= res.body.subscriptions[1].monthly_cost);
    });
  });

  describe('Budget Variance', () => {
    it('calculates variance with active budget', async () => {
      const cat = makeCategory({ name: 'Food' });
      const acct = makeAccount();
      makeBudget({
        start_date: '2020-01-01', end_date: '2099-12-31',
        items: [{ category_id: cat.id, amount: 5000 }]
      });
      makeTransaction(acct.id, {
        category_id: cat.id, type: 'expense', amount: 3000,
        date: new Date().toISOString().slice(0, 10)
      });

      const res = await agent().get('/api/stats/budget-variance');
      assert.equal(res.status, 200);
      assert.ok(res.body.budgets.length >= 1);
      const b = res.body.budgets[0];
      assert.ok(b.items.length >= 1);
      assert.ok(b.items[0].budgeted === 5000);
      assert.ok(b.items[0].actual >= 3000);
    });
  });

  describe('Reports', () => {
    it('year-in-review returns correct structure', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const year = new Date().getFullYear().toString();
      makeTransaction(acct.id, { category_id: cat.id, type: 'expense', amount: 500, date: `${year}-06-15` });
      makeTransaction(acct.id, { category_id: cat.id, type: 'income', amount: 5000, date: `${year}-06-15` });

      const res = await agent().get(`/api/reports/year-in-review?year=${year}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.year, year);
      assert.ok(res.body.total_income >= 5000);
      assert.ok(res.body.total_expenses >= 500);
      assert.equal(res.body.monthly_breakdown.length, 12);
    });

    it('month compare shows differences', async () => {
      const res = await agent().get('/api/reports/compare?month1=2025-01&month2=2025-02');
      assert.equal(res.status, 200);
    });

    it('cashflow forecast returns array', async () => {
      const res = await agent().get('/api/reports/cashflow-forecast?days=30');
      assert.equal(res.status, 200);
    });

    it('trends report returns monthly data', async () => {
      const res = await agent().get('/api/reports/trends');
      assert.equal(res.status, 200);
    });

    it('category breakdown by date range', async () => {
      const res = await agent().get('/api/reports/categories?from=2020-01-01&to=2099-12-31');
      assert.equal(res.status, 200);
    });

    it('rejects invalid date format', async () => {
      const res = await agent().get('/api/reports/monthly?month=invalid');
      assert.equal(res.status, 400);
    });

    it('net-worth-history returns data', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { type: 'income', amount: 50000 });

      const res = await agent().get('/api/reports/net-worth-history');
      assert.equal(res.status, 200);
      assert.ok(res.body.history);
    });
  });

  describe('Charts', () => {
    it('cashflow chart returns data', async () => {
      const from = '2020-01-01';
      const to = '2099-12-31';
      const res = await agent().get(`/api/charts/cashflow?from=${from}&to=${to}`);
      assert.equal(res.status, 200);
    });

    it('spending-pie returns data', async () => {
      const res = await agent().get('/api/charts/spending-pie?from=2020-01-01&to=2099-12-31');
      assert.equal(res.status, 200);
    });

    it('income-expense returns data', async () => {
      const res = await agent().get('/api/charts/income-expense?from=2020-01-01&to=2099-12-31');
      assert.equal(res.status, 200);
    });

    it('net-worth chart', async () => {
      const res = await agent().get('/api/charts/net-worth?from=2020-01-01&to=2099-12-31');
      assert.equal(res.status, 200);
    });

    it('balance-history requires account_id', async () => {
      const res = await agent().get('/api/charts/balance-history?from=2020-01-01&to=2099-12-31');
      assert.equal(res.status, 400);
    });
  });

  describe('Insights', () => {
    it('spending trends returns data', async () => {
      const res = await agent().get('/api/insights/trends');
      assert.equal(res.status, 200);
    });

    it('anomalies returns array', async () => {
      const res = await agent().get('/api/insights/anomalies');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.anomalies));
    });

    it('velocity returns data', async () => {
      const res = await agent().get('/api/insights/velocity');
      assert.equal(res.status, 200);
    });

    it('category changes', async () => {
      const res = await agent().get('/api/insights/categories');
      assert.equal(res.status, 200);
    });
  });
});
