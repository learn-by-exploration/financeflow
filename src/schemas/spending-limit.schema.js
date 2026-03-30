const { z } = require('zod');

const VALID_PERIODS = ['daily', 'weekly', 'monthly'];

const createSpendingLimitSchema = z.object({
  category_id: z.number().int().positive().optional().nullable(),
  period: z.enum(VALID_PERIODS, { errorMap: () => ({ message: 'Period must be daily, weekly, or monthly' }) }),
  amount: z.number().positive('Amount must be positive'),
});

const updateSpendingLimitSchema = z.object({
  period: z.enum(VALID_PERIODS, { errorMap: () => ({ message: 'Period must be daily, weekly, or monthly' }) }).optional(),
  amount: z.number().positive('Amount must be positive').optional(),
});

module.exports = { createSpendingLimitSchema, updateSpendingLimitSchema };
