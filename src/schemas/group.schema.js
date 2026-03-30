const { z } = require('zod');

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100, 'Group name must be 100 characters or less'),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
});

const addMemberSchema = z.object({
  username: z.string().min(1, 'Username cannot be empty').optional(),
  display_name: z.string().min(1).max(100).optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1, 'Group name cannot be empty').max(100, 'Group name must be 100 characters or less').optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
});

module.exports = { createGroupSchema, addMemberSchema, updateGroupSchema };
