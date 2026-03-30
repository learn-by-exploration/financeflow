const { z } = require('zod');

const createTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(50).transform(s => s.trim()),
  color: z.string().max(20).optional(),
});

module.exports = { createTagSchema };
