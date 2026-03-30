const { z } = require('zod');

const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  unread_only: z.string().optional(),
});

module.exports = { notificationQuerySchema };
