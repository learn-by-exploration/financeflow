const { z } = require('zod');

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const registerSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  password: passwordSchema,
  email: z.string().email().optional().or(z.literal('')).nullable(),
  display_name: z.string().max(100).optional().nullable(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  totp_code: z.string().optional(),
});

const passwordChangeSchema = z.object({
  current_password: z.string().min(1),
  new_password: passwordSchema,
});

const accountDeleteSchema = z.object({
  password: z.string().min(1),
});

module.exports = { registerSchema, loginSchema, passwordChangeSchema, accountDeleteSchema };
