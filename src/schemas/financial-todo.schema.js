// src/schemas/financial-todo.schema.js
const { z } = require('zod');

const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

const createTodoSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(VALID_PRIORITIES).optional().default('medium'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
});

const updateTodoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
});

module.exports = { createTodoSchema, updateTodoSchema, VALID_PRIORITIES, VALID_STATUSES };
