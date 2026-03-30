const { z } = require('zod');

const createApiTokenSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(100),
  scope: z.enum(['read', 'readwrite']).optional().default('readwrite'),
  expires_at: z.string().datetime({ message: 'expires_at must be a valid ISO 8601 date string' }).optional(),
});

module.exports = { createApiTokenSchema };
