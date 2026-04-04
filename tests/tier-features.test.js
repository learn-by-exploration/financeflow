// tests/tier-features.test.js — Tests for Tier 1-3 features
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, today, daysFromNow } = require('./helpers');

describe('Tier Features', () => {
  let app, db;

  before(() => {
    ({ app, db } = setup());
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── Financial Todos ───────────────────────────────────

  describe('Financial Todos', () => {
    it('POST /api/financial-todos creates a todo', async () => {
      const res = await agent().post('/api/financial-todos').send({
        title: 'Open FD account',
        description: 'Research best rates',
        priority: 'high',
        due_date: daysFromNow(30),
      }).expect(201);
      assert.ok(res.body.todo);
      assert.ok(res.body.todo.id);
      assert.equal(res.body.todo.title, 'Open FD account');
      assert.equal(res.body.todo.priority, 'high');
      assert.equal(res.body.todo.status, 'pending');
    });

    it('GET /api/financial-todos lists todos', async () => {
      await agent().post('/api/financial-todos').send({ title: 'Todo 1', priority: 'low' });
      await agent().post('/api/financial-todos').send({ title: 'Todo 2', priority: 'high' });
      const res = await agent().get('/api/financial-todos').expect(200);
      assert.ok(Array.isArray(res.body.todos));
      assert.ok(res.body.todos.length >= 2);
      // High priority should come first
      assert.equal(res.body.todos[0].priority, 'high');
    });

    it('GET /api/financial-todos filters by status', async () => {
      const { body } = await agent().post('/api/financial-todos').send({ title: 'Done', priority: 'low' });
      await agent().put(`/api/financial-todos/${body.todo.id}`).send({ status: 'completed' });
      await agent().post('/api/financial-todos').send({ title: 'Pending', priority: 'low' });

      const res = await agent().get('/api/financial-todos?status=pending').expect(200);
      assert.ok(res.body.todos.every(t => t.status === 'pending'));
    });

    it('PUT /api/financial-todos/:id updates a todo', async () => {
      const { body } = await agent().post('/api/financial-todos').send({ title: 'Old', priority: 'low' });
      const res = await agent().put(`/api/financial-todos/${body.todo.id}`).send({
        title: 'Updated',
        status: 'completed',
      }).expect(200);
      assert.equal(res.body.todo.title, 'Updated');
      assert.equal(res.body.todo.status, 'completed');
      assert.ok(res.body.todo.completed_at);
    });

    it('DELETE /api/financial-todos/:id removes a todo', async () => {
      const { body } = await agent().post('/api/financial-todos').send({ title: 'Delete me', priority: 'low' });
      const res = await agent().delete(`/api/financial-todos/${body.todo.id}`).expect(200);
      assert.ok(res.body.ok);
    });

    it('rejects invalid priority', async () => {
      await agent().post('/api/financial-todos').send({ title: 'Bad', priority: 'urgent' }).expect(400);
    });

    it('returns 404 for unknown todo', async () => {
      await agent().put('/api/financial-todos/99999').send({ title: 'X' }).expect(404);
    });
  });

  // ─── Personal Lending ─────────────────────────────────

  describe('Personal Lending', () => {
    it('POST /api/lending creates a lending entry', async () => {
      const res = await agent().post('/api/lending').send({
        person_name: 'Rahul',
        type: 'lent',
        amount: 5000,
        outstanding: 5000,
        currency: 'INR',
        start_date: today(),
        purpose: 'Medical emergency',
      }).expect(201);
      assert.ok(res.body.item);
      assert.ok(res.body.item.id);
      assert.equal(res.body.item.person_name, 'Rahul');
      assert.equal(res.body.item.type, 'lent');
      assert.equal(res.body.item.amount, 5000);
      assert.equal(res.body.item.outstanding, 5000);
    });

    it('GET /api/lending lists all lending entries', async () => {
      await agent().post('/api/lending').send({ person_name: 'A', type: 'lent', amount: 1000, outstanding: 1000, currency: 'INR', start_date: today() });
      await agent().post('/api/lending').send({ person_name: 'B', type: 'borrowed', amount: 2000, outstanding: 2000, currency: 'INR', start_date: today() });
      const res = await agent().get('/api/lending').expect(200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length >= 2);
    });

    it('GET /api/lending filters by type', async () => {
      await agent().post('/api/lending').send({ person_name: 'A', type: 'lent', amount: 1000, outstanding: 1000, currency: 'INR', start_date: today() });
      await agent().post('/api/lending').send({ person_name: 'B', type: 'borrowed', amount: 2000, outstanding: 2000, currency: 'INR', start_date: today() });
      const res = await agent().get('/api/lending?type=lent').expect(200);
      assert.ok(res.body.items.every(l => l.type === 'lent'));
    });

    it('PUT /api/lending/:id updates a lending entry', async () => {
      const { body } = await agent().post('/api/lending').send({ person_name: 'A', type: 'lent', amount: 1000, outstanding: 1000, currency: 'INR', start_date: today() });
      const res = await agent().put(`/api/lending/${body.item.id}`).send({ purpose: 'Updated purpose' }).expect(200);
      assert.equal(res.body.item.purpose, 'Updated purpose');
    });

    it('POST /api/lending/:id/payments records a payment', async () => {
      const { body } = await agent().post('/api/lending').send({ person_name: 'Z', type: 'lent', amount: 5000, outstanding: 5000, currency: 'INR', start_date: today() });
      const res = await agent().post(`/api/lending/${body.item.id}/payments`).send({
        amount: 2000,
        date: today(),
        notes: 'First payment',
      }).expect(201);
      assert.ok(res.body.payment);
      assert.equal(res.body.lending.outstanding, 3000);
    });

    it('auto-settles when outstanding reaches 0', async () => {
      const { body } = await agent().post('/api/lending').send({ person_name: 'Y', type: 'lent', amount: 1000, outstanding: 1000, currency: 'INR', start_date: today() });
      const res = await agent().post(`/api/lending/${body.item.id}/payments`).send({ amount: 1000, date: today() }).expect(201);
      assert.equal(res.body.lending.outstanding, 0);
      assert.equal(res.body.lending.is_settled, 1);
    });

    it('rejects payment exceeding outstanding', async () => {
      const { body } = await agent().post('/api/lending').send({ person_name: 'X', type: 'lent', amount: 1000, outstanding: 1000, currency: 'INR', start_date: today() });
      await agent().post(`/api/lending/${body.item.id}/payments`).send({ amount: 2000, date: today() }).expect(400);
    });

    it('GET /api/lending/summary returns aggregates', async () => {
      await agent().post('/api/lending').send({ person_name: 'A', type: 'lent', amount: 5000, outstanding: 5000, currency: 'INR', start_date: today() });
      await agent().post('/api/lending').send({ person_name: 'B', type: 'borrowed', amount: 3000, outstanding: 3000, currency: 'INR', start_date: today() });
      const res = await agent().get('/api/lending/summary').expect(200);
      assert.ok(res.body.summary);
      assert.ok(res.body.summary.total_lent_outstanding >= 5000);
      assert.ok(res.body.summary.total_borrowed_outstanding >= 3000);
    });

    it('DELETE /api/lending/:id removes entry', async () => {
      const { body } = await agent().post('/api/lending').send({ person_name: 'Del', type: 'lent', amount: 100, outstanding: 100, currency: 'INR', start_date: today() });
      const res = await agent().delete(`/api/lending/${body.item.id}`).expect(200);
      assert.ok(res.body.ok);
    });

    it('returns 404 for unknown lending entry', async () => {
      await agent().put('/api/lending/99999').send({ purpose: 'X' }).expect(404);
    });
  });

  // ─── Account Enrichment ────────────────────────────────

  describe('Account Enrichment', () => {
    it('creates an account with loan fields', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'Home Loan',
        type: 'loan',
        currency: 'INR',
        balance: -2000000,
        interest_rate: 8.5,
        loan_amount: 3000000,
        tenure_months: 240,
        emi_amount: 26047,
        emi_day: 5,
        start_date: '2023-01-01',
        maturity_date: '2043-01-01',
        priority: 'high',
        account_notes: 'SBI home loan',
      }).expect(201);
      assert.equal(res.body.account.name, 'Home Loan');
      assert.equal(res.body.account.interest_rate, 8.5);
      assert.equal(res.body.account.loan_amount, 3000000);
      assert.equal(res.body.account.emi_amount, 26047);
      assert.equal(res.body.account.priority, 'high');
    });

    it('creates an account with investment fields', async () => {
      const res = await agent().post('/api/accounts').send({
        name: 'PPF',
        type: 'investment',
        currency: 'INR',
        balance: 500000,
        interest_rate: 7.1,
        expected_return: 7.1,
        investment_type: 'ppf',
        maturity_date: '2038-12-31',
      }).expect(201);
      assert.equal(res.body.account.expected_return, 7.1);
      assert.equal(res.body.account.investment_type, 'ppf');
    });

    it('updates enrichment fields via PUT', async () => {
      const { body: { account } } = await agent().post('/api/accounts').send({ name: 'Card', type: 'credit_card', currency: 'INR', balance: 0 }).expect(201);
      const res = await agent().put(`/api/accounts/${account.id}`).send({ credit_limit: 200000 }).expect(200);
      assert.equal(res.body.account.credit_limit, 200000);
    });
  });

  // ─── Category Nature ───────────────────────────────────

  describe('Category Nature', () => {
    it('creates a category with nature field', async () => {
      const res = await agent().post('/api/categories').send({
        name: 'Groceries',
        type: 'expense',
        icon: '🛒',
        color: '#22C55E',
        nature: 'need',
      }).expect(201);
      assert.equal(res.body.category.nature, 'need');
    });

    it('rejects invalid nature value', async () => {
      await agent().post('/api/categories').send({
        name: 'Bad',
        type: 'expense',
        icon: '❌',
        color: '#FF0000',
        nature: 'invalid',
      }).expect(400);
    });

    it('allows null nature (backward compatible)', async () => {
      const res = await agent().post('/api/categories').send({
        name: 'No Nature',
        type: 'expense',
        icon: '🔘',
        color: '#999999',
      }).expect(201);
      assert.equal(res.body.category.nature, null);
    });

    it('updates nature via PUT', async () => {
      const { body: { category } } = await agent().post('/api/categories').send({ name: 'Fun', type: 'expense', icon: '🎮', color: '#0000FF' }).expect(201);
      const res = await agent().put(`/api/categories/${category.id}`).send({ nature: 'want' }).expect(200);
      assert.equal(res.body.category.nature, 'want');
    });
  });

  // ─── Transaction Payment Mode ──────────────────────────

  describe('Transaction Payment Mode', () => {
    it('creates a transaction with payment_mode', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 500,
        currency: 'INR',
        description: 'Coffee',
        date: today(),
        payment_mode: 'upi',
      }).expect(201);
      assert.equal(res.body.transaction.payment_mode, 'upi');
    });

    it('rejects invalid payment_mode', async () => {
      const acct = makeAccount();
      await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 100,
        currency: 'INR',
        description: 'Bad',
        date: today(),
        payment_mode: 'bitcoin',
      }).expect(400);
    });

    it('allows null payment_mode (backward compatible)', async () => {
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 200,
        currency: 'INR',
        description: 'No mode',
        date: today(),
      }).expect(201);
      assert.equal(res.body.transaction.payment_mode, null);
    });
  });

  // ─── Settings Expansion ────────────────────────────────

  describe('Expanded Settings', () => {
    it('saves and reads ratio threshold settings', async () => {
      await agent().put('/api/settings').send({ key: 'max_needs_ratio', value: '0.35' }).expect(200);
      const res = await agent().get('/api/settings').expect(200);
      assert.equal(res.body.settings.max_needs_ratio, '0.35');
    });

    it('saves notification preference', async () => {
      await agent().put('/api/settings').send({ key: 'notify_budget_overspend', value: 'false' }).expect(200);
      const res = await agent().get('/api/settings').expect(200);
      assert.equal(res.body.settings.notify_budget_overspend, 'false');
    });

    it('saves monthly_income setting', async () => {
      await agent().put('/api/settings').send({ key: 'monthly_income', value: '75000' }).expect(200);
      const res = await agent().get('/api/settings').expect(200);
      assert.equal(res.body.settings.monthly_income, '75000');
    });

    it('rejects unknown setting key', async () => {
      await agent().put('/api/settings').send({ key: 'hacker_key', value: 'evil' }).expect(400);
    });

    for (const key of ['max_emi_ratio', 'min_savings_ratio', 'min_investment_ratio', 'max_wants_ratio', 'emergency_fund_months_target', 'saving_fund_months_target', 'sip_months_target']) {
      it(`accepts new key: ${key}`, async () => {
        await agent().put('/api/settings').send({ key, value: '0.5' }).expect(200);
      });
    }

    for (const key of ['notify_goal_completed', 'notify_bill_upcoming', 'notify_large_transaction', 'notify_spending_warning', 'notify_unusual_spending', 'notify_inactivity_nudge', 'notify_monthly_digest', 'notify_milestone', 'notify_financial_tip', 'notify_new_ip_login', 'notify_split_reminder']) {
      it(`accepts notification key: ${key}`, async () => {
        await agent().put('/api/settings').send({ key, value: 'true' }).expect(200);
      });
    }
  });

  // ─── New Stats Endpoints ───────────────────────────────

  describe('New Stats Endpoints', () => {
    it('GET /api/stats/age-of-money returns age data', async () => {
      const acct = makeAccount({ balance: 100000 });
      makeTransaction(acct.id, { type: 'expense', amount: 1000, date: today() });
      const res = await agent().get('/api/stats/age-of-money').expect(200);
      assert.ok(typeof res.body.age_of_money_days === 'number' || res.body.age_of_money_days === null);
    });

    it('GET /api/stats/expected-net-worth returns classification', async () => {
      const acct = makeAccount({ balance: 500000 });
      makeTransaction(acct.id, { type: 'income', amount: 100000, date: today() });
      const res = await agent().get('/api/stats/expected-net-worth?age=30').expect(200);
      assert.ok(res.body.classification);
      assert.ok(['PAW', 'AAW', 'UAW'].includes(res.body.classification));
    });

    it('GET /api/stats/credit-utilization returns utilization data', async () => {
      const acct = makeAccount({ type: 'credit_card', balance: -5000, name: 'HDFC CC' });
      db.prepare('UPDATE accounts SET credit_limit = ? WHERE id = ?').run(100000, acct.id);
      const res = await agent().get('/api/stats/credit-utilization').expect(200);
      assert.ok(Array.isArray(res.body.cards));
      assert.ok(typeof res.body.overall_utilization === 'number' || res.body.overall_utilization === null);
    });

    it('GET /api/stats/weekly-summary returns weekly data', async () => {
      const acct = makeAccount();
      makeTransaction(acct.id, { type: 'expense', amount: 500, date: today() });
      const res = await agent().get('/api/stats/weekly-summary').expect(200);
      assert.ok(Array.isArray(res.body.weeks));
    });

    it('GET /api/stats/net-worth-projection returns projection', async () => {
      makeAccount({ balance: 100000 });
      const res = await agent().get('/api/stats/net-worth-projection?years=5&growth_rate=7').expect(200);
      assert.ok(Array.isArray(res.body.projection));
    });

    it('GET /api/stats/fire-progress returns FIRE data', async () => {
      makeAccount({ balance: 1000000, type: 'savings' });
      const res = await agent().get('/api/stats/fire-progress?annual_expense=600000').expect(200);
      assert.ok(typeof res.body.fire_number === 'number');
      assert.ok(typeof res.body.progress_percent === 'number');
    });

    it('GET /api/stats/debt-freedom-date with no debt returns debt_free', async () => {
      const res = await agent().get('/api/stats/debt-freedom-date').expect(200);
      assert.equal(res.body.debt_free, true);
    });

    it('GET /api/stats/debt-freedom-date with debt returns projections', async () => {
      const acct = makeAccount({ type: 'loan', balance: -500000, name: 'Car Loan' });
      db.prepare('UPDATE accounts SET interest_rate = ?, emi_amount = ? WHERE id = ?').run(10, 10000, acct.id);
      const res = await agent().get('/api/stats/debt-freedom-date').expect(200);
      assert.equal(res.body.debt_free, false);
      assert.ok(Array.isArray(res.body.projections));
      assert.ok(res.body.total_debt > 0);
    });

    it('GET /api/stats/financial-health-detailed requires monthly_income', async () => {
      const res = await agent().get('/api/stats/financial-health-detailed').expect(400);
      assert.ok(res.body.error);
    });

    it('GET /api/stats/financial-health-detailed returns scores when income set', async () => {
      makeAccount({ balance: 100000 });
      await agent().put('/api/settings').send({ key: 'monthly_income', value: '100000' });
      const res = await agent().get('/api/stats/financial-health-detailed').expect(200);
      assert.ok(typeof res.body.investment_score === 'number');
      assert.ok(typeof res.body.expenditure_score === 'number');
      assert.ok(typeof res.body.funds_score === 'number');
      assert.ok(typeof res.body.overall === 'number');
    });

    it('GET /api/stats/health-score-history returns scores array', async () => {
      const res = await agent().get('/api/stats/health-score-history').expect(200);
      assert.ok(Array.isArray(res.body.scores));
    });

    it('GET /api/stats/payment-queue returns queue', async () => {
      const res = await agent().get('/api/stats/payment-queue').expect(200);
      assert.ok(Array.isArray(res.body.queue));
      assert.ok(typeof res.body.total === 'number');
    });
  });

  // ─── Enhanced Health Scoring ───────────────────────────

  describe('Enhanced Health Scoring', () => {
    it('calculateDetailedScore returns 3-axis scores', () => {
      const createHealthService = require('../src/services/health.service');
      const healthService = createHealthService();
      const result = healthService.calculateDetailedScore({
        salary: 100000,
        extraIncome: 10000,
        fixedExpenses: 30000,
        variableExpenses: 10000,
        emiTotal: 20000,
        monthlySavings: 20000,
        monthlyInvestments: 15000,
        emergencyFund: 600000,
        savingFund: 300000,
        sipTotal: 1200000,
      });
      assert.ok(typeof result.investment_score === 'number');
      assert.ok(typeof result.expenditure_score === 'number');
      assert.ok(typeof result.funds_score === 'number');
      assert.ok(typeof result.overall === 'number');
    });

    it('calculateBudgetAdherence returns percentage', () => {
      const createHealthService = require('../src/services/health.service');
      const healthService = createHealthService();
      const result = healthService.calculateBudgetAdherence([
        { allocated: 1000, spent: 800 },
        { allocated: 500, spent: 600 },
        { allocated: 2000, spent: 1500 },
      ]);
      // 2 out of 3 are within budget = 66.67%
      assert.ok(result >= 60 && result <= 70);
    });

    it('calculateAgeOfMoney returns days', () => {
      const createHealthService = require('../src/services/health.service');
      const healthService = createHealthService();
      const result = healthService.calculateAgeOfMoney({ avgBalance: 100000, avgDailyExpense: 3000 });
      assert.ok(result > 30 && result < 40);
    });

    it('calculateExpectedNetWorth returns classification', () => {
      const createHealthService = require('../src/services/health.service');
      const healthService = createHealthService();
      const result = healthService.calculateExpectedNetWorth({
        age: 30,
        annualIncome: 1200000,
        actualNetWorth: 5000000,
      });
      assert.ok(['PAW', 'AAW', 'UAW'].includes(result.classification));
      assert.ok(typeof result.expected_net_worth === 'number');
    });

    it('getUserThresholds merges defaults with overrides', () => {
      const createHealthService = require('../src/services/health.service');
      const healthService = createHealthService();
      const result = healthService.getUserThresholds({ max_needs_ratio: '0.35' });
      assert.equal(result.max_needs_ratio, 0.35);
      assert.equal(result.max_emi_ratio, 0.3);
    });
  });

  // ─── Migration Integrity ──────────────────────────────

  describe('Migration Integrity', () => {
    it('categories table has nature column', () => {
      const cols = db.prepare("PRAGMA table_info(categories)").all().map(c => c.name);
      assert.ok(cols.includes('nature'));
    });

    it('transactions table has payment_mode column', () => {
      const cols = db.prepare("PRAGMA table_info(transactions)").all().map(c => c.name);
      assert.ok(cols.includes('payment_mode'));
    });

    it('accounts table has enrichment columns', () => {
      const cols = db.prepare("PRAGMA table_info(accounts)").all().map(c => c.name);
      for (const col of ['interest_rate', 'credit_limit', 'loan_amount', 'tenure_months', 'emi_amount', 'emi_day', 'start_date', 'maturity_date', 'priority', 'account_notes', 'expected_return', 'investment_type']) {
        assert.ok(cols.includes(col), `Missing column: ${col}`);
      }
    });

    it('financial_todos table exists', () => {
      const cols = db.prepare("PRAGMA table_info(financial_todos)").all().map(c => c.name);
      assert.ok(cols.includes('title'));
      assert.ok(cols.includes('priority'));
      assert.ok(cols.includes('status'));
    });

    it('personal_lending table exists', () => {
      const cols = db.prepare("PRAGMA table_info(personal_lending)").all().map(c => c.name);
      assert.ok(cols.includes('person_name'));
      assert.ok(cols.includes('type'));
      assert.ok(cols.includes('outstanding'));
    });

    it('lending_payments table exists', () => {
      const cols = db.prepare("PRAGMA table_info(lending_payments)").all().map(c => c.name);
      assert.ok(cols.includes('lending_id'));
      assert.ok(cols.includes('amount'));
    });
  });
});
