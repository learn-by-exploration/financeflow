const fs = require('fs');
const path = require('path');
const { AppError, NotFoundError } = require('../errors');

function backupFilename() {
  const now = new Date();
  const ts = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `backup-${ts}-${ms}.db`;
}

async function createBackup(db, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const filename = backupFilename();
  const dest = path.join(backupDir, filename);
  await db.backup(dest);
  const stat = fs.statSync(dest);
  return { filename, size: stat.size, created: stat.mtime.toISOString() };
}

function listBackups(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup-') && f.endsWith('.db'));
  return files.map(filename => {
    const stat = fs.statSync(path.join(backupDir, filename));
    return { filename, size: stat.size, created: stat.mtime.toISOString() };
  }).sort((a, b) => b.created.localeCompare(a.created));
}

function deleteBackup(backupDir, filename) {
  const safe = path.basename(filename);
  if (safe !== filename || !safe.startsWith('backup-') || !safe.endsWith('.db')) {
    throw new AppError('INVALID_FILENAME', 'Invalid backup filename', 400);
  }
  const filepath = path.join(backupDir, safe);
  if (!fs.existsSync(filepath)) {
    throw new NotFoundError('Backup');
  }
  fs.unlinkSync(filepath);
}

function rotateBackups(backupDir, keep = 5) {
  const backups = listBackups(backupDir);
  if (backups.length <= keep) return [];
  const toDelete = backups.slice(keep);
  for (const b of toDelete) {
    fs.unlinkSync(path.join(backupDir, b.filename));
  }
  return toDelete.map(b => b.filename);
}

function resolveBackupPath(backupDir, filename) {
  const safe = path.basename(filename);
  if (safe !== filename || !safe.startsWith('backup-') || !safe.endsWith('.db')) {
    return null;
  }
  const filepath = path.join(backupDir, safe);
  if (!fs.existsSync(filepath)) return null;
  return filepath;
}

module.exports = { createBackup, listBackups, deleteBackup, rotateBackups, resolveBackupPath };
