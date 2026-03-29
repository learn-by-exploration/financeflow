const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeGroup, makeGroupMember, makeSecondUser } = require('./helpers');

describe('Groups', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── GET /api/groups ──────────────────────────────

  describe('GET /api/groups', () => {
    it('returns empty list initially (200)', async () => {
      const res = await agent().get('/api/groups').expect(200);
      assert.deepEqual(res.body.groups, []);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/groups').expect(401);
    });

    it('returns only groups user belongs to', async () => {
      makeGroup({ name: 'My Group' });
      // Create another group by second user
      const user2 = makeSecondUser();
      const { db } = setup();
      const r = db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)').run('Other Group', user2.userId);
      db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)').run(r.lastInsertRowid, user2.userId, 'User2', 'owner');
      const res = await agent().get('/api/groups').expect(200);
      assert.equal(res.body.groups.length, 1);
      assert.equal(res.body.groups[0].name, 'My Group');
    });
  });

  // ─── POST /api/groups ─────────────────────────────

  describe('POST /api/groups', () => {
    it('creates group and adds creator as owner (201)', async () => {
      const res = await agent().post('/api/groups')
        .send({ name: 'Roommates' })
        .expect(201);
      assert.equal(res.body.group.name, 'Roommates');

      // Verify creator is owner
      const detailRes = await agent().get(`/api/groups/${res.body.group.id}`).expect(200);
      const owner = detailRes.body.members.find(m => m.role === 'owner');
      assert.ok(owner);
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/groups')
        .send({})
        .expect(400);
    });
  });

  // ─── GET /api/groups/:id ──────────────────────────

  describe('GET /api/groups/:id', () => {
    it('returns group with members (200)', async () => {
      const group = makeGroup({ name: 'Lunch Club' });
      const res = await agent().get(`/api/groups/${group.id}`).expect(200);
      assert.equal(res.body.group.name, 'Lunch Club');
      assert.ok(res.body.members.length >= 1); // at least the owner
    });

    it('returns 404 for non-existent', async () => {
      await agent().get('/api/groups/99999').expect(404);
    });

    it('returns 403 for non-member', async () => {
      const user2 = makeSecondUser();
      const { db } = setup();
      const r = db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)').run('Secret Group', user2.userId);
      db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)').run(r.lastInsertRowid, user2.userId, 'User2', 'owner');
      await agent().get(`/api/groups/${r.lastInsertRowid}`).expect(403);
    });
  });

  // ─── POST /api/groups/:id/members ─────────────────

  describe('POST /api/groups/:id/members', () => {
    it('adds registered user by username (201)', async () => {
      const group = makeGroup();
      const user2 = makeSecondUser();
      const res = await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(201);
      assert.ok(res.body.id);
    });

    it('adds guest member by display_name (201)', async () => {
      const group = makeGroup();
      const res = await agent().post(`/api/groups/${group.id}/members`)
        .send({ display_name: 'Alice Guest' })
        .expect(201);
      assert.ok(res.body.id);
    });

    it('rejects duplicate user (409)', async () => {
      const group = makeGroup();
      const user2 = makeSecondUser();
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(201);
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(409);
    });
  });

  // ─── DELETE /api/groups/:id/members/:memberId ─────

  describe('DELETE /api/groups/:id/members/:memberId', () => {
    it('removes member (200)', async () => {
      const group = makeGroup();
      const member = makeGroupMember(group.id, { display_name: 'To Remove' });
      await agent().delete(`/api/groups/${group.id}/members/${member.id}`).expect(200);
      const { db } = setup();
      const row = db.prepare('SELECT * FROM group_members WHERE id = ?').get(member.id);
      assert.equal(row, undefined);
    });

    it('cannot remove last owner (400)', async () => {
      const group = makeGroup();
      // Owner member is auto-created by makeGroup
      const { db } = setup();
      const owner = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      await agent().delete(`/api/groups/${group.id}/members/${owner.id}`).expect(400);
    });
  });

  // ─── Multi-user tests (C23) ───────────────────────

  describe('Multi-user access', () => {
    it('non-member cannot access group (403)', async () => {
      const group = makeGroup();
      const user2 = makeSecondUser();
      await user2.agent.get(`/api/groups/${group.id}`).expect(403);
    });

    it('added member can access group (200)', async () => {
      const group = makeGroup();
      const user2 = makeSecondUser();
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(201);
      const res = await user2.agent.get(`/api/groups/${group.id}`).expect(200);
      assert.equal(res.body.group.name, group.name);
    });

    it('both users see same member list', async () => {
      const group = makeGroup();
      const user2 = makeSecondUser();
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(201);
      const res1 = await agent().get(`/api/groups/${group.id}`).expect(200);
      const res2 = await user2.agent.get(`/api/groups/${group.id}`).expect(200);
      assert.equal(res1.body.members.length, res2.body.members.length);
    });
  });

  // ─── Permission matrix (C26) ─────────────────────

  describe('Permission matrix', () => {
    it('owner can delete group (200)', async () => {
      const group = makeGroup();
      await agent().delete(`/api/groups/${group.id}`).expect(200);
      const { db } = setup();
      const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(group.id);
      assert.equal(row, undefined);
    });

    it('member cannot delete group (403)', async () => {
      const group = makeGroup();
      const user2 = makeSecondUser();
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(201);
      await user2.agent.delete(`/api/groups/${group.id}`).expect(403);
    });

    it('member cannot remove other members (403)', async () => {
      const group = makeGroup();
      const user2 = makeSecondUser();
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(201);
      const guest = makeGroupMember(group.id, { display_name: 'Guest' });
      await user2.agent.delete(`/api/groups/${group.id}/members/${guest.id}`).expect(403);
    });
  });
});
