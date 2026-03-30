const { z } = require('zod');

const VALID_TYPES = ['income', 'expense', 'transfer'];

const createTransactionSchema = z.object({
  account_id: z.number().int().positive(),
  category_id: z.number().int().positive().optional().nullable(),
  type: z.enum(VALID_TYPES),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3).optional(),
  description: z.string().min(1, 'Description is required').max(500),
  note: z.string().max(1000).optional().nullable(),
  date: z.string().min(1, 'Date is required'),
  payee: z.string().max(200).optional().nullable(),
  transfer_to_account_id: z.number().int().positive().optional().nullable(),
  tag_ids: z.array(z.number().int().positive()).optional(),
});

const updateTransactionSchema = z.object({
  category_id: z.number().int().positive().optional().nullable(),
  amount: z.number().positive().optional(),
  description: z.string().min(1).max(500).optional(),
  note: z.string().max(1000).optional().nullable(),
  date: z.string().optional(),
  payee: z.string().max(200).optional().nullable(),
});

const bulkIdsArray = z.array(z.number().int().positive()).min(1).max(100);

const bulkDeleteSchema = z.object({
  ids: bulkIdsArray,
});

const bulkCategorizeSchema = z.object({
  ids: bulkIdsArray,
  category_id: z.number().int().positive(),
});

const bulkTagSchema = z.object({
  ids: bulkIdsArray,
  tag_ids: z.array(z.number().int().positive()).min(1),
});

const bulkUntagSchema = z.object({
  ids: bulkIdsArray,
  tag_ids: z.array(z.number().int().positive()).min(1),
});

module.exports = {
  createTransactionSchema, updateTransactionSchema, VALID_TYPES,
  bulkDeleteSchema, bulkCategorizeSchema, bulkTagSchema, bulkUntagSchema,
};
