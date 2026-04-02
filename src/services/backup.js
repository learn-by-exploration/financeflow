const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AppError, NotFoundError } = require('../errors');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const MAGIC_HEADER = Buffer.from('PFBKENC1'); // 8-byte magic header

function backupFilename() {
  const now = new Date();
  const ts = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `backup-${ts}-${ms}.db`;
}

function getEncryptionKey() {
  const config = require('../config');
  const keyHex = config.backupEncryption.key;
  if (!keyHex) return null;
  if (keyHex.length !== 64) {
    throw new AppError('ENCRYPTION_ERROR', 'BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)', 500);
  }
  return Buffer.from(keyHex, 'hex');
}

function encryptBuffer(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: MAGIC(8) + IV(16) + AUTH_TAG(16) + CIPHERTEXT
  return Buffer.concat([MAGIC_HEADER, iv, authTag, encrypted]);
}

function decryptBuffer(data, key) {
  if (data.length < MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new AppError('DECRYPTION_ERROR', 'Data too short to be an encrypted backup', 400);
  }
  const magic = data.subarray(0, MAGIC_HEADER.length);
  if (!magic.equals(MAGIC_HEADER)) {
    throw new AppError('DECRYPTION_ERROR', 'Not an encrypted backup file', 400);
  }
  let offset = MAGIC_HEADER.length;
  const iv = data.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = data.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const ciphertext = data.subarray(offset);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function isEncryptedBackup(filepath) {
  const fd = fs.openSync(filepath, 'r');
  const buf = Buffer.alloc(MAGIC_HEADER.length);
  fs.readSync(fd, buf, 0, MAGIC_HEADER.length, 0);
  fs.closeSync(fd);
  return buf.equals(MAGIC_HEADER);
}

async function createBackup(db, backupDir) {
  // Layer 7: Empty-DB backup skip — refuse to overwrite good backups with empty data
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  const txnCount = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get().cnt;
  if (userCount === 0 && txnCount === 0) {
    return { skipped: true, reason: 'Database is empty — refusing to create backup that could mask data loss' };
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const filename = backupFilename();
  const dest = path.join(backupDir, filename);
  await db.backup(dest);

  // Encrypt if key is configured
  const key = getEncryptionKey();
  if (key) {
    const plaintext = fs.readFileSync(dest);
    const encrypted = encryptBuffer(plaintext, key);
    fs.writeFileSync(dest, encrypted);
  }

  // Layer 12: Verify backup integrity (only for unencrypted backups)
  if (!key) {
    try {
      const Database = require('better-sqlite3');
      const verifyDb = new Database(dest, { readonly: true });
      const result = verifyDb.pragma('integrity_check');
      verifyDb.close();
      if (!result || result[0]?.integrity_check !== 'ok') {
        fs.unlinkSync(dest);
        throw new AppError('BACKUP_CORRUPT', 'Backup integrity check failed — backup discarded', 500);
      }
    } catch (err) {
      if (err.code === 'BACKUP_CORRUPT') throw err;
      // If verification fails for other reasons (e.g. file access), log but keep backup
    }
  }

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

module.exports = { createBackup, listBackups, deleteBackup, rotateBackups, resolveBackupPath, encryptBuffer, decryptBuffer, isEncryptedBackup, getEncryptionKey, MAGIC_HEADER };
