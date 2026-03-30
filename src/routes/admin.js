const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { createBackup, listBackups, deleteBackup, rotateBackups, resolveBackupPath, isEncryptedBackup, decryptBuffer, getEncryptionKey } = require('../services/backup');
const { backupFilenameSchema } = require('../schemas/admin.schema');
const createAuditRetention = require('../services/audit-retention');

module.exports = function createAdminRoutes({ db }) {
  const backupDir = path.join(config.dbDir, 'backups');
  const auditRetention = createAuditRetention(db);

  // POST /api/admin/users/:id/reset-password — admin reset a user's password
  router.post('/users/:id/reset-password', (req, res, next) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (!userId || isNaN(userId)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user ID' } });
      }
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      const { newPassword } = req.body || {};
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'newPassword must be at least 8 characters' } });
      }
      const hash = bcrypt.hashSync(newPassword, config.auth.saltRounds);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
      // Invalidate all sessions for the target user
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      res.json({ ok: true, message: 'Password reset successfully' });
    } catch (err) { next(err); }
  });

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

  // GET /api/admin/backups/:filename/download — download backup (decrypted if encrypted)
  router.get('/backups/:filename/download', (req, res, next) => {
    try {
      const parsed = backupFilenameSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const filepath = resolveBackupPath(backupDir, parsed.data.filename);
      if (!filepath) return res.status(404).json({ error: 'Backup not found' });

      if (isEncryptedBackup(filepath)) {
        const key = getEncryptionKey();
        if (!key) {
          return res.status(500).json({ error: { code: 'ENCRYPTION_ERROR', message: 'Backup is encrypted but no encryption key is configured' } });
        }
        const encrypted = require('fs').readFileSync(filepath);
        const decrypted = decryptBuffer(encrypted, key);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${parsed.data.filename}"`);
        return res.send(decrypted);
      }

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

  // POST /api/admin/audit/purge — purge old audit logs
  router.post('/audit/purge', (req, res, next) => {
    try {
      const retentionDays = parseInt(req.body.retentionDays, 10) || 90;
      const result = auditRetention.purgeOldLogs(retentionDays);
      res.json(result);
    } catch (err) { next(err); }
  });

  // GET /api/admin/audit/stats — audit log statistics by age bucket
  router.get('/audit/stats', (req, res, next) => {
    try {
      const stats = auditRetention.getAuditStats();
      res.json(stats);
    } catch (err) { next(err); }
  });

  return router;
};
