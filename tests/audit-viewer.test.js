const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeSecondUser } = require('./helpers');

describe('Audit Log Viewer — v0.2.9', () => {
  let db;
  before(() => { db = setup().db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  function seedAuditEntries() {
    const insert = db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)');
    insert.run(1, 'account.create', 'account', 1, '2025-01-01T10:00:00.000Z');
    insert.run(1, 'account.update', 'account', 1, '2025-01-02T10:00:00.000Z');
    insert.run(1, 'transaction.create', 'transaction', 1, '2025-01-03T10:00:00.000Z');
    insert.run(1, 'budget.create', 'budget', 1, '2025-01-04T10:00:00.000Z');
    insert.run(1, 'goal.create', 'savings_goal', 1, '2025-01-05T10:00:00.000Z');
  }

  it('returns paginated audit log', async () => {
    seedAuditEntries();
    const res = await agent().get('/api/audit?limit=2&offset=0').expect(200);
    assert.equal(res.body.entries.length, 2);
    assert.equal(typeof res.body.total, 'number');
    assert.equal(res.body.total, 5);
    // Newest first
    assert.equal(res.body.entries[0].action, 'goal.create');
  });

  it('supports offset pagination', async () => {
    seedAuditEntries();
    const res = await agent().get('/api/audit?limit=2&offset=2').expect(200);
    assert.equal(res.body.entries.length, 2);
    assert.equal(res.body.entries[0].action, 'transaction.create');
  });

  it('filters by entity_type', async () => {
    seedAuditEntries();
    const res = await agent().get('/api/audit?entity_type=account').expect(200);
    assert.equal(res.body.entries.length, 2);
    assert.ok(res.body.entries.every(e => e.entity_type === 'account'));
  });

  it('filters by action prefix', async () => {
    seedAuditEntries();
    const res = await agent().get('/api/audit?action=account').expect(200);
    assert.equal(res.body.entries.length, 2);
    assert.ok(res.body.entries.every(e => e.action.startsWith('account')));
  });

  it('filters by date range', async () => {
    seedAuditEntries();
    const res = await agent().get('/api/audit?from=2025-01-02&to=2025-01-04').expect(200);
    assert.equal(res.body.entries.length, 3);
  });

  it('returns empty for no matches', async () => {
    const res = await agent().get('/api/audit?entity_type=nonexistent').expect(200);
    assert.equal(res.body.entries.length, 0);
    assert.equal(res.body.total, 0);
  });

  it('cross-user isolation — cannot see other users audit entries', async () => {
    seedAuditEntries();
    // Add entry for user 2
    const { agent: agent2 } = makeSecondUser();
    db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)').run(2, 'account.create', 'account', 99);

    const res1 = await agent().get('/api/audit').expect(200);
    assert.equal(res1.body.total, 5); // Only user 1's entries

    const res2 = await agent2.get('/api/audit').expect(200);
    assert.equal(res2.body.total, 1); // Only user 2's entry
  });

  it('defaults to limit 50', async () => {
    seedAuditEntries();
    const res = await agent().get('/api/audit').expect(200);
    assert.ok(res.body.entries.length <= 50);
  });
});
