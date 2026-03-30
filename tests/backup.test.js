const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { setup, agent, cleanDb } = require('./helpers');
const { createBackup, listBackups, deleteBackup, rotateBackups, resolveBackupPath } = require('../src/services/backup');

describe('Backup service', () => {
  let db, tmpBackupDir;

  before(() => {
    const ctx = setup();
    db = ctx.db;
  });

  beforeEach(() => {
    tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-backup-'));
  });

  after(() => {
    // cleanup any leftover dirs
  });

  function cleanupDir(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }

  it('createBackup produces a file', async () => {
    const result = await createBackup(db, tmpBackupDir);
    assert.ok(result.filename.startsWith('backup-'));
    assert.ok(result.filename.endsWith('.db'));
    assert.ok(result.size > 0);
    assert.ok(fs.existsSync(path.join(tmpBackupDir, result.filename)));
    cleanupDir(tmpBackupDir);
  });

  it('backup filename format is correct', async () => {
    const result = await createBackup(db, tmpBackupDir);
    // backup-YYYY-MM-DDTHH-MM-SS-mmm.db
    const pattern = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.db$/;
    assert.match(result.filename, pattern);
    cleanupDir(tmpBackupDir);
  });

  it('backup is a valid SQLite database', async () => {
    const result = await createBackup(db, tmpBackupDir);
    const backupDb = new Database(path.join(tmpBackupDir, result.filename), { readonly: true });
    const row = backupDb.prepare('SELECT 1 AS ok').get();
    assert.equal(row.ok, 1);
    backupDb.close();
    cleanupDir(tmpBackupDir);
  });

  it('listBackups returns created backups', async () => {
    await createBackup(db, tmpBackupDir);
    await createBackup(db, tmpBackupDir);
    const list = listBackups(tmpBackupDir);
    assert.equal(list.length, 2);
    assert.ok(list[0].filename);
    assert.ok(list[0].size > 0);
    // sorted newest first
    assert.ok(list[0].created >= list[1].created);
    cleanupDir(tmpBackupDir);
  });

  it('listBackups returns empty array for non-existent dir', () => {
    const list = listBackups('/tmp/nonexistent-pf-backup-dir-xyz');
    assert.deepEqual(list, []);
  });

  it('deleteBackup removes the file', async () => {
    const result = await createBackup(db, tmpBackupDir);
    assert.ok(fs.existsSync(path.join(tmpBackupDir, result.filename)));
    deleteBackup(tmpBackupDir, result.filename);
    assert.ok(!fs.existsSync(path.join(tmpBackupDir, result.filename)));
    cleanupDir(tmpBackupDir);
  });

  it('deleteBackup rejects path traversal', () => {
    assert.throws(() => deleteBackup(tmpBackupDir, '../etc/passwd'), { code: 'INVALID_FILENAME' });
    assert.throws(() => deleteBackup(tmpBackupDir, 'notabackup.txt'), { code: 'INVALID_FILENAME' });
    cleanupDir(tmpBackupDir);
  });

  it('deleteBackup throws 404 for missing file', () => {
    assert.throws(() => deleteBackup(tmpBackupDir, 'backup-2099-01-01T00-00-00-000.db'), { code: 'NOT_FOUND' });
    cleanupDir(tmpBackupDir);
  });

  it('rotation keeps only N most recent', async () => {
    for (let i = 0; i < 4; i++) {
      await createBackup(db, tmpBackupDir);
    }
    assert.equal(listBackups(tmpBackupDir).length, 4);
    const deleted = rotateBackups(tmpBackupDir, 2);
    assert.equal(deleted.length, 2);
    assert.equal(listBackups(tmpBackupDir).length, 2);
    cleanupDir(tmpBackupDir);
  });

  it('rotation does nothing when under limit', async () => {
    await createBackup(db, tmpBackupDir);
    const deleted = rotateBackups(tmpBackupDir, 5);
    assert.equal(deleted.length, 0);
    assert.equal(listBackups(tmpBackupDir).length, 1);
    cleanupDir(tmpBackupDir);
  });

  it('resolveBackupPath rejects path traversal', () => {
    assert.equal(resolveBackupPath(tmpBackupDir, '../etc/passwd'), null);
    assert.equal(resolveBackupPath(tmpBackupDir, 'notabackup.txt'), null);
    cleanupDir(tmpBackupDir);
  });
});

describe('Admin backup API', () => {
  before(() => setup());
  beforeEach(() => cleanDb());

  it('POST /api/admin/backup creates a backup', async () => {
    const res = await agent().post('/api/admin/backup').send({});
    assert.equal(res.status, 201);
    assert.ok(res.body.filename.startsWith('backup-'));
    assert.ok(res.body.size > 0);
  });

  it('GET /api/admin/backups lists backups', async () => {
    await agent().post('/api/admin/backup').send({});
    const res = await agent().get('/api/admin/backups');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.backups));
    assert.ok(res.body.backups.length >= 1);
  });

  it('GET /api/admin/backups/:filename downloads a backup', async () => {
    const createRes = await agent().post('/api/admin/backup').send({});
    const filename = createRes.body.filename;
    const res = await agent().get(`/api/admin/backups/${filename}`);
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-disposition']);
  });

  it('GET /api/admin/backups/:filename returns 404 for missing', async () => {
    const res = await agent().get('/api/admin/backups/backup-2099-01-01T00-00-00-000.db');
    assert.equal(res.status, 404);
  });

  it('GET /api/admin/backups/:filename rejects path traversal', async () => {
    const res = await agent().get('/api/admin/backups/..%2F..%2Fetc%2Fpasswd');
    assert.ok([400, 404].includes(res.status));
  });

  it('DELETE /api/admin/backups/:filename removes a backup', async () => {
    const createRes = await agent().post('/api/admin/backup').send({});
    const filename = createRes.body.filename;
    const delRes = await agent().delete(`/api/admin/backups/${filename}`);
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.deleted, true);

    const listRes = await agent().get('/api/admin/backups');
    const found = listRes.body.backups.find(b => b.filename === filename);
    assert.equal(found, undefined);
  });

  it('DELETE /api/admin/backups/:filename rejects path traversal', async () => {
    const res = await agent().delete('/api/admin/backups/..%2F..%2Fetc%2Fpasswd');
    assert.equal(res.status, 400);
  });

  it('backup endpoints require auth', async () => {
    const { rawAgent } = require('./helpers');
    const noAuth = rawAgent();
    const r1 = await noAuth.post('/api/admin/backup').send({});
    assert.equal(r1.status, 401);
    const r2 = await noAuth.get('/api/admin/backups');
    assert.equal(r2.status, 401);
  });
});
