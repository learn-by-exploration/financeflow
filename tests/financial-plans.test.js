// tests/financial-plans.test.js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, agent, makePlan, makeAccount, makeCategory, makeTransaction, makeGoal, today, daysFromNow } = require('./helpers');

describe('Financial Plans API', () => {
  let app;
  beforeEach(() => {
    ({ app } = setup());
    cleanDb();
  });

  // Helper: seed some financial data for snapshot
  function seedFinancialData() {
    const { db } = setup();
    const acc = makeAccount({ name: 'Savings', type: 'savings', balance: 200000 });
    const cat = makeCategory({ name: 'Food', type: 'expense' });
    const incomeCat = makeCategory({ name: 'Salary', type: 'income' });
    // Create income/expense transactions over last 3 months
    for (let m = 0; m < 3; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const date = d.toISOString().slice(0, 10);
      makeTransaction(acc.id, { type: 'income', amount: 80000, category_id: incomeCat.id, date, description: 'Salary' });
      makeTransaction(acc.id, { type: 'expense', amount: 30000, category_id: cat.id, date, description: 'Groceries' });
    }
    return { acc, cat, incomeCat };
  }

  // ─── Templates ───
  describe('GET /api/plans/templates', () => {
    it('returns all plan templates', async () => {
      const res = await agent(app).get('/api/plans/templates');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.templates));
      assert.ok(res.body.templates.length >= 10);
      const names = res.body.templates.map(t => t.id);
      assert.ok(names.includes('home_purchase'));
      assert.ok(names.includes('retirement'));
      assert.ok(names.includes('emergency_fund'));
      assert.ok(names.includes('custom'));
    });

    it('returns template details', async () => {
      const res = await agent(app).get('/api/plans/templates/home_purchase');
      assert.equal(res.status, 200);
      assert.equal(res.body.template.id, 'home_purchase');
      assert.ok(res.body.template.components.length >= 3);
      assert.ok(res.body.template.tips.length >= 1);
    });

    it('returns 404 for invalid template', async () => {
      const res = await agent(app).get('/api/plans/templates/nonexistent');
      assert.equal(res.status, 404);
    });
  });

  // ─── Financial Snapshot ───
  describe('GET /api/plans/snapshot', () => {
    it('returns snapshot with zero data', async () => {
      const res = await agent(app).get('/api/plans/snapshot');
      assert.equal(res.status, 200);
      assert.ok('avgMonthlyIncome' in res.body.snapshot);
      assert.ok('avgMonthlyExpense' in res.body.snapshot);
      assert.ok('disposableIncome' in res.body.snapshot);
      assert.ok('netWorth' in res.body.snapshot);
    });

    it('reflects actual transaction data', async () => {
      seedFinancialData();
      const res = await agent(app).get('/api/plans/snapshot');
      assert.equal(res.status, 200);
      assert.ok(res.body.snapshot.avgMonthlyIncome > 0);
      assert.ok(res.body.snapshot.avgMonthlyExpense > 0);
    });
  });

  // ─── EMI Calculator ───
  describe('POST /api/plans/emi', () => {
    it('calculates EMI correctly', async () => {
      makeAccount(); // need account for affordability
      const res = await agent(app).post('/api/plans/emi').send({
        principal: 5000000,
        annual_rate: 8.5,
        tenure_months: 240,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.emi > 0);
      assert.ok(res.body.total_payment > 5000000);
      assert.ok(res.body.total_interest > 0);
      assert.ok('affordable' in res.body.affordability);
      assert.ok('risk_level' in res.body.affordability);
    });

    it('validates required fields', async () => {
      const res = await agent(app).post('/api/plans/emi').send({});
      assert.equal(res.status, 400);
    });

    it('handles zero interest rate', async () => {
      makeAccount();
      const res = await agent(app).post('/api/plans/emi').send({
        principal: 100000,
        annual_rate: 0,
        tenure_months: 12,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.emi, Math.round(100000 / 12));
    });
  });

  // ─── Cash Flow Simulation ───
  describe('POST /api/plans/simulate', () => {
    it('simulates cash flow', async () => {
      const res = await agent(app).post('/api/plans/simulate').send({
        monthly_savings: 10000,
        months: 12,
        annual_return_rate: 0.08,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.total_saved > 120000); // compound interest
      assert.ok(res.body.total_contributed === 120000);
      assert.ok(res.body.total_interest > 0);
      assert.ok(res.body.inflation_adjusted > 0);
      assert.ok(Array.isArray(res.body.trajectory));
    });

    it('validates monthly_savings', async () => {
      const res = await agent(app).post('/api/plans/simulate').send({ months: 12 });
      assert.equal(res.status, 400);
    });

    it('validates months', async () => {
      const res = await agent(app).post('/api/plans/simulate').send({ monthly_savings: 1000 });
      assert.equal(res.status, 400);
    });

    it('rejects out-of-range months', async () => {
      const res = await agent(app).post('/api/plans/simulate').send({
        monthly_savings: 1000,
        months: 700,
      });
      assert.equal(res.status, 400);
    });

    it('truncates long trajectory', async () => {
      const res = await agent(app).post('/api/plans/simulate').send({
        monthly_savings: 10000,
        months: 60,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.trajectory.length <= 24);
      assert.equal(res.body.total_months, 60);
    });
  });

  // ─── Plan CRUD ───
  describe('POST /api/plans (create)', () => {
    it('creates a plan with full plan generation', async () => {
      seedFinancialData();
      const res = await agent(app).post('/api/plans').send({
        name: 'Emergency Fund',
        goal_type: 'emergency_fund',
        target_amount: 300000,
        target_date: daysFromNow(365),
        risk_tolerance: 'moderate',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.plan);
      assert.equal(res.body.plan.name, 'Emergency Fund');
      assert.equal(res.body.plan.goal_type, 'emergency_fund');
      assert.equal(res.body.plan.target_amount, 300000);
      assert.equal(res.body.plan.status, 'active');
      assert.ok(Array.isArray(res.body.scenarios));
      assert.ok(res.body.scenarios.length >= 3);
      assert.ok(Array.isArray(res.body.milestones));
      assert.ok(res.body.milestones.length >= 3);
      assert.ok(res.body.narrative);
      assert.ok(typeof res.body.narrative === 'string');
      assert.ok(res.body.narrative.length > 50);
    });

    it('creates a home purchase plan with EMI analysis', async () => {
      seedFinancialData();
      const res = await agent(app).post('/api/plans').send({
        name: 'Dream Home',
        goal_type: 'home_purchase',
        target_amount: 5000000,
        target_date: daysFromNow(1825),
        risk_tolerance: 'moderate',
      });
      assert.equal(res.status, 201);
      const planData = JSON.parse(res.body.plan.plan_data);
      assert.ok(planData.emiAnalysis);
      assert.ok(planData.emiAnalysis.emi > 0);
      assert.ok(planData.taxSuggestions.length > 0);
    });

    it('validates required fields', async () => {
      const res = await agent(app).post('/api/plans').send({});
      assert.equal(res.status, 400);
    });

    it('rejects invalid goal_type', async () => {
      const res = await agent(app).post('/api/plans').send({
        name: 'Test', goal_type: 'invalid_type', target_amount: 1000,
      });
      assert.equal(res.status, 400);
    });

    it('rejects negative target_amount', async () => {
      const res = await agent(app).post('/api/plans').send({
        name: 'Test', goal_type: 'custom', target_amount: -100,
      });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/plans', () => {
    it('lists plans', async () => {
      makePlan({ name: 'Plan A' });
      makePlan({ name: 'Plan B' });
      const res = await agent(app).get('/api/plans');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 2);
      assert.equal(res.body.plans.length, 2);
    });

    it('filters by status', async () => {
      makePlan({ name: 'Active', status: 'active' });
      makePlan({ name: 'Paused', status: 'paused' });
      const res = await agent(app).get('/api/plans?status=active');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.plans[0].name, 'Active');
    });

    it('filters by goal_type', async () => {
      makePlan({ name: 'Home', goal_type: 'home_purchase' });
      makePlan({ name: 'Emergency', goal_type: 'emergency_fund' });
      const res = await agent(app).get('/api/plans?goal_type=home_purchase');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
    });
  });

  describe('GET /api/plans/:id', () => {
    it('returns plan with scenarios and milestones', async () => {
      const plan = makePlan();
      // Add some scenarios
      const { db } = setup();
      db.prepare(`INSERT INTO plan_scenarios (plan_id, scenario_type, monthly_savings, duration_months, total_saved, total_interest, inflation_adjusted_target, assumptions, action_items)
        VALUES (?, 'moderate', 25000, 12, 300000, 10000, 318000, '{}', '[]')`).run(plan.id);
      db.prepare(`INSERT INTO plan_milestones (plan_id, title, target_amount, target_date, is_completed, position)
        VALUES (?, '25% Done', 75000, ?, 0, 0)`).run(plan.id, daysFromNow(90));

      const res = await agent(app).get(`/api/plans/${plan.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.plan.id, plan.id);
      assert.ok(Array.isArray(res.body.scenarios));
      assert.ok(Array.isArray(res.body.milestones));
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).get('/api/plans/99999');
      assert.equal(res.status, 404);
    });
  });

  describe('PUT /api/plans/:id', () => {
    it('updates plan fields', async () => {
      const plan = makePlan();
      const res = await agent(app).put(`/api/plans/${plan.id}`).send({
        name: 'Updated Plan',
        status: 'paused',
        current_saved: 50000,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.plan.name, 'Updated Plan');
      assert.equal(res.body.plan.status, 'paused');
      assert.equal(res.body.plan.current_saved, 50000);
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).put('/api/plans/99999').send({ name: 'Nope' });
      assert.equal(res.status, 404);
    });

    it('validates update fields', async () => {
      const plan = makePlan();
      const res = await agent(app).put(`/api/plans/${plan.id}`).send({
        status: 'invalid_status',
      });
      assert.equal(res.status, 400);
    });
  });

  describe('DELETE /api/plans/:id', () => {
    it('deletes a plan', async () => {
      const plan = makePlan();
      const res = await agent(app).delete(`/api/plans/${plan.id}`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });

      const check = await agent(app).get(`/api/plans/${plan.id}`);
      assert.equal(check.status, 404);
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).delete('/api/plans/99999');
      assert.equal(res.status, 404);
    });
  });

  // ─── What-If Simulator ───
  describe('POST /api/plans/:id/what-if', () => {
    it('runs what-if simulation', async () => {
      seedFinancialData();
      const plan = makePlan({ target_amount: 300000, target_date: daysFromNow(365) });
      const res = await agent(app).post(`/api/plans/${plan.id}/what-if`).send({
        adjustments: {
          income_change: 10000,
          expense_cut: 5000,
        },
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.adjustments);
      assert.ok(res.body.scenarios);
    });

    it('handles lump_sum adjustment', async () => {
      seedFinancialData();
      const plan = makePlan({ target_amount: 300000, target_date: daysFromNow(365), current_saved: 50000 });
      const res = await agent(app).post(`/api/plans/${plan.id}/what-if`).send({
        adjustments: { lump_sum: 100000 },
      });
      assert.equal(res.status, 200);
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).post('/api/plans/99999/what-if').send({
        adjustments: { income_change: 5000 },
      });
      assert.equal(res.status, 404);
    });
  });

  // ─── Progress Tracking ───
  describe('GET /api/plans/:id/progress', () => {
    it('returns progress details', async () => {
      const plan = makePlan({ target_amount: 300000, current_saved: 100000, target_date: daysFromNow(365) });
      const res = await agent(app).get(`/api/plans/${plan.id}/progress`);
      assert.equal(res.status, 200);
      assert.ok('progress_pct' in res.body);
      assert.ok('time_progress_pct' in res.body);
      assert.ok(['ahead', 'on_track', 'behind'].includes(res.body.status));
      assert.equal(res.body.remaining, 200000);
    });

    it('links to savings goal progress', async () => {
      const goal = makeGoal({ target_amount: 300000, current_amount: 150000 });
      const plan = makePlan({ target_amount: 300000 });
      // Link the plan to the goal
      const { db } = setup();
      db.prepare('UPDATE financial_plans SET linked_goal_id = ? WHERE id = ?').run(goal.id, plan.id);

      const res = await agent(app).get(`/api/plans/${plan.id}/progress`);
      assert.equal(res.status, 200);
      assert.ok(res.body.goalProgress);
      assert.equal(res.body.goalProgress.progress_pct, 50);
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).get('/api/plans/99999/progress');
      assert.equal(res.status, 404);
    });
  });

  // ─── Replan ───
  describe('POST /api/plans/:id/replan', () => {
    it('regenerates plan with current data', async () => {
      seedFinancialData();
      const plan = makePlan({ target_amount: 300000, target_date: daysFromNow(365) });
      const res = await agent(app).post(`/api/plans/${plan.id}/replan`);
      assert.equal(res.status, 200);
      assert.ok(res.body.plan);
      assert.ok(res.body.scenarios.length >= 3);
      assert.ok(res.body.milestones.length >= 3);
      assert.ok(res.body.narrative);
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).post('/api/plans/99999/replan');
      assert.equal(res.status, 404);
    });
  });

  // ─── Chat (Template Mode) ───
  describe('POST /api/plans/:id/chat', () => {
    it('responds to affordability questions', async () => {
      seedFinancialData();
      const plan = makePlan({
        target_amount: 300000,
        plan_data: JSON.stringify({
          snapshot: { disposableIncome: 50000, avgMonthlyIncome: 80000, avgMonthlyExpense: 30000 },
          taxSuggestions: [],
        }),
      });
      // Add a scenario
      const { db } = setup();
      db.prepare(`INSERT INTO plan_scenarios (plan_id, scenario_type, monthly_savings, duration_months, total_saved, total_interest, inflation_adjusted_target, assumptions, action_items)
        VALUES (?, 'moderate', 25000, 12, 300000, 10000, 318000, '{"return_rate": 0.08, "feasible": true}', '[]')`).run(plan.id);

      const res = await agent(app).post(`/api/plans/${plan.id}/chat`).send({
        message: 'Can I afford this?',
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.response);
      assert.equal(res.body.provider, 'template');
    });

    it('responds to tax questions', async () => {
      const plan = makePlan({
        goal_type: 'home_purchase',
        target_amount: 5000000,
        plan_data: JSON.stringify({
          snapshot: { disposableIncome: 50000 },
          taxSuggestions: [{ section: '80C', benefit: 'Test benefit', tax_saved: 45000 }],
        }),
      });
      const { db } = setup();
      db.prepare(`INSERT INTO plan_scenarios (plan_id, scenario_type, monthly_savings, duration_months, total_saved, total_interest, inflation_adjusted_target, assumptions, action_items)
        VALUES (?, 'moderate', 50000, 60, 5000000, 500000, 5500000, '{"return_rate": 0.08}', '[]')`).run(plan.id);

      const res = await agent(app).post(`/api/plans/${plan.id}/chat`).send({
        message: 'Tell me about tax benefits under 80C',
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.response.includes('80C') || res.body.response.includes('Tax'));
    });

    it('validates message is required', async () => {
      const plan = makePlan();
      const res = await agent(app).post(`/api/plans/${plan.id}/chat`).send({});
      assert.equal(res.status, 400);
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).post('/api/plans/99999/chat').send({ message: 'Hello' });
      assert.equal(res.status, 404);
    });
  });

  // ─── AI Log ───
  describe('GET /api/plans/:id/ai-log', () => {
    it('returns AI interaction history', async () => {
      const plan = makePlan();
      const { db } = setup();
      db.prepare(`INSERT INTO plan_ai_log (plan_id, user_id, interaction_type, user_input, ai_output, provider, model, tokens_used)
        VALUES (?, 1, 'create', NULL, 'test narrative', 'template', 'template-v1', 0)`)
        .run(plan.id);

      const res = await agent(app).get(`/api/plans/${plan.id}/ai-log`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.log));
      assert.equal(res.body.log.length, 1);
      assert.equal(res.body.log[0].interaction_type, 'create');
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).get('/api/plans/99999/ai-log');
      assert.equal(res.status, 404);
    });
  });

  // ─── Tax Suggestions ───
  describe('GET /api/plans/:id/tax-suggestions', () => {
    it('returns tax suggestions for home_purchase', async () => {
      seedFinancialData();
      const plan = makePlan({ goal_type: 'home_purchase', target_amount: 5000000 });
      const res = await agent(app).get(`/api/plans/${plan.id}/tax-suggestions`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.suggestions));
      assert.ok(res.body.suggestions.length >= 2);
      const sections = res.body.suggestions.map(s => s.section);
      assert.ok(sections.some(s => s.includes('80C') || s.includes('24')));
    });

    it('returns tax suggestions for retirement', async () => {
      seedFinancialData();
      const plan = makePlan({ goal_type: 'retirement', target_amount: 10000000 });
      const res = await agent(app).get(`/api/plans/${plan.id}/tax-suggestions`);
      assert.equal(res.status, 200);
      const sections = res.body.suggestions.map(s => s.section);
      assert.ok(sections.some(s => s.includes('80CCD') || s.includes('NPS')));
    });

    it('returns 404 for unknown plan', async () => {
      const res = await agent(app).get('/api/plans/99999/tax-suggestions');
      assert.equal(res.status, 404);
    });
  });

  // ─── Security: Plans are user-scoped ───
  describe('User isolation', () => {
    it('cannot access another user\u2019s plan', async () => {
      const plan = makePlan({ name: 'Secret Plan' });
      // Create second user and try to access
      const { db } = setup();
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const hash = bcrypt.hashSync('password2', 4);
      const u2 = db.prepare("INSERT INTO users (username, password_hash, display_name, default_currency) VALUES ('user2plan', ?, 'User 2', 'INR')").run(hash);
      const token2 = 'test-plan-' + crypto.randomUUID();
      const tokenHash = crypto.createHash('sha256').update(token2).digest('hex');
      const expires = new Date(Date.now() + 86400000).toISOString();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at, last_used_at) VALUES (?, ?, ?, ?)').run(u2.lastInsertRowid, tokenHash, expires, now);

      const request = require('supertest');
      const res = await request(app)
        .get(`/api/plans/${plan.id}`)
        .set('X-Session-Token', token2);
      assert.equal(res.status, 404);
    });
  });

  // ─── Planning Engine Unit Tests ───
  describe('Planning Engine', () => {
    it('generates milestones for different durations', () => {
      const { db } = setup();
      const engine = require('../src/services/planning-engine.service')({ db });

      const short = engine.generateMilestones(100000, 3);
      assert.ok(short.length >= 4);

      const medium = engine.generateMilestones(100000, 9);
      assert.ok(medium.length >= 5);

      const long = engine.generateMilestones(1000000, 24);
      assert.ok(long.length >= 6);
    });

    it('calculates EMI matching known formula', () => {
      const { db } = setup();
      const engine = require('../src/services/planning-engine.service')({ db });
      // Known: 10L at 8.5% for 20 years ≈ ₹8,678
      const emi = engine.calculateEMI({ principal: 1000000, annualRate: 8.5, tenureMonths: 240 });
      assert.ok(emi >= 8600 && emi <= 8750, `EMI ${emi} not in expected range`);
    });

    it('simulates cash flow with compound interest', () => {
      const { db } = setup();
      const engine = require('../src/services/planning-engine.service')({ db });
      const result = engine.simulateCashFlow({
        monthlySavings: 10000,
        months: 12,
        annualReturnRate: 0.12,
        inflationRate: 0.06,
      });
      assert.ok(result.totalSaved > 120000);
      assert.ok(result.totalInterest > 0);
      assert.equal(result.totalContributed, 120000);
      assert.ok(result.inflationAdjusted > 0);
      assert.equal(result.trajectory.length, 12);
    });

    it('decomposes home_purchase into components', () => {
      const { db } = setup();
      const engine = require('../src/services/planning-engine.service')({ db });
      seedFinancialData();
      const plan = engine.generatePlan(1, {
        goalType: 'home_purchase',
        targetAmount: 5000000,
        targetDate: daysFromNow(1825),
        riskTolerance: 'moderate',
      });
      assert.ok(plan.components.length >= 4);
      const totalPct = plan.components.reduce((s, c) => s + c.pct, 0);
      assert.ok(Math.abs(totalPct - 0.36) < 0.01 || totalPct > 0.3); // home_purchase components
      assert.ok(plan.emiAnalysis);
      assert.ok(plan.taxSuggestions.length > 0);
    });

    it('generates scenarios with feasibility check', () => {
      const { db } = setup();
      const engine = require('../src/services/planning-engine.service')({ db });
      seedFinancialData();
      const snapshot = engine.getUserFinancialSnapshot(1);
      const scenarios = engine.generateScenarios({
        targetAmount: 300000,
        currentSaved: 0,
        targetDate: daysFromNow(365),
        snapshot,
      });
      assert.ok(scenarios.conservative);
      assert.ok(scenarios.moderate);
      assert.ok(scenarios.aggressive);
      assert.ok(typeof scenarios.moderate.feasible === 'boolean');
      assert.ok(scenarios.moderate.monthly_savings > 0);
    });
  });

  // ─── AI Provider Unit Tests ───
  describe('AI Provider (template mode)', () => {
    it('generates template narrative', () => {
      const ai = require('../src/services/ai-provider.service')();
      const narrative = ai.templateNarrative({
        name: 'Emergency Fund',
        goalType: 'emergency_fund',
        targetAmount: 300000,
        currentSaved: 50000,
        scenarios: {
          moderate: {
            label: 'Moderate',
            monthly_savings: 25000,
            duration_months: 12,
            assumed_return_rate: 0.08,
            total_saved: 300000,
            feasible: true,
            actions: [{ type: 'info', text: 'Save more' }],
          },
        },
        snapshot: {
          avgMonthlyIncome: 80000,
          avgMonthlyExpense: 30000,
          disposableIncome: 50000,
          netWorth: 200000,
        },
        milestones: [{ title: '25%', target_date: '2025-06-01' }],
        taxSuggestions: [],
        emiAnalysis: null,
        tips: ['Start small'],
        components: [{ name: 'Core Fund', amount: 300000, description: 'Full amount' }],
      });
      assert.ok(narrative.includes('Emergency Fund'));
      assert.ok(narrative.includes('Moderate'));
      assert.ok(narrative.includes('80,000') || narrative.includes('₹'));
    });

    it('builds LLM prompt with financial context', () => {
      const ai = require('../src/services/ai-provider.service')();
      const prompt = ai.buildPrompt({
        goalType: 'retirement',
        targetAmount: 10000000,
        snapshot: {
          avgMonthlyIncome: 100000,
          avgMonthlyExpense: 50000,
          disposableIncome: 50000,
          netWorth: 500000,
        },
        scenarios: { moderate: { monthly_savings: 30000, duration_months: 240 } },
      }, 'How should I invest?');
      assert.ok(prompt.includes('retirement'));
      assert.ok(prompt.includes('1,00,00,000') || prompt.includes('10000000'));
      assert.ok(prompt.includes('How should I invest?'));
      assert.ok(prompt.includes('80C')); // Indian tax context
    });

    it('template chat responds to common questions', () => {
      const ai = require('../src/services/ai-provider.service')();
      const chatData = {
        name: 'Home',
        goalType: 'home_purchase',
        targetAmount: 5000000,
        snapshot: { disposableIncome: 50000 },
        scenarios: {
          moderate: { monthly_savings: 30000, feasible: true, assumed_return_rate: 0.08, actions: [{ type: 'cut', text: 'Reduce dining by 25%' }] },
        },
        milestones: [{ title: '25%', target_date: '2026-01-01' }],
        taxSuggestions: [{ section: '80C', benefit: 'Deduction', tax_saved: 45000 }],
        emiAnalysis: { loan_amount: 4000000, interest_rate: 8.5, tenure_months: 240, emi: 34734, affordability: { risk_level: 'moderate' } },
      };

      const taxRes = ai.templateChatResponse(chatData, 'tax deductions');
      assert.ok(taxRes.includes('80C'));

      const emiRes = ai.templateChatResponse(chatData, 'what about the loan EMI');
      assert.ok(emiRes.includes('8.5') || emiRes.includes('EMI'));

      const cutRes = ai.templateChatResponse(chatData, 'how can I reduce spending');
      assert.ok(cutRes.includes('dining') || cutRes.includes('cut') || cutRes.includes('Reduce') || cutRes.includes('spending'));

      const milestoneRes = ai.templateChatResponse(chatData, 'my milestones');
      assert.ok(milestoneRes.includes('25%'));
    });
  });

  // ─── Edge Cases ───
  describe('Edge cases', () => {
    it('handles plan with no transactions (empty snapshot)', async () => {
      const res = await agent(app).post('/api/plans').send({
        name: 'First Plan',
        goal_type: 'emergency_fund',
        target_amount: 100000,
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.plan);
    });

    it('handles very large target amount', async () => {
      const res = await agent(app).post('/api/plans').send({
        name: 'Big Goal',
        goal_type: 'retirement',
        target_amount: 100000000,
        target_date: daysFromNow(7300),
        risk_tolerance: 'aggressive',
      });
      assert.equal(res.status, 201);
    });

    it('handles plan without target_date', async () => {
      const res = await agent(app).post('/api/plans').send({
        name: 'Open Ended',
        goal_type: 'custom',
        target_amount: 500000,
      });
      assert.equal(res.status, 201);
    });

    it('handles plan with linked goal', async () => {
      const goal = makeGoal({ target_amount: 300000 });
      const res = await agent(app).post('/api/plans').send({
        name: 'Linked Plan',
        goal_type: 'emergency_fund',
        target_amount: 300000,
        linked_goal_id: goal.id,
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.plan.linked_goal_id, goal.id);
    });

    it('handles all 10 goal types', async () => {
      const types = ['home_purchase', 'vehicle', 'wedding', 'education', 'retirement', 'emergency_fund', 'travel', 'business', 'debt_payoff', 'custom'];
      for (const gt of types) {
        const res = await agent(app).post('/api/plans').send({
          name: `Plan ${gt}`,
          goal_type: gt,
          target_amount: 100000,
        });
        assert.equal(res.status, 201, `Failed for goal_type: ${gt}`);
      }
    });
  });
});
