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

  for (const file of files) {
    const applied = db.prepare('SELECT id FROM _migrations WHERE name = ?').get(file);
    if (applied) continue;

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
