const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeGroup, makeGroupMember, makeSharedExpense, makeSecondUser } = require('./helpers');

describe('Phase 7 — Collaborative Features', () => {
  let db;

  before(() => {
    ({ db } = setup());
  });

  beforeEach(() => {
    cleanDb();
  });

  after(() => {
    // no teardown — shared DB
  });

  // ═══════════════════════════════════════════
  // 7.1 Group Invite Links
  // ═══════════════════════════════════════════

  describe('Group Invites', () => {
    it('POST /api/groups/:id/invites creates invite with unique token', async () => {
      const group = makeGroup();
      const res = await agent().post(`/api/groups/${group.id}/invites`).send({});
      assert.equal(res.status, 201);
      assert.ok(res.body.token);
      assert.ok(res.body.invite_url);
      assert.ok(res.body.invite_url.includes(res.body.token));
    });

    it('invite token is at least 24 characters (sufficient entropy)', async () => {
      const group = makeGroup();
      const res = await agent().post(`/api/groups/${group.id}/invites`).send({});
      assert.equal(res.status, 201);
      assert.ok(res.body.token.length >= 24, `Token length ${res.body.token.length} should be >= 24`);
    });

    it('POST /api/groups/join/:token adds user to group', async () => {
      const group = makeGroup();
      const inviteRes = await agent().post(`/api/groups/${group.id}/invites`).send({});
      const token = inviteRes.body.token;

      const { agent: user2 } = makeSecondUser();
      const joinRes = await user2.post(`/api/groups/join/${token}`).send({});
      assert.equal(joinRes.status, 200);
      assert.ok(joinRes.body.group);
      assert.equal(joinRes.body.group.id, group.id);
    });

    it('expired invite returns 410', async () => {
      const group = makeGroup();
      const res = await agent().post(`/api/groups/${group.id}/invites`).send({
        expires_at: '2020-01-01T00:00:00.000Z',
      });
      const token = res.body.token;

      const { agent: user2 } = makeSecondUser();
      const joinRes = await user2.post(`/api/groups/join/${token}`).send({});
      assert.equal(joinRes.status, 410);
    });

    it('invalid/unknown token returns 404', async () => {
      const { agent: user2 } = makeSecondUser();
      const res = await user2.post('/api/groups/join/nonexistenttoken123456').send({});
      assert.equal(res.status, 404);
    });

    it('user already in group returns 409', async () => {
      const group = makeGroup();
      const inviteRes = await agent().post(`/api/groups/${group.id}/invites`).send({});
      const token = inviteRes.body.token;

      // Test user (creator) is already in the group
      const joinRes = await agent().post(`/api/groups/join/${token}`).send({});
      assert.equal(joinRes.status, 409);
    });

    it('only group creator/owner can generate invites (non-creator gets 403)', async () => {
      const group = makeGroup();
      const { agent: user2, userId: user2Id } = makeSecondUser();
      // Add user2 as member (not owner)
      makeGroupMember(group.id, { user_id: user2Id, display_name: 'User 2' });

      const res = await user2.post(`/api/groups/${group.id}/invites`).send({});
      assert.equal(res.status, 403);
    });

    it('DELETE /api/groups/:id/invites/:id revokes invite', async () => {
      const group = makeGroup();
      const inviteRes = await agent().post(`/api/groups/${group.id}/invites`).send({});
      const inviteId = inviteRes.body.id;

      const delRes = await agent().delete(`/api/groups/${group.id}/invites/${inviteId}`);
      assert.equal(delRes.status, 200);
      assert.ok(delRes.body.ok);

      // Verify invite is gone — joining should 404
      const { agent: user2 } = makeSecondUser();
      const joinRes = await user2.post(`/api/groups/join/${inviteRes.body.token}`).send({});
      assert.equal(joinRes.status, 404);
    });

    it('max_uses enforcement: invite with max_uses=1 can only be used once', async () => {
      const group = makeGroup();
      const inviteRes = await agent().post(`/api/groups/${group.id}/invites`).send({
        max_uses: 1,
      });
      const token = inviteRes.body.token;

      // First user joins — should succeed
      const { agent: user2 } = makeSecondUser();
      const joinRes = await user2.post(`/api/groups/join/${token}`).send({});
      assert.equal(joinRes.status, 200);

      // Third user joins — should fail
      const { agent: user3 } = makeSecondUser({ username: 'testuser3', display_name: 'Test User 3' });
      const joinRes2 = await user3.post(`/api/groups/join/${token}`).send({});
      assert.equal(joinRes2.status, 410);
    });

    it('GET /api/groups/:id/invites lists active invites', async () => {
      const group = makeGroup();
      await agent().post(`/api/groups/${group.id}/invites`).send({});
      await agent().post(`/api/groups/${group.id}/invites`).send({});

      const res = await agent().get(`/api/groups/${group.id}/invites`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.invites));
      assert.equal(res.body.invites.length, 2);
    });
  });

  // ═══════════════════════════════════════════
  // 7.2 Dashboard Group Balance Widget
  // ═══════════════════════════════════════════

  describe('Dashboard Group Balance', () => {
    it('GET /api/stats/overview includes groups_balance', async () => {
      const res = await agent().get('/api/stats/overview');
      assert.equal(res.status, 200);
      assert.ok(res.body.groups_balance !== undefined, 'Should include groups_balance');
      assert.ok('total_owed' in res.body.groups_balance);
      assert.ok('total_owing' in res.body.groups_balance);
      assert.ok('net' in res.body.groups_balance);
      assert.ok('group_count' in res.body.groups_balance);
    });

    it('groups_balance shows correct values when user has group debts', async () => {
      // Create a group with the test user as owner
      const group = makeGroup();
      // Get owner's member id
      const ownerMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');

      // Add second member
      const { userId: user2Id } = makeSecondUser();
      const member2 = makeGroupMember(group.id, { user_id: user2Id, display_name: 'User 2' });

      // User 2 paid an expense of 1000, split equally between 2 members
      // So test user owes 500 to user 2
      makeSharedExpense(group.id, member2.id, { amount: 1000, description: 'Dinner' });

      const res = await agent().get('/api/stats/overview');
      assert.equal(res.status, 200);
      const gb = res.body.groups_balance;
      assert.equal(gb.group_count, 1);
      // Test user owes 500 (user2 paid 1000, split equally, test user's share = 500)
      assert.ok(gb.total_owing > 0, 'Should have total_owing > 0');
    });

    it('groups_balance shows zeros when no groups', async () => {
      const res = await agent().get('/api/stats/overview');
      assert.equal(res.status, 200);
      const gb = res.body.groups_balance;
      assert.equal(gb.total_owed, 0);
      assert.equal(gb.total_owing, 0);
      assert.equal(gb.net, 0);
      assert.equal(gb.group_count, 0);
    });
  });

  // ═══════════════════════════════════════════
  // 7.3 Expense Comments
  // ═══════════════════════════════════════════

  describe('Expense Comments', () => {
    it('POST comment on group expense succeeds for member', async () => {
      const group = makeGroup();
      const ownerMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      const expense = makeSharedExpense(group.id, ownerMember.id, { amount: 500 });

      const res = await agent()
        .post(`/api/groups/${group.id}/expenses/${expense.id}/comments`)
        .send({ comment: 'This was for the pizza' });
      assert.equal(res.status, 201);
      assert.ok(res.body.comment);
      assert.equal(res.body.comment.comment, 'This was for the pizza');
      assert.ok(res.body.comment.display_name);
    });

    it('POST comment fails for non-member (403)', async () => {
      const group = makeGroup();
      const ownerMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      const expense = makeSharedExpense(group.id, ownerMember.id, { amount: 500 });

      const { agent: user2 } = makeSecondUser();
      const res = await user2
        .post(`/api/groups/${group.id}/expenses/${expense.id}/comments`)
        .send({ comment: 'I should not be able to comment' });
      assert.equal(res.status, 403);
    });

    it('GET comments returns comments in chronological order', async () => {
      const group = makeGroup();
      const ownerMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      const expense = makeSharedExpense(group.id, ownerMember.id, { amount: 500 });

      await agent()
        .post(`/api/groups/${group.id}/expenses/${expense.id}/comments`)
        .send({ comment: 'First comment' });
      await agent()
        .post(`/api/groups/${group.id}/expenses/${expense.id}/comments`)
        .send({ comment: 'Second comment' });

      const res = await agent().get(`/api/groups/${group.id}/expenses/${expense.id}/comments`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.comments));
      assert.equal(res.body.comments.length, 2);
      assert.equal(res.body.comments[0].comment, 'First comment');
      assert.equal(res.body.comments[1].comment, 'Second comment');
    });

    it('empty comment is rejected', async () => {
      const group = makeGroup();
      const ownerMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      const expense = makeSharedExpense(group.id, ownerMember.id, { amount: 500 });

      const res = await agent()
        .post(`/api/groups/${group.id}/expenses/${expense.id}/comments`)
        .send({ comment: '' });
      assert.equal(res.status, 400);
    });

    it('comment length > 500 is rejected', async () => {
      const group = makeGroup();
      const ownerMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
      const expense = makeSharedExpense(group.id, ownerMember.id, { amount: 500 });

      const longComment = 'x'.repeat(501);
      const res = await agent()
        .post(`/api/groups/${group.id}/expenses/${expense.id}/comments`)
        .send({ comment: longComment });
      assert.equal(res.status, 400);
    });
  });
});
