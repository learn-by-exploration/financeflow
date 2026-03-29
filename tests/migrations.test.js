const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown } = require('./helpers');

describe('Migrations', () => {
  let db;

  before(() => {
    ({ db } = setup());
  });

  after(() => {
    teardown();
  });

  it('creates _migrations table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'").get();
    assert.ok(table, '_migrations table should exist');
  });

  it('applies 001_category_rules migration', () => {
    const migration = db.prepare("SELECT * FROM _migrations WHERE name = '001_category_rules.sql'").get();
    assert.ok(migration, '001_category_rules.sql should be recorded');
    assert.ok(migration.applied_at, 'should have applied_at timestamp');
  });

  it('creates category_rules table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='category_rules'").get();
    assert.ok(table, 'category_rules table should exist');
  });

  it('does not duplicate migrations on re-run', () => {
    const runMigrations = require('../src/db/migrate');
    runMigrations(db);
    const count = db.prepare("SELECT COUNT(*) as cnt FROM _migrations WHERE name = '001_category_rules.sql'").get();
    assert.equal(count.cnt, 1, 'migration should only appear once');
  });
});
