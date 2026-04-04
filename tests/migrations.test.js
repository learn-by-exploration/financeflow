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

  // ─── Migration 037: Scaling fixes ───

  it('applies 037_scaling_fixes migration', () => {
    const migration = db.prepare("SELECT * FROM _migrations WHERE name = '037_scaling_fixes.sql'").get();
    assert.ok(migration, '037_scaling_fixes.sql should be recorded');
  });

  it('creates idx_recurring_rules_active_next index', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_recurring_rules_active_next'").get();
    assert.ok(idx, 'idx_recurring_rules_active_next should exist');
  });

  it('creates idx_audit_log_created index', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_audit_log_created'").get();
    assert.ok(idx, 'idx_audit_log_created should exist');
  });

  it('creates idx_notifications_user_created index', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_notifications_user_created'").get();
    assert.ok(idx, 'idx_notifications_user_created should exist');
  });

  it('adds position column to financial_todos', () => {
    const cols = db.prepare('PRAGMA table_info(financial_todos)').all().map(c => c.name);
    assert.ok(cols.includes('position'), 'financial_todos should have position column');
  });

  it('adds updated_at to budget_items', () => {
    const cols = db.prepare('PRAGMA table_info(budget_items)').all().map(c => c.name);
    assert.ok(cols.includes('updated_at'), 'budget_items should have updated_at');
  });

  it('adds updated_at to tags', () => {
    const cols = db.prepare('PRAGMA table_info(tags)').all().map(c => c.name);
    assert.ok(cols.includes('updated_at'), 'tags should have updated_at');
  });

  it('adds updated_at to expense_splits', () => {
    const cols = db.prepare('PRAGMA table_info(expense_splits)').all().map(c => c.name);
    assert.ok(cols.includes('updated_at'), 'expense_splits should have updated_at');
  });

  it('adds updated_at to api_tokens', () => {
    const cols = db.prepare('PRAGMA table_info(api_tokens)').all().map(c => c.name);
    assert.ok(cols.includes('updated_at'), 'api_tokens should have updated_at');
  });
});
