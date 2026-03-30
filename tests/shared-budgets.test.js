const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeGroup, makeCategory, makeSecondUser } = require('./helpers');

describe('Shared Budgets — v0.2.9', () => {
  let db;
  before(() => { db = setup().db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('CRUD', () => {
    it('creates a shared budget', async () => {
      const group = makeGroup({ name: 'Household' });
      const cat = makeCategory({ name: 'Groceries' });

      const res = await agent().post(`/api/groups/${group.id}/budgets`).send({
        name: 'Monthly Groceries',
        period: 'monthly',
        items: [{ category_id: cat.id, amount: 5000 }],
      }).expect(201);

      assert.ok(res.body.budget.id);
      assert.equal(res.body.budget.name, 'Monthly Groceries');
      assert.equal(res.body.items.length, 1);
      assert.equal(res.body.items[0].amount, 5000);
    });

    it('lists shared budgets for group', async () => {
      const group = makeGroup({ name: 'Family' });
      db.prepare('INSERT INTO shared_budgets (group_id, name, period) VALUES (?, ?, ?)').run(group.id, 'Budget A', 'monthly');
      db.prepare('INSERT INTO shared_budgets (group_id, name, period) VALUES (?, ?, ?)').run(group.id, 'Budget B', 'weekly');

      const res = await agent().get(`/api/groups/${group.id}/budgets`).expect(200);
      assert.equal(res.body.budgets.length, 2);
    });

    it('gets a single shared budget with items', async () => {
      const group = makeGroup({ name: 'Couple' });
      const cat = makeCategory({ name: 'Dining' });
      const r = db.prepare('INSERT INTO shared_budgets (group_id, name, period) VALUES (?, ?, ?)').run(group.id, 'Dining Out', 'monthly');
      db.prepare('INSERT INTO shared_budget_items (shared_budget_id, category_id, amount) VALUES (?, ?, ?)').run(r.lastInsertRowid, cat.id, 3000);

      const res = await agent().get(`/api/groups/${group.id}/budgets/${r.lastInsertRowid}`).expect(200);
      assert.equal(res.body.budget.name, 'Dining Out');
      assert.equal(res.body.items.length, 1);
    });

    it('updates a shared budget', async () => {
      const group = makeGroup({ name: 'Team' });
      const r = db.prepare('INSERT INTO shared_budgets (group_id, name, period) VALUES (?, ?, ?)').run(group.id, 'Old', 'monthly');

      const res = await agent().put(`/api/groups/${group.id}/budgets/${r.lastInsertRowid}`).send({
        name: 'Updated',
        period: 'weekly',
      }).expect(200);

      assert.equal(res.body.budget.name, 'Updated');
      assert.equal(res.body.budget.period, 'weekly');
    });

    it('deletes a shared budget', async () => {
      const group = makeGroup({ name: 'Office' });
      const r = db.prepare('INSERT INTO shared_budgets (group_id, name, period) VALUES (?, ?, ?)').run(group.id, 'Delete Me', 'monthly');

      await agent().delete(`/api/groups/${group.id}/budgets/${r.lastInsertRowid}`).expect(200);

      const gone = db.prepare('SELECT * FROM shared_budgets WHERE id = ?').get(r.lastInsertRowid);
      assert.equal(gone, undefined);
    });

    it('returns 404 for nonexistent shared budget', async () => {
      const group = makeGroup({ name: 'Test' });
      await agent().get(`/api/groups/${group.id}/budgets/999`).expect(404);
    });
  });

  describe('Access control', () => {
    it('rejects non-member from creating shared budget (403)', async () => {
      const group = makeGroup({ name: 'Private' });
      const { agent: agent2 } = makeSecondUser();

      await agent2.post(`/api/groups/${group.id}/budgets`).send({
        name: 'Hack',
        period: 'monthly',
        items: [],
      }).expect(403);
    });

    it('rejects non-member from listing budgets (403)', async () => {
      const group = makeGroup({ name: 'Private2' });
      const { agent: agent2 } = makeSecondUser();

      await agent2.get(`/api/groups/${group.id}/budgets`).expect(403);
    });
  });
});
