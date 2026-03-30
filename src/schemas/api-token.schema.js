const { z } = require('zod');

const createApiTokenSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(100),
  scope: z.enum(['read', 'readwrite']).optional().default('readwrite'),
});

module.exports = { createApiTokenSchema };
