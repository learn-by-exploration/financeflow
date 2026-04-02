const fs = require('fs');
const path = require('path');

function runMigrations(db, logger) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Find pending migrations
  const pending = files.filter(file => !db.prepare('SELECT id FROM _migrations WHERE name = ?').get(file));
  if (pending.length === 0) return;

  // Layer 11: Pre-migration backup — protect data before schema changes
  const config = require('../config');
  const backupDir = path.join(config.dbDir, 'backups');
  try {
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    if (userCount > 0) {
      // Checkpoint WAL so the main DB file is complete
      db.pragma('wal_checkpoint(TRUNCATE)');
      fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
      const dbPath = path.join(config.dbDir, 'personalfi.db');
      const backupFile = path.join(backupDir, `pre-migration-${ts}.db`);
      fs.copyFileSync(dbPath, backupFile);
      if (logger) logger.info({ backup: backupFile, pendingMigrations: pending.length }, 'Pre-migration backup created');
    }
  } catch (err) {
    if (logger) logger.warn({ err }, 'Pre-migration backup failed — proceeding with migrations');
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      })();
      if (logger) logger.info({ migration: file }, 'Applied migration');
    } catch (err) {
      if (logger) logger.error({ err, migration: file }, 'Migration failed');
      throw err;
    }
  }
}

module.exports = runMigrations;
