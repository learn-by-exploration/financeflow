const { z } = require('zod');

const VALID_TYPES = ['income', 'expense', 'transfer'];

const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  type: z.enum(VALID_TYPES),
  parent_id: z.number().int().positive().optional().nullable(),
});

const updateCategorySchema = createCategorySchema.partial();

module.exports = { createCategorySchema, updateCategorySchema };
