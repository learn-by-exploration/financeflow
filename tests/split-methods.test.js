const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeGroup, makeGroupMember } = require('./helpers');

describe('Percentage & Shares Splits — v0.2.8', () => {
  let db;
  before(() => { db = setup().db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  function getOwnerMember(groupId) {
    return db.prepare('SELECT id FROM group_members WHERE group_id = ? AND role = ?').get(groupId, 'owner');
  }

  describe('Percentage split', () => {
    it('splits expense by percentage', async () => {
      const group = makeGroup({ name: 'Roommates' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Bob' });

      const res = await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 1000,
        description: 'Dinner',
        date: '2025-03-15',
        split_method: 'percentage',
        splits: [
          { member_id: owner.id, percentage: 60 },
          { member_id: guest.id, percentage: 40 },
        ],
      }).expect(201);

      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ? ORDER BY amount ASC').all(res.body.id);
      assert.equal(splits.length, 2);
      assert.equal(splits[0].amount, 400);
      assert.equal(splits[1].amount, 600);
    });

    it('rejects percentages not summing to 100', async () => {
      const group = makeGroup({ name: 'Bad Split' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Bob' });

      await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 1000,
        description: 'Bad',
        date: '2025-03-15',
        split_method: 'percentage',
        splits: [
          { member_id: owner.id, percentage: 50 },
          { member_id: guest.id, percentage: 30 },
        ],
      }).expect(400);
    });

    it('handles 3-way percentage split with rounding', async () => {
      const group = makeGroup({ name: 'Trio' });
      const owner = getOwnerMember(group.id);
      const b = makeGroupMember(group.id, { display_name: 'Bob' });
      const c = makeGroupMember(group.id, { display_name: 'Charlie' });

      const res = await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 100,
        description: 'Coffee',
        date: '2025-03-15',
        split_method: 'percentage',
        splits: [
          { member_id: owner.id, percentage: 33.33 },
          { member_id: b.id, percentage: 33.33 },
          { member_id: c.id, percentage: 33.34 },
        ],
      }).expect(201);

      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(res.body.id);
      const total = splits.reduce((s, sp) => s + sp.amount, 0);
      assert.equal(Math.round(total * 100) / 100, 100);
    });

    it('rejects negative percentage', async () => {
      const group = makeGroup({ name: 'Neg' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Bob' });

      await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 100,
        description: 'Bad',
        date: '2025-03-15',
        split_method: 'percentage',
        splits: [
          { member_id: owner.id, percentage: 110 },
          { member_id: guest.id, percentage: -10 },
        ],
      }).expect(400);
    });
  });

  describe('Shares split', () => {
    it('splits expense by shares', async () => {
      const group = makeGroup({ name: 'Family' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Kid' });

      const res = await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 900,
        description: 'Hotel',
        date: '2025-03-15',
        split_method: 'shares',
        splits: [
          { member_id: owner.id, shares: 2 },
          { member_id: guest.id, shares: 1 },
        ],
      }).expect(201);

      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ? ORDER BY amount DESC').all(res.body.id);
      assert.equal(splits.length, 2);
      assert.equal(splits[0].amount, 600);
      assert.equal(splits[1].amount, 300);
    });

    it('equal shares produces equal split', async () => {
      const group = makeGroup({ name: 'Equal' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Peer' });

      const res = await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 1000,
        description: 'Lunch',
        date: '2025-03-15',
        split_method: 'shares',
        splits: [
          { member_id: owner.id, shares: 1 },
          { member_id: guest.id, shares: 1 },
        ],
      }).expect(201);

      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(res.body.id);
      assert.equal(splits[0].amount, 500);
      assert.equal(splits[1].amount, 500);
    });

    it('rejects zero shares', async () => {
      const group = makeGroup({ name: 'Bad' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Bob' });

      await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 100,
        description: 'Bad',
        date: '2025-03-15',
        split_method: 'shares',
        splits: [
          { member_id: owner.id, shares: 0 },
          { member_id: guest.id, shares: 1 },
        ],
      }).expect(400);
    });

    it('rejects negative shares', async () => {
      const group = makeGroup({ name: 'Bad2' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Bob' });

      await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 100,
        description: 'Bad',
        date: '2025-03-15',
        split_method: 'shares',
        splits: [
          { member_id: owner.id, shares: -1 },
          { member_id: guest.id, shares: 2 },
        ],
      }).expect(400);
    });

    it('handles shares with rounding remainder', async () => {
      const group = makeGroup({ name: 'Rounding' });
      const owner = getOwnerMember(group.id);
      const b = makeGroupMember(group.id, { display_name: 'Bob' });
      const c = makeGroupMember(group.id, { display_name: 'Charlie' });

      // 100 / (1+1+1) = 33.33 each, last gets 33.34
      const res = await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 100,
        description: 'Pizza',
        date: '2025-03-15',
        split_method: 'shares',
        splits: [
          { member_id: owner.id, shares: 1 },
          { member_id: b.id, shares: 1 },
          { member_id: c.id, shares: 1 },
        ],
      }).expect(201);

      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(res.body.id);
      const total = splits.reduce((s, sp) => s + sp.amount, 0);
      assert.equal(Math.round(total * 100) / 100, 100);
    });
  });

  describe('Settlements with new split methods', () => {
    it('balances work correctly with percentage splits', async () => {
      const group = makeGroup({ name: 'Test' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Bob' });

      await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 1000,
        description: 'Dinner',
        date: '2025-03-15',
        split_method: 'percentage',
        splits: [
          { member_id: owner.id, percentage: 70 },
          { member_id: guest.id, percentage: 30 },
        ],
      }).expect(201);

      const balRes = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      assert.ok(balRes.body.simplified_debts.length > 0);
      const debt = balRes.body.simplified_debts[0];
      assert.equal(debt.amount, 300);
    });

    it('balances work correctly with shares splits', async () => {
      const group = makeGroup({ name: 'Shares Bal' });
      const owner = getOwnerMember(group.id);
      const guest = makeGroupMember(group.id, { display_name: 'Bob' });

      // Owner pays 900, split 2:1 shares → owner owes 600, guest owes 300
      // Owner paid 900, owes 600 → net +300. Guest paid 0, owes 300 → net -300
      await agent().post(`/api/splits/${group.id}/expenses`).send({
        paid_by: owner.id,
        amount: 900,
        description: 'Dinner',
        date: '2025-03-15',
        split_method: 'shares',
        splits: [
          { member_id: owner.id, shares: 2 },
          { member_id: guest.id, shares: 1 },
        ],
      }).expect(201);

      const balRes = await agent().get(`/api/splits/${group.id}/balances`).expect(200);
      const debt = balRes.body.simplified_debts[0];
      assert.equal(debt.amount, 300);
    });
  });
});
