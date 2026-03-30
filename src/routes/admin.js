const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');
const { createBackup, listBackups, deleteBackup, rotateBackups, resolveBackupPath } = require('../services/backup');
const { backupFilenameSchema } = require('../schemas/admin.schema');

module.exports = function createAdminRoutes({ db }) {
  const backupDir = path.join(config.dbDir, 'backups');

  // POST /api/admin/backup — create a new backup
  router.post('/backup', async (req, res, next) => {
    try {
      const result = await createBackup(db, backupDir);
      rotateBackups(backupDir, config.backup.maxBackups);
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  // GET /api/admin/backups — list all backups
  router.get('/backups', (_req, res, next) => {
    try {
      const backups = listBackups(backupDir);
      res.json({ backups });
    } catch (err) { next(err); }
  });

  // GET /api/admin/backups/:filename — download a backup
  router.get('/backups/:filename', (req, res, next) => {
    try {
      const parsed = backupFilenameSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const filepath = resolveBackupPath(backupDir, parsed.data.filename);
      if (!filepath) return res.status(404).json({ error: 'Backup not found' });
      res.download(filepath);
    } catch (err) { next(err); }
  });

  // DELETE /api/admin/backups/:filename — delete a backup
  router.delete('/backups/:filename', (req, res, next) => {
    try {
      const parsed = backupFilenameSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      deleteBackup(backupDir, parsed.data.filename);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

  return router;
};
