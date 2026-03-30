const { z } = require('zod');

const VALID_TYPES = ['checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'wallet', 'other'];

const createAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  type: z.enum(VALID_TYPES).optional().default('checking'),
  currency: z.string().length(3).optional(),
  balance: z.number().optional().default(0),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  institution: z.string().max(100).optional().nullable(),
  account_number_last4: z.string().max(4).optional().nullable(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(VALID_TYPES).optional(),
  currency: z.string().length(3).optional(),
  balance: z.number().optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  institution: z.string().max(100).optional().nullable(),
  account_number_last4: z.string().max(4).optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
  include_in_net_worth: z.number().int().min(0).max(1).optional(),
});

module.exports = { createAccountSchema, updateAccountSchema, VALID_TYPES };
