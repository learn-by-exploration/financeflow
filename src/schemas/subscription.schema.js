const { z } = require('zod');

const VALID_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

const createSubscriptionSchema = z.object({
  name: z.string().min(1, 'Subscription name is required').max(100),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3).optional(),
  frequency: z.enum(VALID_FREQUENCIES),
  category_id: z.number().int().positive().optional().nullable(),
  next_billing_date: z.string().optional().nullable(),
  provider: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

module.exports = { createSubscriptionSchema };
