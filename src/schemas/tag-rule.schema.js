// src/schemas/tag-rule.schema.js
const { z } = require('zod');

const createTagRuleSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required').max(500, 'Pattern must be at most 500 characters'),
  tag: z.string().min(1, 'Tag is required').max(100, 'Tag must be at most 100 characters'),
  match_type: z.enum(['description', 'amount_above', 'amount_below']).optional().default('description'),
  match_value: z.number().finite().min(0).max(1e15).optional(),
  position: z.number().int().min(0).optional(),
});

const updateTagRuleSchema = z.object({
  pattern: z.string().min(1).max(500).optional(),
  tag: z.string().min(1).max(100).optional(),
  match_type: z.enum(['description', 'amount_above', 'amount_below']).optional(),
  match_value: z.number().finite().min(0).max(1e15).optional(),
  position: z.number().int().min(0).optional(),
  is_enabled: z.number().int().min(0).max(1).optional(),
});

module.exports = { createTagRuleSchema, updateTagRuleSchema };
