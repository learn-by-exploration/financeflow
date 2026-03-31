const { z } = require('zod');

const splitItemSchema = z.object({
  member_id: z.number().int().positive(),
  amount: z.number().positive().max(1e15).optional(),
  percentage: z.number().positive().optional(),
  shares: z.number().positive().optional(),
});

const createExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive').max(1e15, 'Amount too large'),
  paid_by: z.number().int().positive('Paid by member is required'),
  currency: z.string().length(3).optional(),
  category_id: z.number().int().positive().optional().nullable(),
  date: z.string().min(1, 'Date is required'),
  note: z.string().max(500).optional().nullable(),
  split_method: z.enum(['equal', 'exact', 'percentage', 'shares']).optional().default('equal'),
  splits: z.array(splitItemSchema).optional(),
});

const createSettlementSchema = z.object({
  from_member: z.number().int().positive('Payer member is required'),
  to_member: z.number().int().positive('Payee member is required'),
  amount: z.number().positive('Amount must be positive').max(1e15, 'Amount too large'),
  note: z.string().max(500).optional().nullable(),
});

module.exports = { createExpenseSchema, createSettlementSchema };
