const { z } = require('zod');

const VALID_TYPES = ['income', 'expense'];
const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

const createRecurringSchema = z.object({
  account_id: z.number().int().positive(),
  category_id: z.number().int().positive().optional().nullable(),
  type: z.enum(VALID_TYPES),
  amount: z.number().positive().max(1e15),
  currency: z.string().length(3).optional(),
  description: z.string().min(1).max(500),
  payee: z.string().max(200).optional().nullable(),
  frequency: z.enum(VALID_FREQUENCIES),
  next_date: z.string().min(1),
  end_date: z.string().optional().nullable(),
});

const updateRecurringSchema = createRecurringSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});

module.exports = { createRecurringSchema, updateRecurringSchema, VALID_FREQUENCIES };
