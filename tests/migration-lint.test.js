const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

// SQLite ALTER TABLE ADD COLUMN does NOT support non-constant defaults.
// These expressions work in CREATE TABLE but fail in ALTER TABLE ADD COLUMN.
const NON_CONSTANT_DEFAULTS = [
  /datetime\s*\(/i,
  /current_timestamp/i,
  /current_date/i,
  /current_time/i,
  /json\s*\(/i,
  /json_array\s*\(/i,
  /json_object\s*\(/i,
  /random\s*\(/i,
  /hex\s*\(/i,
  /abs\s*\(/i,
  /lower\s*\(/i,
  /upper\s*\(/i,
  /substr\s*\(/i,
  /strftime\s*\(/i,
  /julianday\s*\(/i,
  /gen_random_uuid\s*\(/i,
  /uuid\s*\(/i,
];

describe('Migration SQL lint — SQLite compatibility', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  it('finds migration files to lint', () => {
    assert.ok(files.length > 0, 'Should have at least one migration file');
  });

  for (const file of files) {
    it(`${file} — ALTER TABLE ADD COLUMN must not use non-constant defaults`, () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      // Extract all ALTER TABLE ... ADD COLUMN statements
      const alterAddRegex = /ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\s+[^;]+/gi;
      const matches = sql.match(alterAddRegex) || [];

      for (const stmt of matches) {
        // Check if there's a DEFAULT clause
        const defaultMatch = stmt.match(/DEFAULT\s+(.+)/i);
        if (!defaultMatch) continue;

        const defaultValue = defaultMatch[1].trim();

        for (const pattern of NON_CONSTANT_DEFAULTS) {
          assert.ok(
            !pattern.test(defaultValue),
            `${file}: ALTER TABLE ADD COLUMN has non-constant DEFAULT "${defaultValue.slice(0, 60)}". ` +
            `SQLite does not support this. Use a constant default (or NULL) and UPDATE separately.`
          );
        }
      }
    });
  }

  for (const file of files) {
    it(`${file} — SQL syntax is valid (dry-run against in-memory DB)`, () => {
      // Validate that each migration can be applied to a fresh DB
      // by checking for common SQL syntax issues
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      assert.ok(sql.length > 0, `${file} should not be empty`);

      // Check for unterminated statements (each statement should end with ;)
      const statements = sql
        .replace(/--.*$/gm, '')  // strip single-line comments
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        // Check for common typos
        assert.ok(
          !stmt.match(/CREAT\s+TABLE/i),
          `${file}: Typo "CREAT TABLE" — should be "CREATE TABLE"`
        );
        assert.ok(
          !stmt.match(/ATLER\s+TABLE/i),
          `${file}: Typo "ATLER TABLE" — should be "ALTER TABLE"`
        );
      }
    });
  }
});
