const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { setup, agent, rawAgent, cleanDb } = require('./helpers');
const { createBackup, listBackups, encryptBuffer, decryptBuffer, MAGIC_HEADER, isEncryptedBackup } = require('../src/services/backup');

describe('Backup Encryption', () => {
  let db, tmpBackupDir;

  before(() => {
    const ctx = setup();
    db = ctx.db;
  });

  beforeEach(() => {
    tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-enc-backup-'));
  });

  function cleanupDir(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }

  it('backup creates file successfully without encryption', async () => {
    const result = await createBackup(db, tmpBackupDir);
    assert.ok(result.filename.startsWith('backup-'));
    assert.ok(result.filename.endsWith('.db'));
    assert.ok(result.size > 0);
    const filepath = path.join(tmpBackupDir, result.filename);
    assert.ok(fs.existsSync(filepath));
    // Without encryption key, file should be a raw SQLite DB (starts with "SQLite")
    const header = fs.readFileSync(filepath).subarray(0, 6).toString();
    assert.equal(header, 'SQLite');
    cleanupDir(tmpBackupDir);
  });

  it('encrypted backup file starts with magic header bytes', () => {
    const key = crypto.randomBytes(32);
    const plaintext = Buffer.from('test data for encryption');
    const encrypted = encryptBuffer(plaintext, key);
    // First 8 bytes should be PFBKENC1
    assert.ok(encrypted.subarray(0, 8).equals(MAGIC_HEADER));
  });

  it('encrypted backup can be decrypted back to original data', () => {
    const key = crypto.randomBytes(32);
    const plaintext = Buffer.from('This is test backup data for round-trip encryption');
    const encrypted = encryptBuffer(plaintext, key);
    const decrypted = decryptBuffer(encrypted, key);
    assert.ok(decrypted.equals(plaintext));
  });

  it('decryption with wrong key fails', () => {
    const key1 = crypto.randomBytes(32);
    const key2 = crypto.randomBytes(32);
    const plaintext = Buffer.from('secret backup data');
    const encrypted = encryptBuffer(plaintext, key1);
    assert.throws(() => decryptBuffer(encrypted, key2));
  });

  it('decryption of non-encrypted data throws error', () => {
    const key = crypto.randomBytes(32);
    const plainData = Buffer.from('just plain text not encrypted');
    assert.throws(() => decryptBuffer(plainData, key), (err) => {
      return err.code === 'DECRYPTION_ERROR';
    });
  });

  it('encrypted backup with env key creates encrypted file', async () => {
    const origKey = process.env.BACKUP_ENCRYPTION_KEY;
    const testKey = crypto.randomBytes(32).toString('hex');
    process.env.BACKUP_ENCRYPTION_KEY = testKey;
    // Must re-require config to pick up new env value
    delete require.cache[require.resolve('../src/config')];
    try {
      const result = await createBackup(db, tmpBackupDir);
      const filepath = path.join(tmpBackupDir, result.filename);
      assert.ok(isEncryptedBackup(filepath));
      // Should start with magic header, not "SQLite"
      const header = fs.readFileSync(filepath).subarray(0, 8);
      assert.ok(header.equals(MAGIC_HEADER));
    } finally {
      if (origKey !== undefined) {
        process.env.BACKUP_ENCRYPTION_KEY = origKey;
      } else {
        delete process.env.BACKUP_ENCRYPTION_KEY;
      }
      delete require.cache[require.resolve('../src/config')];
    }
    cleanupDir(tmpBackupDir);
  });

  it('encrypted backup can be decrypted and is valid SQLite', async () => {
    const origKey = process.env.BACKUP_ENCRYPTION_KEY;
    const testKey = crypto.randomBytes(32).toString('hex');
    process.env.BACKUP_ENCRYPTION_KEY = testKey;
    delete require.cache[require.resolve('../src/config')];
    try {
      const result = await createBackup(db, tmpBackupDir);
      const filepath = path.join(tmpBackupDir, result.filename);
      const encrypted = fs.readFileSync(filepath);
      const decrypted = decryptBuffer(encrypted, Buffer.from(testKey, 'hex'));
      // Decrypted data should be a valid SQLite database
      assert.equal(decrypted.subarray(0, 6).toString(), 'SQLite');
    } finally {
      if (origKey !== undefined) {
        process.env.BACKUP_ENCRYPTION_KEY = origKey;
      } else {
        delete process.env.BACKUP_ENCRYPTION_KEY;
      }
      delete require.cache[require.resolve('../src/config')];
    }
    cleanupDir(tmpBackupDir);
  });
});

describe('Backup API endpoints', () => {
  before(() => setup());
  beforeEach(() => cleanDb());

  it('POST /api/admin/backup creates backup (admin only)', async () => {
    const res = await agent().post('/api/admin/backup');
    assert.equal(res.status, 201);
    assert.ok(res.body.filename);
    assert.ok(res.body.size > 0);
  });

  it('GET /api/admin/backups lists backups', async () => {
    await agent().post('/api/admin/backup');
    const res = await agent().get('/api/admin/backups');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.backups));
    assert.ok(res.body.backups.length >= 1);
  });

  it('GET /api/admin/backups/:filename/download returns backup file', async () => {
    const createRes = await agent().post('/api/admin/backup');
    assert.equal(createRes.status, 201);
    const filename = createRes.body.filename;
    const res = await agent().get(`/api/admin/backups/${filename}/download`);
    assert.equal(res.status, 200);
  });

  it('backup endpoints require admin authentication', async () => {
    const res = await rawAgent().post('/api/admin/backup');
    assert.ok([401, 403].includes(res.status));
  });

  it('backup download returns 404 for non-existent file', async () => {
    const res = await agent().get('/api/admin/backups/backup-nonexistent.db/download');
    assert.equal(res.status, 404);
  });
});

describe('CORS Middleware', () => {
  before(() => setup());

  it('responses include Access-Control-Allow-Origin header', async () => {
    const res = await agent().get('/api/health');
    // Default config is '*'
    assert.ok(res.headers['access-control-allow-origin'] !== undefined);
  });

  it('OPTIONS preflight returns 204 with proper headers', async () => {
    const res = await rawAgent()
      .options('/api/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    assert.equal(res.status, 204);
    assert.ok(res.headers['access-control-allow-methods']);
    assert.ok(res.headers['access-control-allow-headers']);
    assert.ok(res.headers['access-control-max-age']);
  });

  it('CORS Access-Control-Allow-Methods header is present', async () => {
    const res = await rawAgent()
      .options('/api/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    const methods = res.headers['access-control-allow-methods'];
    assert.ok(methods);
    assert.ok(methods.includes('GET'));
    assert.ok(methods.includes('POST'));
  });

  it('CORS Access-Control-Allow-Headers includes expected headers', async () => {
    const res = await rawAgent()
      .options('/api/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    const headers = res.headers['access-control-allow-headers'];
    assert.ok(headers);
    assert.ok(headers.includes('Content-Type'));
    assert.ok(headers.includes('X-Session-Token'));
  });

  it('CORS handles requests without Origin header', async () => {
    const res = await rawAgent().get('/api/health');
    // Should not crash; allow-origin may or may not be set
    assert.ok(res.status < 500);
  });
});
