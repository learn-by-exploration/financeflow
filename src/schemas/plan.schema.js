// src/schemas/plan.schema.js
const { z } = require('zod');

const GOAL_TYPES = ['home_purchase', 'vehicle', 'wedding', 'education', 'retirement', 'emergency_fund', 'travel', 'business', 'debt_payoff', 'custom'];
const RISK_LEVELS = ['conservative', 'moderate', 'aggressive'];
const STATUSES = ['draft', 'active', 'paused', 'completed', 'cancelled'];
const SCENARIO_TYPES = ['conservative', 'moderate', 'aggressive'];

const createPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(200),
  goal_type: z.enum(GOAL_TYPES, { message: 'Invalid goal type' }),
  target_amount: z.number().positive('Target amount must be positive').max(1e15, 'Amount too large'),
  target_date: z.string().optional().nullable(),
  risk_tolerance: z.enum(RISK_LEVELS).optional().default('moderate'),
  constraints: z.object({
    inflation_rate: z.number().min(0).max(0.5).optional(),
    max_monthly_savings: z.number().positive().max(1e15).optional(),
    exclude_categories: z.array(z.number().int()).optional(),
  }).optional().nullable(),
  linked_goal_id: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(STATUSES).optional(),
  target_amount: z.number().positive().max(1e15).optional(),
  target_date: z.string().optional().nullable(),
  current_saved: z.number().min(0).max(1e15).optional(),
  risk_tolerance: z.enum(RISK_LEVELS).optional(),
  selected_scenario: z.enum(SCENARIO_TYPES).optional(),
  monthly_savings_target: z.number().min(0).max(1e15).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const whatIfSchema = z.object({
  adjustments: z.object({
    income_change: z.number().min(-1e15).max(1e15).optional(),
    expense_cut: z.number().min(0).max(1e15).optional(),
    target_amount: z.number().positive().max(1e15).optional(),
    target_date: z.string().optional(),
    lump_sum: z.number().min(0).max(1e15).optional(),
  }),
});

const emiSchema = z.object({
  principal: z.number().positive('Principal must be positive').max(1e15),
  annual_rate: z.number().min(0).max(100, 'Rate must be 0-100'),
  tenure_months: z.number().int().positive().max(600, 'Max tenure 50 years'),
});

const chatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(5000),
  })).max(20).optional().default([]),
});

module.exports = {
  createPlanSchema,
  updatePlanSchema,
  whatIfSchema,
  emiSchema,
  chatSchema,
  GOAL_TYPES,
  RISK_LEVELS,
  STATUSES,
  SCENARIO_TYPES,
};
