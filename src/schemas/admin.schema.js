const { z } = require('zod');

const backupFilenameSchema = z.object({
  filename: z.string().regex(/^backup-[\w\-.]+\.db$/, 'Filename must match backup-*.db pattern'),
});

module.exports = { backupFilenameSchema };
