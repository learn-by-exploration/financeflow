// src/schemas/personal-lending.schema.js
const { z } = require('zod');

const VALID_TYPES = ['lent', 'borrowed'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

const createLendingSchema = z.object({
  person_name: z.string().min(1, 'Person name is required').max(200),
  type: z.enum(VALID_TYPES),
  amount: z.number().positive('Amount must be positive').max(1e15),
  outstanding: z.number().min(0).max(1e15).optional(),
  interest_rate: z.number().min(0).max(100).optional().default(0),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/).optional().default('INR'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  expected_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  purpose: z.string().max(500).optional().nullable(),
  mode: z.string().max(100).optional().nullable(),
  priority: z.enum(VALID_PRIORITIES).optional().default('medium'),
  notes: z.string().max(2000).optional().nullable(),
});

const updateLendingSchema = z.object({
  person_name: z.string().min(1).max(200).optional(),
  outstanding: z.number().min(0).max(1e15).optional(),
  interest_rate: z.number().min(0).max(100).optional(),
  expected_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  purpose: z.string().max(500).optional().nullable(),
  mode: z.string().max(100).optional().nullable(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  notes: z.string().max(2000).optional().nullable(),
  is_settled: z.number().int().min(0).max(1).optional(),
});

const createPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(1e15),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  notes: z.string().max(500).optional().nullable(),
});

module.exports = { createLendingSchema, updateLendingSchema, createPaymentSchema };
