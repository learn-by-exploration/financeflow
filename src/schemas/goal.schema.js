const { z } = require('zod');

const createGoalSchema = z.object({
  name: z.string().min(1, 'Goal name is required').max(100),
  target_amount: z.number().positive('Target amount must be positive').max(1e15, 'Amount too large'),
  current_amount: z.number().min(0).max(1e15).optional().default(0),
  currency: z.string().length(3).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  deadline: z.string().optional().nullable(),
});

const contributeSchema = z.object({
  amount: z.number().positive('Contribution must be positive').max(1e15, 'Amount too large'),
});

const updateGoalSchema = createGoalSchema.partial().extend({
  is_completed: z.number().int().min(0).max(1).optional(),
  auto_allocate_percent: z.number().min(0).max(100).optional().nullable(),
});

module.exports = { createGoalSchema, contributeSchema, updateGoalSchema };
