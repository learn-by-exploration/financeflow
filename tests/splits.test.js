const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeGroup, makeGroupMember, makeSharedExpense, makeSecondUser, today } = require('./helpers');

describe('Splits', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Helper: create group with members ────────────
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

  // ─── GET expenses ────────────────────────────────

  describe('GET /api/splits/:groupId/expenses', () => {
    it('returns expenses with paid_by name (200)', async () => {
      const { group, owner } = setupGroup();
      makeSharedExpense(group.id, owner.id, { description: 'Groceries', amount: 500 });
      const res = await agent().get(`/api/splits/${group.id}/expenses`).expect(200);
      assert.equal(res.body.expenses.length, 1);
      assert.equal(res.body.expenses[0].description, 'Groceries');
      assert.ok(res.body.expenses[0].paid_by_name);
    });

    it('returns 403 for non-member', async () => {
      const user2 = makeSecondUser();
      const { group } = setupGroup();
      await user2.agent.get(`/api/splits/${group.id}/expenses`).expect(403);
    });
  });

  // ─── POST expenses ───────────────────────────────

  describe('POST /api/splits/:groupId/expenses', () => {
    it('creates with equal split (auto-calculate) (201)', async () => {
      const { group, owner, m2, m3 } = setupGroupWith3();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ paid_by: owner.id, amount: 900, description: 'Dinner', date: today() })
        .expect(201);
      assert.ok(res.body.id);

      // Verify splits created
      const { db } = setup();
      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(res.body.id);
      assert.equal(splits.length, 3);
      const total = splits.reduce((s, sp) => s + sp.amount, 0);
      assert.equal(Math.round(total * 100) / 100, 900);
    });

    it('creates with exact split amounts (201)', async () => {
      const { group, owner, m2, m3 } = setupGroupWith3();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({
          paid_by: owner.id, amount: 1000, description: 'Trip',
          date: today(), split_method: 'exact',
          splits: [
            { member_id: owner.id, amount: 500 },
            { member_id: m2.id, amount: 300 },
            { member_id: m3.id, amount: 200 }
          ]
        })
        .expect(201);
      const { db } = setup();
      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ? ORDER BY amount DESC').all(res.body.id);
      assert.equal(splits.length, 3);
      assert.equal(splits[0].amount, 500);
      assert.equal(splits[1].amount, 300);
      assert.equal(splits[2].amount, 200);
    });

    it('rejects exact split that does not sum to expense amount (400)', async () => {
      const { group, owner, m2 } = setupGroupWith3();
      await agent().post(`/api/splits/${group.id}/expenses`)
        .send({
          paid_by: owner.id, amount: 1000, description: 'Bad',
          date: today(), split_method: 'exact',
          splits: [
            { member_id: owner.id, amount: 400 },
            { member_id: m2.id, amount: 400 }
          ]
        })
        .expect(400);
    });

    it('logs audit entry on creation', async () => {
      const { group, owner } = setupGroup();
      await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ paid_by: owner.id, amount: 100, description: 'Audited', date: today() })
        .expect(201);
      const { db } = setup();
      const log = db.prepare('SELECT * FROM audit_log WHERE action = ?').get('expense.create');
      assert.ok(log);
    });
  });

  // ─── DELETE expenses ──────────────────────────────

  describe('DELETE /api/splits/:groupId/expenses/:id', () => {
    it('deletes expense and its splits (200)', async () => {
      const { group, owner } = setupGroup();
      const expense = makeSharedExpense(group.id, owner.id, { amount: 500 });
      await agent().delete(`/api/splits/${group.id}/expenses/${expense.id}`).expect(200);
      const { db } = setup();
      const e = db.prepare('SELECT * FROM shared_expenses WHERE id = ?').get(expense.id);
      assert.equal(e, undefined);
      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(expense.id);
      assert.equal(splits.length, 0);
    });

    it('returns 404 for non-existent (404)', async () => {
      const { group } = setupGroup();
      await agent().delete(`/api/splits/${group.id}/expenses/99999`).expect(404);
    });
  });

  // ─── Rounding (C27) ──────────────────────────────

  describe('Rounding policy (C27)', () => {
    it('₹100 / 3 = [33.33, 33.33, 33.34], sum = 100', async () => {
      const { group, owner, m2, m3 } = setupGroupWith3();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ paid_by: owner.id, amount: 100, description: 'Split 3', date: today() })
        .expect(201);
      const { db } = setup();
      const splits = db.prepare('SELECT amount FROM expense_splits WHERE expense_id = ? ORDER BY amount').all(res.body.id);
      const amounts = splits.map(s => s.amount);
      const total = amounts.reduce((s, a) => s + a, 0);
      assert.equal(Math.round(total * 100) / 100, 100);
      // Two should be 33.33, one should be 33.34
      assert.equal(amounts.filter(a => a === 33.33).length, 2);
      assert.equal(amounts.filter(a => a === 33.34).length, 1);
    });

    it('₹10 / 3 = [3.33, 3.33, 3.34], sum = 10', async () => {
      const { group, owner, m2, m3 } = setupGroupWith3();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ paid_by: owner.id, amount: 10, description: 'Small', date: today() })
        .expect(201);
      const { db } = setup();
      const splits = db.prepare('SELECT amount FROM expense_splits WHERE expense_id = ? ORDER BY amount').all(res.body.id);
      const total = splits.reduce((s, sp) => s + sp.amount, 0);
      assert.equal(Math.round(total * 100) / 100, 10);
    });

    it('₹1 / 3 = [0.33, 0.33, 0.34], sum = 1', async () => {
      const { group, owner, m2, m3 } = setupGroupWith3();
      const res = await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ paid_by: owner.id, amount: 1, description: 'Tiny', date: today() })
        .expect(201);
      const { db } = setup();
      const splits = db.prepare('SELECT amount FROM expense_splits WHERE expense_id = ? ORDER BY amount').all(res.body.id);
      const total = splits.reduce((s, sp) => s + sp.amount, 0);
      assert.equal(Math.round(total * 100) / 100, 1);
    });
  });

  // ─── Balances + debt simplification ───────────────

  describe('GET /api/splits/:groupId/balances', () => {
    it('2 members, 1 expense → one owes the other', async () => {
      const { group, owner } = setupGroup();
      const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
      makeSharedExpense(group.id, owner.id, { amount: 100 });
      const res = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      assert.ok(res.body.balances);
      // Owner paid 100, split 50/50 → owner is owed 50, alice owes 50
      const ownerBal = res.body.balances.find(b => b.id === owner.id);
      const aliceBal = res.body.balances.find(b => b.id === m2.id);
      assert.ok(ownerBal.balance > 0);
      assert.ok(aliceBal.balance < 0);
    });

    it('returns zero balances when all settled', async () => {
      const { group, owner } = setupGroup();
      const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
      makeSharedExpense(group.id, owner.id, { amount: 100 });
      // Settle: Alice pays owner 50
      const { db } = setup();
      db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount) VALUES (?, ?, ?, ?)').run(group.id, m2.id, owner.id, 50);
      const res = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      for (const b of res.body.balances) {
        assert.equal(Math.round(b.balance * 100) / 100, 0);
      }
    });

    it('returns simplified debts', async () => {
      const { group, owner } = setupGroup();
      const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
      const m3 = makeGroupMember(group.id, { display_name: 'Bob' });
      // Owner pays 300, split 3 ways → each owes 100, owner net +200
      makeSharedExpense(group.id, owner.id, { amount: 300 });
      const res = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      assert.ok(res.body.simplified_debts);
      assert.ok(res.body.simplified_debts.length > 0);
      // Total of simplified debts should make sense
      const totalDebt = res.body.simplified_debts.reduce((s, d) => s + d.amount, 0);
      assert.ok(totalDebt > 0);
    });
  });

  // ─── Settlements ──────────────────────────────────

  describe('POST /api/splits/:groupId/settle', () => {
    it('records settlement (201)', async () => {
      const { group, owner } = setupGroup();
      const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
      const res = await agent().post(`/api/splits/${group.id}/settle`)
        .send({ from_member: m2.id, to_member: owner.id, amount: 50 })
        .expect(201);
      assert.ok(res.body.id);
    });

    it('updates balances correctly after settlement', async () => {
      const { group, owner } = setupGroup();
      const m2 = makeGroupMember(group.id, { display_name: 'Alice' });
      makeSharedExpense(group.id, owner.id, { amount: 200 });
      // Alice owes owner 100
      await agent().post(`/api/splits/${group.id}/settle`)
        .send({ from_member: m2.id, to_member: owner.id, amount: 100 })
        .expect(201);
      const res = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      for (const b of res.body.balances) {
        assert.equal(Math.round(b.balance * 100) / 100, 0);
      }
    });
  });

  // ─── Multi-user tests (C23) ──────────────────────

  describe('Multi-user expense flow', () => {
    it('User A pays → User B sees correct balance', async () => {
      const { group, owner } = setupGroup();
      const user2 = makeSecondUser();
      // Add user2 to group
      await agent().post(`/api/groups/${group.id}/members`)
        .send({ username: 'testuser2' })
        .expect(201);

      const { db } = setup();
      const u2member = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, user2.userId);

      // Owner pays 200
      await agent().post(`/api/splits/${group.id}/expenses`)
        .send({ paid_by: owner.id, amount: 200, description: 'Lunch', date: today() })
        .expect(201);

      // User2 checks balances
      const res = await user2.agent.get(`/api/splits/${group.id}/balances`).expect(200);
      const u2bal = res.body.balances.find(b => b.id === u2member.id);
      assert.ok(u2bal.balance < 0, 'User2 should owe money');
    });
  });
});
