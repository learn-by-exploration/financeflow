const { z } = require('zod');
const { passwordSchema } = require('./auth.schema');

const backupFilenameSchema = z.object({
  filename: z.string().regex(/^backup-[\w\-.]+\.db$/, 'Filename must match backup-*.db pattern'),
});

const adminPasswordResetSchema = z.object({
  newPassword: passwordSchema,
});

module.exports = { backupFilenameSchema, adminPasswordResetSchema };
