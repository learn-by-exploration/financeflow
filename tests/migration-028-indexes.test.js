// tests/migration-028-indexes.test.js — Verify migration 028 indexes exist
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown } = require('./helpers');

describe('Migration 028 — Settlement & Group Indexes', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);

  function indexExists(name) {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(name);
  }

  it('creates idx_settlements_group index', () => {
    assert.ok(indexExists('idx_settlements_group'), 'idx_settlements_group should exist');
  });

  it('creates idx_group_members_group_user composite index', () => {
    assert.ok(indexExists('idx_group_members_group_user'), 'idx_group_members_group_user should exist');
  });

  it('creates idx_settlements_from_member index', () => {
    assert.ok(indexExists('idx_settlements_from_member'), 'idx_settlements_from_member should exist');
  });

  it('creates idx_settlements_to_member index', () => {
    assert.ok(indexExists('idx_settlements_to_member'), 'idx_settlements_to_member should exist');
  });

  it('idx_settlements_group improves group settlement queries', () => {
    // EXPLAIN QUERY PLAN should use the index for group_id lookups
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM settlements WHERE group_id = 1').all();
    const planText = plan.map(r => r.detail).join(' ');
    assert.ok(
      planText.includes('idx_settlements_group') || planText.includes('USING INDEX'),
      `Expected index usage in query plan, got: ${planText}`
    );
  });

  it('idx_group_members_group_user improves membership lookups', () => {
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM group_members WHERE group_id = 1 AND user_id = 1').all();
    const planText = plan.map(r => r.detail).join(' ');
    assert.ok(
      planText.includes('idx_group_members_group_user') || planText.includes('USING INDEX'),
      `Expected index usage in query plan, got: ${planText}`
    );
  });
});
