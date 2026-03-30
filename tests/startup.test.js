const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown } = require('./helpers');
const path = require('path');
const fs = require('fs');
const os = require('os');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ═══════════════════════════════════════════
// SERVER EXPORTS
// ═══════════════════════════════════════════

describe('Server exports', () => {
  it('exports app, db, validateStartup', () => {
    const server = require('../src/server');
    assert.ok(server.app, 'app should be exported');
    assert.ok(server.db, 'db should be exported');
    assert.ok(typeof server.validateStartup === 'function', 'validateStartup should be a function');
    assert.ok(typeof server.invalidateCache === 'function', 'invalidateCache should be exported');
    assert.ok(typeof server.clearAllCache === 'function', 'clearAllCache should be exported');
  });
});

// ═══════════════════════════════════════════
// CONFIG VALIDATION
// ═══════════════════════════════════════════

describe('validateStartup', () => {
  it('passes with valid config', () => {
    const { validateStartup } = require('../src/server');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfi-test-startup-'));
    const cfg = { dbDir: tmpDir, port: 3457 };
    // Should not throw
    validateStartup(cfg);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates data directory if missing', () => {
    const { validateStartup } = require('../src/server');
    const tmpDir = path.join(os.tmpdir(), 'pfi-test-startup-create-' + Date.now());
    assert.ok(!fs.existsSync(tmpDir));
    const cfg = { dbDir: tmpDir, port: 3457 };
    validateStartup(cfg);
    assert.ok(fs.existsSync(tmpDir));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits on invalid port (too high)', () => {
    const { validateStartup } = require('../src/server');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfi-test-startup-'));
    const origExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; };
    try {
      validateStartup({ dbDir: tmpDir, port: 99999 });
      assert.equal(exitCode, 1, 'Should call process.exit(1) for invalid port');
    } finally {
      process.exit = origExit;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits on non-integer port', () => {
    const { validateStartup } = require('../src/server');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfi-test-startup-'));
    const origExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; };
    try {
      validateStartup({ dbDir: tmpDir, port: 34.5 });
      assert.equal(exitCode, 1, 'Should call process.exit(1) for non-integer port');
    } finally {
      process.exit = origExit;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════

describe('Graceful shutdown', () => {
  it('does not crash when SIGTERM listeners exist', () => {
    // Verify that SIGTERM/SIGINT listeners are registered in production mode
    // In test mode they are not registered, so we just verify the module loads cleanly
    const server = require('../src/server');
    assert.ok(server.app, 'Server should be available after load');
    assert.ok(server.db, 'DB should be available after load');
    // DB should still be operational
    const row = server.db.prepare('SELECT 1 as ok').get();
    assert.equal(row.ok, 1);
  });

  it('db remains operational in test mode (no shutdown registered)', () => {
    const server = require('../src/server');
    // Verify we can still query
    const result = server.db.prepare("SELECT sqlite_version() as ver").get();
    assert.ok(result.ver, 'SQLite version should be returned');
  });
});
