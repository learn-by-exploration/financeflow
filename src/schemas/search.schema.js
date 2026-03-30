const { z } = require('zod');

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200, 'Search query must be 200 characters or less'),
});

module.exports = { searchQuerySchema };
