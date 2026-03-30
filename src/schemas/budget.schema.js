const { z } = require('zod');

const VALID_PERIODS = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];

const createBudgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required').max(100),
  period: z.enum(VALID_PERIODS),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  items: z.array(z.object({
    category_id: z.number().int().positive(),
    amount: z.number().positive(),
    rollover: z.number().int().min(0).max(1).optional().default(0),
  })).optional().default([]),
});

module.exports = { createBudgetSchema };
