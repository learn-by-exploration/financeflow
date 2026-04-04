const { z } = require('zod');

const createExchangeRateSchema = z.object({
  base_currency: z.string().length(3, 'Currency code must be 3 characters').toUpperCase(),
  target_currency: z.string().length(3, 'Currency code must be 3 characters').toUpperCase(),
  rate: z.number().positive('Rate must be positive').max(1e10, 'Exchange rate too large'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

module.exports = { createExchangeRateSchema };
