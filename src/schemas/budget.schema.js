const { z } = require('zod');

const VALID_PERIODS = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];

const budgetBaseSchema = z.object({
  name: z.string().min(1, 'Budget name is required').max(100),
  period: z.enum(VALID_PERIODS),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  items: z.array(z.object({
    category_id: z.number().int().positive(),
    amount: z.number().positive().max(1e15),
    rollover: z.number().int().min(0).max(1).optional().default(0),
  })).optional().default([]),
});

const createBudgetSchema = budgetBaseSchema.refine(
  (data) => !data.start_date || !data.end_date || data.start_date <= data.end_date,
  { message: 'start_date must be before or equal to end_date', path: ['end_date'] }
);

const updateBudgetSchema = budgetBaseSchema.partial().omit({ items: true }).extend({
  is_active: z.number().int().min(0).max(1).optional(),
}).refine(
  (data) => !data.start_date || !data.end_date || data.start_date <= data.end_date,
  { message: 'start_date must be before or equal to end_date', path: ['end_date'] }
);

const budgetTemplateSchema = z.object({
  template: z.enum(['50/30/20', 'zero-based', 'conscious-spending']),
  income: z.number().positive('Income must be a positive number').max(1e15),
});

module.exports = { createBudgetSchema, updateBudgetSchema, budgetTemplateSchema };
