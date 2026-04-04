// src/schemas/balance-alert.schema.js
const { z } = require('zod');

const createBalanceAlertSchema = z.object({
  account_id: z.number().int().positive('account_id is required'),
  threshold_amount: z.number().finite().min(0, 'Threshold must be non-negative').max(1e15),
  direction: z.enum(['below', 'above']).optional().default('below'),
  is_enabled: z.number().int().min(0).max(1).optional().default(1),
});

const updateBalanceAlertSchema = z.object({
  threshold_amount: z.number().finite().min(0).max(1e15).optional(),
  direction: z.enum(['below', 'above']).optional(),
  is_enabled: z.number().int().min(0).max(1).optional(),
});

module.exports = { createBalanceAlertSchema, updateBalanceAlertSchema };
