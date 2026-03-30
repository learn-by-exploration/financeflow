const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeGroup, makeGroupMember, makeSharedExpense, makeSecondUser, today } = require('./helpers');

describe('Group Activity Feed & Split Reminders', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Helpers ───

  function setupGroup() {
    const group = makeGroup({ name: 'Roommates' });
    const { db } = setup();
    const owner = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND role = ?').get(group.id, 'owner');
    return { group, owner };
  }

  function setupGroupWith3() {
    const { group, owner } = setupGroup();
    const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
    const m3 = makeGroupMember(group.id, { display_name: 'Bob' });
    return { group, owner, m2, m3 };
  }

  // ═══════════════════════════════════════════
  // SPLIT PAYMENT REMINDERS
  // ═══════════════════════════════════════════

  describe('POST /api/groups/:id/splits/remind', () => {
    it('creates notifications for members who owe money', async () => {
      const { group, owner, m2, m3 } = setupGroupWith3();
      // Owner paid 900, split equally → m2 and m3 owe 300 each
      // But m2 and m3 are guest members without user_id, so let's create a member with user_id
      const user2 = makeSecondUser();
      const { db } = setup();
      // Add user2 as a group member
      const r = db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)').run(group.id, user2.userId, 'User Two', 'member');
      const m4 = db.prepare('SELECT * FROM group_members WHERE id = ?').get(r.lastInsertRowid);

      // Create expense: owner paid 1200, split equally among 4 members
      makeSharedExpense(group.id, owner.id, { amount: 1200, description: 'Dinner' });

      const res = await agent().post(`/api/groups/${group.id}/splits/remind`).send({}).expect(200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.reminded >= 1); // at least user2 gets notified

      // Check notification was created for user2
      const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? AND type = ?').all(user2.userId, 'split_reminder');
      assert.ok(notifs.length >= 1);
      assert.ok(notifs[0].message.includes('owe'));
    });

    it('returns reminded=0 when no outstanding balances', async () => {
      const { group } = setupGroup();
      // No expenses → no debts
      const res = await agent().post(`/api/groups/${group.id}/splits/remind`).send({}).expect(200);
      assert.equal(res.body.reminded, 0);
    });

    it('rate limits reminders to once per 24h', async () => {
      const { group, owner } = setupGroupWith3();
      makeSharedExpense(group.id, owner.id, { amount: 900, description: 'Groceries' });

      // First remind should succeed
      await agent().post(`/api/groups/${group.id}/splits/remind`).send({}).expect(200);

      // Second remind within 24h should fail
      const res = await agent().post(`/api/groups/${group.id}/splits/remind`).send({}).expect(429);
      assert.equal(res.body.error.code, 'RATE_LIMITED');
    });

    it('allows reminders after 24h cooldown', async () => {
      const { group, owner } = setupGroupWith3();
      makeSharedExpense(group.id, owner.id, { amount: 900, description: 'Groceries' });

      // First remind
      await agent().post(`/api/groups/${group.id}/splits/remind`).send({}).expect(200);

      // Manually backdate the activity to >24h ago
      const { db } = setup();
      db.prepare("UPDATE group_activities SET created_at = datetime('now', '-25 hours') WHERE group_id = ? AND action = 'remind'").run(group.id);

      // Second remind should now succeed
      const res = await agent().post(`/api/groups/${group.id}/splits/remind`).send({}).expect(200);
      assert.equal(res.body.ok, true);
    });

    it('returns 403 for non-members', async () => {
      const { group } = setupGroup();
      const user2 = makeSecondUser();
      await user2.agent.post(`/api/groups/${group.id}/splits/remind`).send({}).expect(403);
    });

    it('returns 401 without auth', async () => {
      const { group } = setupGroup();
      await rawAgent().post(`/api/groups/${group.id}/splits/remind`).send({}).expect(401);
    });
  });

  // ═══════════════════════════════════════════
  // GROUP ACTIVITY FEED
  // ═══════════════════════════════════════════

  describe('GET /api/groups/:id/activities', () => {
    it('returns empty activity list initially', async () => {
      const { group } = setupGroup();
      const res = await agent().get(`/api/groups/${group.id}/activities`).expect(200);
      assert.ok(Array.isArray(res.body.activities));
      assert.equal(res.body.total, 0);
    });

    it('returns 403 for non-members', async () => {
      const { group } = setupGroup();
      const user2 = makeSecondUser();
      await user2.agent.get(`/api/groups/${group.id}/activities`).expect(403);
    });

    it('returns 401 without auth', async () => {
      const { group } = setupGroup();
      await rawAgent().get(`/api/groups/${group.id}/activities`).expect(401);
    });

    it('paginates activities with limit and offset', async () => {
      const { group } = setupGroup();
      const { db } = setup();
      // Insert 5 activities directly
      for (let i = 0; i < 5; i++) {
        db.prepare('INSERT INTO group_activities (group_id, user_id, action, details) VALUES (?, ?, ?, ?)').run(group.id, 1, 'test', `Activity ${i}`);
      }

      const res1 = await agent().get(`/api/groups/${group.id}/activities?limit=2&offset=0`).expect(200);
      assert.equal(res1.body.activities.length, 2);
      assert.equal(res1.body.total, 5);
      assert.equal(res1.body.limit, 2);
      assert.equal(res1.body.offset, 0);

      const res2 = await agent().get(`/api/groups/${group.id}/activities?limit=2&offset=2`).expect(200);
      assert.equal(res2.body.activities.length, 2);

      const res3 = await agent().get(`/api/groups/${group.id}/activities?limit=2&offset=4`).expect(200);
      assert.equal(res3.body.activities.length, 1);
    });
  });

  // ═══════════════════════════════════════════
  // AUTO-LOGGING ACTIVITIES
  // ═══════════════════════════════════════════

  describe('Activity auto-logging', () => {
    it('logs activity when expense is created', async () => {
      const { group, owner } = setupGroupWith3();
      await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ paid_by: owner.id, amount: 600, description: 'Lunch', date: today() })
        .expect(201);

      const res = await agent().get(`/api/groups/${group.id}/activities`).expect(200);
      assert.ok(res.body.activities.length >= 1);
      const expAct = res.body.activities.find(a => a.action === 'expense_created');
      assert.ok(expAct);
      assert.ok(expAct.details.includes('Lunch'));
    });

    it('logs activity when settlement is created', async () => {
      const { group, owner, m2 } = setupGroupWith3();
      makeSharedExpense(group.id, owner.id, { amount: 600, description: 'Dinner' });

      await agent().post(`/api/splits/${group.id}/settle`)
        .send({ from_member: m2.id, to_member: owner.id, amount: 200 })
        .expect(201);

      const res = await agent().get(`/api/groups/${group.id}/activities`).expect(200);
      const settleAct = res.body.activities.find(a => a.action === 'settlement_created');
      assert.ok(settleAct);
      assert.ok(settleAct.details.includes('200'));
    });

    it('logs activity when member is added', async () => {
      const { group } = setupGroup();
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ display_name: 'Charlie' })
        .expect(201);

      const res = await agent().get(`/api/groups/${group.id}/activities`).expect(200);
      const addAct = res.body.activities.find(a => a.action === 'member_added');
      assert.ok(addAct);
      assert.ok(addAct.details.includes('Charlie'));
    });

    it('logs activity when member is removed', async () => {
      const { group } = setupGroup();
      const m2 = makeGroupMember(group.id, { display_name: 'Dave' });

      await agent().delete(`/api/groups/${group.id}/members/${m2.id}`).expect(200);

      const res = await agent().get(`/api/groups/${group.id}/activities`).expect(200);
      const removeAct = res.body.activities.find(a => a.action === 'member_removed');
      assert.ok(removeAct);
      assert.ok(removeAct.details.includes('Dave'));
    });
  });
});
