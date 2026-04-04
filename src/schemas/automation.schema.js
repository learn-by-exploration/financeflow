// src/schemas/automation.schema.js
const { z } = require('zod');

const automationPresetSchema = z.object({
  preset: z.enum(['cautious', 'balanced', 'hands_off'], { message: 'Invalid preset. Choose: cautious, balanced, hands_off' }),
});

module.exports = { automationPresetSchema };
