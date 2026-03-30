const { z } = require('zod');

const createReminderSchema = z.object({
  subscription_id: z.number().int().positive().optional().nullable(),
  recurring_rule_id: z.number().int().positive().optional().nullable(),
  days_before: z.number().int().min(0).max(90).default(3),
  is_enabled: z.number().int().min(0).max(1).default(1),
}).refine(
  data => (data.subscription_id != null) !== (data.recurring_rule_id != null),
  { message: 'Exactly one of subscription_id or recurring_rule_id must be set' }
);

const updateReminderSchema = z.object({
  days_before: z.number().int().min(0).max(90).optional(),
  is_enabled: z.number().int().min(0).max(1).optional(),
});

module.exports = { createReminderSchema, updateReminderSchema };
