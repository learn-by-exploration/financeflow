const { z } = require('zod');

const registerSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  display_name: z.string().max(100).optional().nullable(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const passwordChangeSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const accountDeleteSchema = z.object({
  password: z.string().min(1),
});

module.exports = { registerSchema, loginSchema, passwordChangeSchema, accountDeleteSchema };
