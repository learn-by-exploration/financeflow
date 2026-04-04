// src/routes/plans.js
const express = require('express');
const router = express.Router();
const { createPlanSchema, updatePlanSchema, whatIfSchema, emiSchema, chatSchema } = require('../schemas/plan.schema');
const createPlanRepository = require('../repositories/plan.repository');
const createPlanningEngine = require('../services/planning-engine.service');
const createAIProvider = require('../services/ai-provider.service');

module.exports = function createPlanRoutes({ db, audit }) {
  const planRepo = createPlanRepository({ db });
  const engine = createPlanningEngine({ db });
  const ai = createAIProvider();

  // Load per-user AI provider settings from settings table
  function getUserAISettings(userId) {
    const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ? AND key LIKE ?').all(userId, 'ai_%');
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    return s;
  }

  // GET /api/plans/templates — list available plan templates
  router.get('/templates', (_req, res) => {
    const templates = Object.entries(engine.PLAN_TEMPLATES).map(([key, t]) => ({
      id: key,
      name: t.name,
      icon: t.icon,
      components: t.components.length,
      tips_count: t.tips.length,
    }));
    res.json({ templates });
  });

  // GET /api/plans/templates/:type — get full template details
  router.get('/templates/:type', (req, res) => {
    const template = engine.PLAN_TEMPLATES[req.params.type];
    if (!template) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
    res.json({ template: { id: req.params.type, ...template } });
  });

  // GET /api/plans/snapshot — get user financial snapshot
  router.get('/snapshot', (req, res, next) => {
    try {
      const snapshot = engine.getUserFinancialSnapshot(req.user.id);
      res.json({ snapshot });
    } catch (err) { next(err); }
  });

  // POST /api/plans/emi — EMI calculator
  router.post('/emi', (req, res) => {
    const parsed = emiSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    }
    const { principal, annual_rate, tenure_months } = parsed.data;
    const emi = engine.calculateEMI({ principal, annualRate: annual_rate, tenureMonths: tenure_months });
    const totalPayment = emi * tenure_months;
    const affordability = engine.emiAffordability(req.user.id, emi);
    res.json({
      emi,
      total_payment: totalPayment,
      total_interest: totalPayment - principal,
      affordability,
    });
  });

  // POST /api/plans/simulate — cash flow simulation
  router.post('/simulate', (req, res) => {
    const { monthly_savings, months, annual_return_rate, inflation_rate } = req.body;
    if (!monthly_savings || !months) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'monthly_savings and months are required' } });
    }
    if (typeof monthly_savings !== 'number' || monthly_savings <= 0 || monthly_savings > 1e15) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'monthly_savings must be a positive number' } });
    }
    if (typeof months !== 'number' || months <= 0 || months > 600) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'months must be 1-600' } });
    }
    const sim = engine.simulateCashFlow({
      monthlySavings: monthly_savings,
      months,
      annualReturnRate: annual_return_rate || 0,
      inflationRate: inflation_rate || 0.06,
    });
    // Return only summary + first/last 12 trajectory points to avoid huge responses
    const trajectory = sim.trajectory.length <= 24
      ? sim.trajectory
      : [...sim.trajectory.slice(0, 12), ...sim.trajectory.slice(-12)];
    res.json({
      total_saved: sim.totalSaved,
      total_contributed: sim.totalContributed,
      total_interest: sim.totalInterest,
      inflation_adjusted: sim.inflationAdjusted,
      trajectory,
      total_months: sim.trajectory.length,
    });
  });

  // GET /api/plans — list user's plans
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, status, goal_type } = req.query;
      const filters = { limit, offset, status, goal_type };
      const plans = planRepo.findAllByUser(req.user.id, filters);
      const total = planRepo.countByUser(req.user.id, filters);
      res.json({ plans, total, limit: Number(limit), offset: Number(offset) });
    } catch (err) { next(err); }
  });

  // GET /api/plans/:id — get single plan with scenarios + milestones
  router.get('/:id', (req, res, next) => {
    try {
      const plan = planRepo.findById(req.params.id, req.user.id);
      if (!plan) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      const scenarios = planRepo.getScenarios(plan.id);
      const milestones = planRepo.getMilestones(plan.id);
      res.json({ plan, scenarios, milestones });
    } catch (err) { next(err); }
  });

  // POST /api/plans — create a new plan (generates scenarios, milestones, narrative)
  router.post('/', async (req, res, next) => {
    try {
      const parsed = createPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }

      const { name, goal_type, target_amount, target_date, risk_tolerance, constraints, linked_goal_id, notes } = parsed.data;

      // Generate the full plan
      const planResult = engine.generatePlan(req.user.id, {
        goalType: goal_type,
        targetAmount: target_amount,
        targetDate: target_date,
        riskTolerance: risk_tolerance,
        constraints,
      });

      const selectedScenario = planResult.scenarios[risk_tolerance] || planResult.selectedScenario;

      // Generate AI narrative
      const userAISettings = getUserAISettings(req.user.id);
      const narrativeResult = await ai.generateNarrative({
        name,
        goalType: goal_type,
        targetAmount: target_amount,
        currentSaved: 0,
        scenarios: planResult.scenarios,
        snapshot: planResult.snapshot,
        milestones: planResult.milestones,
        taxSuggestions: planResult.taxSuggestions,
        emiAnalysis: planResult.emiAnalysis,
        tips: planResult.tips,
        components: planResult.components,
      }, null, userAISettings);

      // Save plan
      const plan = planRepo.create(req.user.id, {
        name,
        goal_type,
        target_amount,
        target_date,
        current_saved: 0,
        status: 'active',
        selected_scenario: risk_tolerance,
        risk_tolerance,
        monthly_savings_target: selectedScenario?.monthly_savings || 0,
        constraints,
        plan_data: {
          components: planResult.components,
          taxSuggestions: planResult.taxSuggestions,
          emiAnalysis: planResult.emiAnalysis,
          tips: planResult.tips,
          snapshot: planResult.snapshot,
        },
        ai_narrative: narrativeResult.text,
        linked_goal_id,
        notes,
      });

      // Save scenarios
      planRepo.saveScenarios(plan.id, planResult.scenarios);

      // Save milestones
      planRepo.saveMilestones(plan.id, planResult.milestones);

      // Log AI interaction
      planRepo.logAIInteraction(plan.id, req.user.id, {
        interaction_type: 'create',
        ai_output: narrativeResult.text,
        provider: narrativeResult.provider,
        model: narrativeResult.model,
        tokens_used: narrativeResult.tokens_used,
      });

      audit.log(req.user.id, 'plan.create', 'financial_plan', plan.id);

      const scenarios = planRepo.getScenarios(plan.id);
      const milestones = planRepo.getMilestones(plan.id);

      res.status(201).json({ plan, scenarios, milestones, narrative: narrativeResult.text });
    } catch (err) { next(err); }
  });

  // PUT /api/plans/:id — update plan
  router.put('/:id', (req, res, next) => {
    try {
      const existing = planRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      const parsed = updatePlanSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const plan = planRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'plan.update', 'financial_plan', req.params.id);
      res.json({ plan });
    } catch (err) { next(err); }
  });

  // DELETE /api/plans/:id — delete plan + cascades
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = planRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      planRepo.deleteById(req.params.id, req.user.id);
      audit.log(req.user.id, 'plan.delete', 'financial_plan', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // POST /api/plans/:id/what-if — what-if scenario simulation
  router.post('/:id/what-if', (req, res, next) => {
    try {
      const existing = planRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      const parsed = whatIfSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });

      const result = engine.whatIf({
        planId: existing.id,
        userId: req.user.id,
        adjustments: parsed.data.adjustments,
      });

      // Log the what-if
      planRepo.logAIInteraction(existing.id, req.user.id, {
        interaction_type: 'what_if',
        user_input: JSON.stringify(parsed.data.adjustments),
        ai_output: JSON.stringify(result),
        provider: 'engine',
        model: 'what-if-v1',
      });

      res.json(result);
    } catch (err) { next(err); }
  });

  // GET /api/plans/:id/progress — detailed progress check
  router.get('/:id/progress', (req, res, next) => {
    try {
      const result = engine.checkPlanProgress(req.params.id, req.user.id);
      if (!result) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      res.json(result);
    } catch (err) { next(err); }
  });

  // POST /api/plans/:id/replan — regenerate plan with current data
  router.post('/:id/replan', async (req, res, next) => {
    try {
      const existing = planRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });

      const planResult = engine.generatePlan(req.user.id, {
        goalType: existing.goal_type,
        targetAmount: existing.target_amount,
        targetDate: existing.target_date,
        riskTolerance: existing.risk_tolerance,
        constraints: existing.constraints ? JSON.parse(existing.constraints) : null,
      });

      const selectedScenario = planResult.scenarios[existing.risk_tolerance] || planResult.selectedScenario;

      const userAISettings = getUserAISettings(req.user.id);
      const narrativeResult = await ai.generateNarrative({
        name: existing.name,
        goalType: existing.goal_type,
        targetAmount: existing.target_amount,
        currentSaved: existing.current_saved,
        scenarios: planResult.scenarios,
        snapshot: planResult.snapshot,
        milestones: planResult.milestones,
        taxSuggestions: planResult.taxSuggestions,
        emiAnalysis: planResult.emiAnalysis,
        tips: planResult.tips,
        components: planResult.components,
      }, null, userAISettings);

      // Update plan data
      planRepo.update(existing.id, req.user.id, {
        monthly_savings_target: selectedScenario?.monthly_savings || existing.monthly_savings_target,
        plan_data: {
          components: planResult.components,
          taxSuggestions: planResult.taxSuggestions,
          emiAnalysis: planResult.emiAnalysis,
          tips: planResult.tips,
          snapshot: planResult.snapshot,
        },
        ai_narrative: narrativeResult.text,
      });

      // Refresh scenarios and milestones
      planRepo.saveScenarios(existing.id, planResult.scenarios);
      planRepo.saveMilestones(existing.id, planResult.milestones);

      // Log
      planRepo.logAIInteraction(existing.id, req.user.id, {
        interaction_type: 'replan',
        ai_output: narrativeResult.text,
        provider: narrativeResult.provider,
        model: narrativeResult.model,
        tokens_used: narrativeResult.tokens_used,
      });

      audit.log(req.user.id, 'plan.replan', 'financial_plan', existing.id);

      const plan = planRepo.findById(existing.id, req.user.id);
      const scenarios = planRepo.getScenarios(existing.id);
      const milestones = planRepo.getMilestones(existing.id);

      res.json({ plan, scenarios, milestones, narrative: narrativeResult.text });
    } catch (err) { next(err); }
  });

  // POST /api/plans/:id/chat — conversational AI
  router.post('/:id/chat', async (req, res, next) => {
    try {
      const existing = planRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });

      const planData = existing.plan_data ? JSON.parse(existing.plan_data) : {};
      const scenarios = planRepo.getScenarios(existing.id);
      const scenarioMap = {};
      for (const s of scenarios) {
        scenarioMap[s.scenario_type] = {
          ...s,
          assumed_return_rate: JSON.parse(s.assumptions || '{}').return_rate,
          feasible: JSON.parse(s.assumptions || '{}').feasible,
          actions: JSON.parse(s.action_items || '[]'),
        };
      }

      const chatData = {
        name: existing.name,
        goalType: existing.goal_type,
        targetAmount: existing.target_amount,
        snapshot: planData.snapshot || {},
        scenarios: scenarioMap,
        milestones: planRepo.getMilestones(existing.id),
        taxSuggestions: planData.taxSuggestions || [],
        emiAnalysis: planData.emiAnalysis || null,
      };

      const history = [
        ...parsed.data.history,
        { role: 'user', content: parsed.data.message },
      ];

      const userAISettings = getUserAISettings(req.user.id);
      const result = await ai.chat(chatData, history, userAISettings);

      // Log
      planRepo.logAIInteraction(existing.id, req.user.id, {
        interaction_type: 'conversation',
        user_input: parsed.data.message,
        ai_output: result.text,
        provider: result.provider,
        model: result.model,
        tokens_used: result.tokens_used,
      });

      res.json({ response: result.text, provider: result.provider });
    } catch (err) { next(err); }
  });

  // GET /api/plans/:id/ai-log — AI interaction history
  router.get('/:id/ai-log', (req, res, next) => {
    try {
      const existing = planRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      const log = planRepo.getAILog(existing.id, req.user.id, Number(req.query.limit) || 50);
      res.json({ log });
    } catch (err) { next(err); }
  });

  // GET /api/plans/:id/tax-suggestions — tax suggestions for a plan
  router.get('/:id/tax-suggestions', (req, res, next) => {
    try {
      const existing = planRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      const snapshot = engine.getUserFinancialSnapshot(req.user.id);
      const suggestions = engine.getTaxSuggestions(existing.goal_type, existing.target_amount, snapshot);
      res.json({ suggestions });
    } catch (err) { next(err); }
  });

  return router;
};
