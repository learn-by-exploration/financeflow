// src/schemas/rule.schema.js — Zod schema for category rules
const { z } = require('zod');

const createRuleSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required').max(500, 'Pattern must be at most 500 characters'),
  category_id: z.number().int().positive('category_id is required'),
  position: z.number().int().min(0).optional(),
});

const updateRuleSchema = z.object({
  pattern: z.string().min(1).max(500).optional(),
  category_id: z.number().int().positive().optional(),
  position: z.number().int().min(0).optional(),
});

module.exports = { createRuleSchema, updateRuleSchema };
