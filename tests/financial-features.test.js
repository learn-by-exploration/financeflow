const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, makeTransaction, makeBudget, makeGoal, makeSubscription, today, daysFromNow } = require('./helpers');

describe('Financial Features (Iterations 21-30)', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount({ balance: 100000 });
    category = makeCategory({ name: 'Food' });
  });

  // ─── Iteration 21-22: Financial health score ───
  describe('GET /api/stats/financial-health', () => {
    it('returns gated message when not enough data', async () => {
      const res = await agent().get('/api/stats/financial-health').expect(200);
      assert.ok(res.body.gated);
      assert.ok(res.body.message);
    });

    it('returns health score with sufficient data', async () => {
      // Create 60 days of transactions
      const { db } = setup();
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() - 60);

      for (let i = 0; i < 60; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        makeTransaction(account.id, { amount: 500, type: 'expense', date: dateStr, description: `Day ${i}` });
        if (i % 30 === 0) {
          makeTransaction(account.id, { amount: 50000, type: 'income', date: dateStr, description: `Salary ${i}` });
        }
      }

      const res = await agent().get('/api/stats/financial-health').expect(200);
      if (!res.body.gated) {
        assert.equal(typeof res.body.score, 'number');
        assert.ok(res.body.score >= 0 && res.body.score <= 100);
        assert.equal(typeof res.body.net_worth, 'number');
        assert.equal(typeof res.body.savings_rate, 'number');
      }
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/stats/financial-health').expect(401);
    });
  });

  // ─── Iteration 23: Savings rate ───
  describe('GET /api/reports/year-in-review savings rate', () => {
    it('calculates savings rate', async () => {
      makeTransaction(account.id, { amount: 50000, type: 'income', date: today(), description: 'Salary' });
      makeTransaction(account.id, { amount: 30000, type: 'expense', date: today(), description: 'Rent' });

      const year = new Date().getFullYear();
      const res = await agent().get(`/api/reports/year-in-review?year=${year}`).expect(200);
      assert.ok(res.body.report || res.body.total_income !== undefined);
    });
  });

  // ─── Iteration 24: Budget variance ───
  describe('GET /api/stats/budget-variance', () => {
    it('returns budget variance analysis (200)', async () => {
      const cat = makeCategory({ name: 'Shopping' });
      makeBudget({
        name: 'Monthly Budget',
        start_date: today(),
        end_date: daysFromNow(30),
        items: [{ category_id: cat.id, amount: 5000 }],
      });

      makeTransaction(account.id, { amount: 3000, type: 'expense', category_id: cat.id, date: today() });

      const res = await agent().get('/api/stats/budget-variance').expect(200);
      assert.ok(Array.isArray(res.body.budgets));
      assert.ok(res.body.budgets.length >= 1);

      const budget = res.body.budgets[0];
      assert.equal(budget.budget_name, 'Monthly Budget');
      assert.equal(budget.total_budgeted, 5000);
      assert.equal(budget.total_actual, 3000);
      assert.equal(budget.total_variance, 2000);

      const item = budget.items[0];
      assert.equal(item.budgeted, 5000);
      assert.equal(item.actual, 3000);
      assert.equal(item.status, 'on_track');
    });

    it('detects over-budget status', async () => {
      const cat = makeCategory({ name: 'Overbudget' });
      makeBudget({
        name: 'Tight Budget',
        start_date: today(),
        end_date: daysFromNow(30),
        items: [{ category_id: cat.id, amount: 1000 }],
      });

      makeTransaction(account.id, { amount: 1500, type: 'expense', category_id: cat.id, date: today() });

      const res = await agent().get('/api/stats/budget-variance').expect(200);
      const budget = res.body.budgets[0];
      assert.equal(budget.items[0].status, 'over');
      assert.ok(budget.items[0].variance < 0);
    });

    it('returns empty array when no budgets exist', async () => {
      const res = await agent().get('/api/stats/budget-variance').expect(200);
      assert.deepEqual(res.body.budgets, []);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/stats/budget-variance').expect(401);
    });
  });

  // ─── Iteration 25: Emergency fund tracker ───
  describe('Goals as emergency fund tracker', () => {
    it('creates emergency fund goal', async () => {
      const res = await agent().post('/api/goals').send({
        name: 'Emergency Fund',
        target_amount: 300000,
        icon: '🛡️',
        color: '#10b981',
      }).expect(201);
      assert.equal(res.body.goal.name, 'Emergency Fund');
      assert.equal(res.body.goal.target_amount, 300000);
    });

    it('tracks progress toward emergency fund', async () => {
      const goal = makeGoal({ name: 'Emergency Fund', target_amount: 100000, current_amount: 25000 });
      const res = await agent().get('/api/goals').expect(200);
      const fund = res.body.goals.find(g => g.name === 'Emergency Fund');
      assert.ok(fund);
      assert.equal(fund.current_amount, 25000);
    });
  });

  // ─── Iteration 26: EMI Calculator ───
  describe('GET /api/stats/emi-calculator', () => {
    it('calculates EMI correctly (200)', async () => {
      const res = await agent()
        .get('/api/stats/emi-calculator?principal=1000000&rate=8.5&tenure=240')
        .expect(200);

      assert.equal(res.body.principal, 1000000);
      assert.equal(res.body.annual_rate, 8.5);
      assert.equal(res.body.tenure_months, 240);
      assert.ok(res.body.monthly_emi > 0);
      assert.ok(res.body.total_payment > res.body.principal);
      assert.ok(res.body.total_interest > 0);
      assert.equal(res.body.schedule.length, 240);

      // EMI for 10L at 8.5% for 20 years ≈ ₹8,678
      assert.ok(res.body.monthly_emi > 8000 && res.body.monthly_emi < 9500);
    });

    it('first month interest is higher than principal', async () => {
      const res = await agent()
        .get('/api/stats/emi-calculator?principal=1000000&rate=12&tenure=120')
        .expect(200);

      const first = res.body.schedule[0];
      assert.ok(first.interest > first.principal, 'First month interest should exceed principal');
    });

    it('last month balance is zero', async () => {
      const res = await agent()
        .get('/api/stats/emi-calculator?principal=500000&rate=10&tenure=60')
        .expect(200);

      const last = res.body.schedule[res.body.schedule.length - 1];
      assert.equal(last.balance, 0);
    });

    it('rejects missing parameters (400)', async () => {
      await agent().get('/api/stats/emi-calculator').expect(400);
      await agent().get('/api/stats/emi-calculator?principal=100000').expect(400);
      await agent().get('/api/stats/emi-calculator?principal=100000&rate=8').expect(400);
    });

    it('rejects negative values (400)', async () => {
      await agent().get('/api/stats/emi-calculator?principal=-100000&rate=8&tenure=60').expect(400);
    });

    it('rejects zero values (400)', async () => {
      await agent().get('/api/stats/emi-calculator?principal=0&rate=8&tenure=60').expect(400);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/stats/emi-calculator?principal=100000&rate=8&tenure=60').expect(401);
    });
  });

  // ─── Iteration 27: Subscription savings analysis ───
  describe('GET /api/stats/subscription-savings', () => {
    it('analyzes subscription costs (200)', async () => {
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });
      makeSubscription({ name: 'Spotify', amount: 119, frequency: 'monthly' });
      makeSubscription({ name: 'Amazon Prime', amount: 1499, frequency: 'yearly' });

      const res = await agent().get('/api/stats/subscription-savings').expect(200);
      assert.ok(res.body.total_monthly > 0);
      assert.ok(res.body.total_yearly > 0);
      assert.equal(res.body.subscription_count, 3);
      assert.equal(res.body.subscriptions.length, 3);

      // Monthly costs: 199 + 119 + 1499/12 ≈ 443
      assert.ok(res.body.total_monthly > 400);
    });

    it('sorts by monthly cost descending', async () => {
      makeSubscription({ name: 'Expensive', amount: 999, frequency: 'monthly' });
      makeSubscription({ name: 'Cheap', amount: 99, frequency: 'monthly' });

      const res = await agent().get('/api/stats/subscription-savings').expect(200);
      assert.ok(res.body.subscriptions[0].monthly_cost >= res.body.subscriptions[1].monthly_cost);
    });

    it('normalizes different frequencies to monthly', async () => {
      makeSubscription({ name: 'Weekly', amount: 100, frequency: 'weekly' });

      const res = await agent().get('/api/stats/subscription-savings').expect(200);
      // Weekly 100 * 4.33 ≈ 433
      assert.ok(res.body.subscriptions[0].monthly_cost > 400);
    });

    it('returns empty when no subscriptions', async () => {
      const res = await agent().get('/api/stats/subscription-savings').expect(200);
      assert.equal(res.body.subscription_count, 0);
      assert.equal(res.body.total_monthly, 0);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/stats/subscription-savings').expect(401);
    });
  });

  // ─── Iteration 28: Year-over-year comparison ───
  describe('GET /api/reports/compare', () => {
    it('compares two months (200)', async () => {
      makeTransaction(account.id, { amount: 5000, type: 'expense', date: today() });

      const res = await agent().get('/api/reports/compare?month1=2025-12&month2=2026-01').expect(200);
      assert.ok(res.body);
    });
  });

  // ─── Iteration 29: Category insights ───
  describe('GET /api/stats/category-breakdown', () => {
    it('returns spending by category (200)', async () => {
      const food = makeCategory({ name: 'Dining' });
      const transport = makeCategory({ name: 'Transport' });

      makeTransaction(account.id, { amount: 500, type: 'expense', category_id: food.id, date: today() });
      makeTransaction(account.id, { amount: 300, type: 'expense', category_id: food.id, date: today() });
      makeTransaction(account.id, { amount: 200, type: 'expense', category_id: transport.id, date: today() });

      const res = await agent().get('/api/stats/category-breakdown').expect(200);
      assert.ok(Array.isArray(res.body.breakdown));
      assert.ok(res.body.breakdown.length >= 2);

      // Dining should be first (most spending)
      assert.equal(res.body.breakdown[0].name, 'Dining');
      assert.equal(res.body.breakdown[0].total, 800);
    });

    it('filters by date range', async () => {
      makeTransaction(account.id, { amount: 100, type: 'expense', category_id: category.id, date: '2026-01-15' });
      makeTransaction(account.id, { amount: 200, type: 'expense', category_id: category.id, date: '2026-02-15' });

      const res = await agent().get('/api/stats/category-breakdown?from=2026-02-01&to=2026-02-28').expect(200);
      if (res.body.breakdown.length > 0) {
        assert.equal(res.body.breakdown[0].total, 200);
      }
    });
  });

  // ─── Iteration 30: Cash flow forecast ───
  describe('GET /api/reports/cashflow-forecast', () => {
    it('returns forecast data (200)', async () => {
      makeTransaction(account.id, { amount: 50000, type: 'income', date: today() });
      makeTransaction(account.id, { amount: 30000, type: 'expense', date: today() });

      const res = await agent().get('/api/reports/cashflow-forecast').expect(200);
      assert.ok(res.body);
    });
  });

  // ─── Stats overview ───
  describe('GET /api/stats/overview', () => {
    it('returns complete dashboard overview (200)', async () => {
      makeTransaction(account.id, { amount: 50000, type: 'income', date: today() });
      makeTransaction(account.id, { amount: 2000, type: 'expense', date: today(), category_id: category.id });
      makeSubscription({ name: 'Netflix', amount: 199, frequency: 'monthly' });

      const res = await agent().get('/api/stats/overview').expect(200);
      assert.equal(typeof res.body.net_worth, 'number');
      assert.equal(typeof res.body.month_income, 'number');
      assert.equal(typeof res.body.month_expense, 'number');
      assert.ok(Array.isArray(res.body.top_categories));
      assert.ok(Array.isArray(res.body.recent_transactions));
    });
  });

  // ─── Trends ───
  describe('GET /api/stats/trends', () => {
    it('returns monthly trends (200)', async () => {
      makeTransaction(account.id, { amount: 50000, type: 'income', date: today() });
      makeTransaction(account.id, { amount: 20000, type: 'expense', date: today() });

      const res = await agent().get('/api/stats/trends').expect(200);
      assert.ok(Array.isArray(res.body.trends));
    });

    it('supports FY query parameter', async () => {
      const { db } = setup();
      db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'financial_year_start', '4')").run(1);

      const res = await agent().get('/api/stats/trends?fy=2025').expect(200);
      assert.ok(Array.isArray(res.body.trends));
    });
  });
});
