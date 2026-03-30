const { z } = require('zod');

const preferencesSchema = z.object({
  date_format: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY']).optional(),
  number_format: z.enum(['en-IN', 'en-US', 'en-GB', 'de-DE', 'fr-FR']).optional(),
  timezone: z.string().min(1).max(100).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa']).optional(),
  items_per_page: z.number().int().min(5).max(100).optional(),
});

const PREFERENCE_KEYS = ['date_format', 'number_format', 'timezone', 'theme', 'language', 'items_per_page'];

const PREFERENCE_DEFAULTS = {
  date_format: 'YYYY-MM-DD',
  number_format: 'en-IN',
  timezone: 'Asia/Kolkata',
  theme: 'system',
  language: 'en',
  items_per_page: 25,
};

module.exports = { preferencesSchema, PREFERENCE_KEYS, PREFERENCE_DEFAULTS };
