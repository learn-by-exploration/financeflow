const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeGroup, makeGroupMember, makeSecondUser, today } = require('./helpers');

// ─── Schema unit tests ──────────────────────────────

const { createGroupSchema, addMemberSchema, updateGroupSchema } = require('../src/schemas/group.schema');
const { createExpenseSchema, createSettlementSchema } = require('../src/schemas/split.schema');
const { notificationQuerySchema } = require('../src/schemas/notification.schema');
const { searchQuerySchema } = require('../src/schemas/search.schema');
const { backupFilenameSchema } = require('../src/schemas/admin.schema');

describe('v0.3.26 — Zod Schema Validation', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ═══════════════════════════════════════════
  // GROUP SCHEMAS
  // ═══════════════════════════════════════════

  describe('createGroupSchema', () => {
    it('accepts valid group', () => {
      const result = createGroupSchema.safeParse({ name: 'Roommates' });
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'Roommates');
    });

    it('accepts group with optional fields', () => {
      const result = createGroupSchema.safeParse({ name: 'Work', icon: '💼', color: '#FF0000' });
      assert.equal(result.success, true);
    });

    it('rejects missing name', () => {
      const result = createGroupSchema.safeParse({});
      assert.equal(result.success, false);
    });

    it('rejects empty name', () => {
      const result = createGroupSchema.safeParse({ name: '' });
      assert.equal(result.success, false);
    });

    it('rejects name over 100 chars', () => {
      const result = createGroupSchema.safeParse({ name: 'A'.repeat(101) });
      assert.equal(result.success, false);
    });

    it('accepts name at exactly 100 chars', () => {
      const result = createGroupSchema.safeParse({ name: 'A'.repeat(100) });
      assert.equal(result.success, true);
    });

    it('rejects name with SQL injection attempt', () => {
      // SQL injection should NOT crash schema — it's a valid string
      const result = createGroupSchema.safeParse({ name: "'; DROP TABLE groups; --" });
      assert.equal(result.success, true); // string is valid, SQL injection is handled by parameterized queries
    });
  });

  describe('addMemberSchema', () => {
    it('accepts valid username', () => {
      const result = addMemberSchema.safeParse({ username: 'alice' });
      assert.equal(result.success, true);
    });

    it('accepts display_name without username', () => {
      const result = addMemberSchema.safeParse({ display_name: 'Alice Guest' });
      assert.equal(result.success, true);
    });

    it('rejects empty username when provided', () => {
      const result = addMemberSchema.safeParse({ username: '' });
      assert.equal(result.success, false);
    });
  });

  describe('updateGroupSchema', () => {
    it('accepts partial update', () => {
      const result = updateGroupSchema.safeParse({ name: 'New Name' });
      assert.equal(result.success, true);
    });

    it('accepts empty body (all optional)', () => {
      const result = updateGroupSchema.safeParse({});
      assert.equal(result.success, true);
    });

    it('rejects empty name string', () => {
      const result = updateGroupSchema.safeParse({ name: '' });
      assert.equal(result.success, false);
    });

    it('rejects name over 100 chars', () => {
      const result = updateGroupSchema.safeParse({ name: 'Z'.repeat(101) });
      assert.equal(result.success, false);
    });
  });

  // ═══════════════════════════════════════════
  // SPLIT SCHEMAS
  // ═══════════════════════════════════════════

  describe('createExpenseSchema', () => {
    it('accepts valid expense', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Dinner', amount: 100, paid_by: 1, date: '2025-01-01',
      });
      assert.equal(result.success, true);
      assert.equal(result.data.split_method, 'equal'); // default
    });

    it('accepts expense with splits', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Trip', amount: 300, paid_by: 1, date: '2025-01-01',
        split_method: 'exact',
        splits: [
          { member_id: 1, amount: 150 },
          { member_id: 2, amount: 150 },
        ],
      });
      assert.equal(result.success, true);
    });

    it('rejects missing description', () => {
      const result = createExpenseSchema.safeParse({ amount: 100, paid_by: 1, date: '2025-01-01' });
      assert.equal(result.success, false);
    });

    it('rejects zero amount', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Bad', amount: 0, paid_by: 1, date: '2025-01-01',
      });
      assert.equal(result.success, false);
    });

    it('rejects negative amount', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Bad', amount: -50, paid_by: 1, date: '2025-01-01',
      });
      assert.equal(result.success, false);
    });

    it('rejects missing paid_by', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Test', amount: 100, date: '2025-01-01',
      });
      assert.equal(result.success, false);
    });

    it('rejects missing date', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Test', amount: 100, paid_by: 1,
      });
      assert.equal(result.success, false);
    });

    it('rejects invalid split_method', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Test', amount: 100, paid_by: 1, date: '2025-01-01',
        split_method: 'invalid',
      });
      assert.equal(result.success, false);
    });

    it('rejects non-positive member_id in splits', () => {
      const result = createExpenseSchema.safeParse({
        description: 'Test', amount: 100, paid_by: 1, date: '2025-01-01',
        splits: [{ member_id: -1, amount: 100 }],
      });
      assert.equal(result.success, false);
    });
  });

  describe('createSettlementSchema', () => {
    it('accepts valid settlement', () => {
      const result = createSettlementSchema.safeParse({
        from_member: 1, to_member: 2, amount: 50,
      });
      assert.equal(result.success, true);
    });

    it('rejects missing from_member', () => {
      const result = createSettlementSchema.safeParse({ to_member: 2, amount: 50 });
      assert.equal(result.success, false);
    });

    it('rejects missing to_member', () => {
      const result = createSettlementSchema.safeParse({ from_member: 1, amount: 50 });
      assert.equal(result.success, false);
    });

    it('rejects zero amount', () => {
      const result = createSettlementSchema.safeParse({
        from_member: 1, to_member: 2, amount: 0,
      });
      assert.equal(result.success, false);
    });

    it('rejects negative amount', () => {
      const result = createSettlementSchema.safeParse({
        from_member: 1, to_member: 2, amount: -10,
      });
      assert.equal(result.success, false);
    });
  });

  // ═══════════════════════════════════════════
  // NOTIFICATION SCHEMA
  // ═══════════════════════════════════════════

  describe('notificationQuerySchema', () => {
    it('accepts empty query (uses defaults)', () => {
      const result = notificationQuerySchema.safeParse({});
      assert.equal(result.success, true);
      assert.equal(result.data.limit, 20);
      assert.equal(result.data.offset, 0);
    });

    it('coerces string numbers', () => {
      const result = notificationQuerySchema.safeParse({ limit: '10', offset: '5' });
      assert.equal(result.success, true);
      assert.equal(result.data.limit, 10);
      assert.equal(result.data.offset, 5);
    });

    it('rejects negative limit', () => {
      const result = notificationQuerySchema.safeParse({ limit: '-5' });
      assert.equal(result.success, false);
    });

    it('rejects zero limit', () => {
      const result = notificationQuerySchema.safeParse({ limit: '0' });
      assert.equal(result.success, false);
    });

    it('rejects negative offset', () => {
      const result = notificationQuerySchema.safeParse({ offset: '-1' });
      assert.equal(result.success, false);
    });

    it('accepts zero offset', () => {
      const result = notificationQuerySchema.safeParse({ offset: '0' });
      assert.equal(result.success, true);
      assert.equal(result.data.offset, 0);
    });

    it('rejects non-numeric limit', () => {
      const result = notificationQuerySchema.safeParse({ limit: 'abc' });
      assert.equal(result.success, false);
    });
  });

  // ═══════════════════════════════════════════
  // SEARCH SCHEMA
  // ═══════════════════════════════════════════

  describe('searchQuerySchema', () => {
    it('accepts valid query', () => {
      const result = searchQuerySchema.safeParse({ q: 'groceries' });
      assert.equal(result.success, true);
    });

    it('rejects missing q', () => {
      const result = searchQuerySchema.safeParse({});
      assert.equal(result.success, false);
    });

    it('rejects empty q', () => {
      const result = searchQuerySchema.safeParse({ q: '' });
      assert.equal(result.success, false);
    });

    it('accepts q at max length (200)', () => {
      const result = searchQuerySchema.safeParse({ q: 'a'.repeat(200) });
      assert.equal(result.success, true);
    });

    it('rejects q over 200 chars', () => {
      const result = searchQuerySchema.safeParse({ q: 'a'.repeat(201) });
      assert.equal(result.success, false);
    });

    it('accepts q with special characters (handled by parameterized queries)', () => {
      const result = searchQuerySchema.safeParse({ q: "'; DROP TABLE users; --" });
      assert.equal(result.success, true); // valid string, SQL injection handled elsewhere
    });
  });

  // ═══════════════════════════════════════════
  // ADMIN SCHEMA
  // ═══════════════════════════════════════════

  describe('backupFilenameSchema', () => {
    it('accepts valid backup filename', () => {
      const result = backupFilenameSchema.safeParse({ filename: 'backup-2025-01-01.db' });
      assert.equal(result.success, true);
    });

    it('accepts filename with underscores and hyphens', () => {
      const result = backupFilenameSchema.safeParse({ filename: 'backup-my_data-2025.db' });
      assert.equal(result.success, true);
    });

    it('rejects filename without backup- prefix', () => {
      const result = backupFilenameSchema.safeParse({ filename: 'data-2025.db' });
      assert.equal(result.success, false);
    });

    it('rejects filename without .db extension', () => {
      const result = backupFilenameSchema.safeParse({ filename: 'backup-2025.zip' });
      assert.equal(result.success, false);
    });

    it('rejects path traversal attempt', () => {
      const result = backupFilenameSchema.safeParse({ filename: '../etc/passwd' });
      assert.equal(result.success, false);
    });

    it('rejects path traversal with backup prefix', () => {
      const result = backupFilenameSchema.safeParse({ filename: 'backup-../../etc/passwd.db' });
      assert.equal(result.success, false);
    });

    it('rejects missing filename', () => {
      const result = backupFilenameSchema.safeParse({});
      assert.equal(result.success, false);
    });

    it('rejects empty filename', () => {
      const result = backupFilenameSchema.safeParse({ filename: '' });
      assert.equal(result.success, false);
    });
  });

  // ═══════════════════════════════════════════
  // INTEGRATION TESTS — API endpoints
  // ═══════════════════════════════════════════

  describe('Groups API validation', () => {
    it('POST /api/groups rejects empty name (400)', async () => {
      const res = await agent().post('/api/groups').send({ name: '' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('POST /api/groups rejects name over 100 chars (400)', async () => {
      const res = await agent().post('/api/groups').send({ name: 'X'.repeat(101) });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('POST /api/groups accepts valid name (201)', async () => {
      const res = await agent().post('/api/groups').send({ name: 'Valid Group' });
      assert.equal(res.status, 201);
    });

    it('PUT /api/groups/:id updates group (200)', async () => {
      const group = makeGroup({ name: 'Old Name' });
      const res = await agent().put(`/api/groups/${group.id}`).send({ name: 'New Name' });
      assert.equal(res.status, 200);
      assert.equal(res.body.group.name, 'New Name');
    });

    it('PUT /api/groups/:id rejects empty name (400)', async () => {
      const group = makeGroup();
      const res = await agent().put(`/api/groups/${group.id}`).send({ name: '' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('POST /api/groups/:id/members rejects empty username (400)', async () => {
      const group = makeGroup();
      const res = await agent().post(`/api/groups/${group.id}/members`).send({ username: '' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('Splits API validation', () => {
    function setupGroup() {
      const group = makeGroup({ name: 'Test' });
      const { db } = setup();
      const owner = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      return { group, owner };
    }

    it('POST expenses rejects missing description (400)', async () => {
      const { group, owner } = setupGroup();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ amount: 100, paid_by: owner.id, date: today() });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('POST expenses rejects zero amount (400)', async () => {
      const { group, owner } = setupGroup();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ description: 'Test', amount: 0, paid_by: owner.id, date: today() });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('POST expenses rejects negative amount (400)', async () => {
      const { group, owner } = setupGroup();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ description: 'Test', amount: -50, paid_by: owner.id, date: today() });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('POST settle rejects missing from_member (400)', async () => {
      const { group, owner } = setupGroup();
      const res = await agent().post(`/api/splits/${group.id}/settle`)
        .send({ to_member: owner.id, amount: 50 });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('POST settle rejects zero amount (400)', async () => {
      const { group, owner } = setupGroup();
      const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
      const res = await agent().post(`/api/splits/${group.id}/settle`)
        .send({ from_member: m2.id, to_member: owner.id, amount: 0 });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('Notifications API validation', () => {
    it('GET /api/notifications rejects non-numeric limit (400)', async () => {
      const res = await agent().get('/api/notifications?limit=abc');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('GET /api/notifications rejects negative offset (400)', async () => {
      const res = await agent().get('/api/notifications?offset=-1');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('GET /api/notifications accepts valid params (200)', async () => {
      const res = await agent().get('/api/notifications?limit=10&offset=0');
      assert.equal(res.status, 200);
    });
  });

  describe('Search API validation', () => {
    it('GET /api/search rejects missing q (400)', async () => {
      const res = await agent().get('/api/search');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('GET /api/search rejects q over 200 chars (400)', async () => {
      const res = await agent().get(`/api/search?q=${'a'.repeat(201)}`);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('GET /api/search accepts valid q (200)', async () => {
      const res = await agent().get('/api/search?q=test');
      assert.equal(res.status, 200);
    });

    it('GET /api/search rejects SQL injection as overlength if >200 chars', () => {
      const injection = "' OR 1=1; DROP TABLE transactions; --".repeat(10);
      const result = searchQuerySchema.safeParse({ q: injection });
      if (injection.length > 200) {
        assert.equal(result.success, false);
      } else {
        assert.equal(result.success, true); // parameterized queries protect against SQL injection
      }
    });
  });

  describe('Admin backup validation', () => {
    it('GET /api/admin/backups/:filename rejects invalid filename (400)', async () => {
      const res = await agent().get('/api/admin/backups/not-a-backup.txt');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('DELETE /api/admin/backups/:filename rejects invalid filename (400)', async () => {
      const res = await agent().delete('/api/admin/backups/not-a-backup.txt');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('validates backup filename format via schema', () => {
      // Valid
      assert.equal(backupFilenameSchema.safeParse({ filename: 'backup-20250101-120000.db' }).success, true);
      // Invalid — no prefix
      assert.equal(backupFilenameSchema.safeParse({ filename: 'malicious.db' }).success, false);
      // Invalid — path traversal
      assert.equal(backupFilenameSchema.safeParse({ filename: 'backup-../../../etc.db' }).success, false);
    });
  });

  // ═══════════════════════════════════════════
  // INJECTION & ABUSE TESTS
  // ═══════════════════════════════════════════

  describe('Injection & abuse protection', () => {
    it('group name with script tag is valid string (XSS handled at output)', () => {
      const result = createGroupSchema.safeParse({ name: '<script>alert(1)</script>' });
      assert.equal(result.success, true); // output encoding handles XSS
    });

    it('expense description with SQL injection is valid string', () => {
      const result = createExpenseSchema.safeParse({
        description: "'; DROP TABLE shared_expenses; --",
        amount: 100, paid_by: 1, date: '2025-01-01',
      });
      assert.equal(result.success, true); // parameterized queries protect DB
    });

    it('backup filename with null bytes is rejected', () => {
      const result = backupFilenameSchema.safeParse({ filename: 'backup-test\x00.db' });
      assert.equal(result.success, false);
    });

    it('search query with extremely long input is rejected', () => {
      const result = searchQuerySchema.safeParse({ q: 'x'.repeat(201) });
      assert.equal(result.success, false);
    });

    it('notification limit with float is rejected', () => {
      const result = notificationQuerySchema.safeParse({ limit: '3.5' });
      assert.equal(result.success, false);
    });

    it('settlement with string amount is rejected', () => {
      const result = createSettlementSchema.safeParse({
        from_member: 1, to_member: 2, amount: 'fifty',
      });
      assert.equal(result.success, false);
    });
  });
});
