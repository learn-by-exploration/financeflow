const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeCategory } = require('./helpers');

describe('Categories', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/categories', () => {
    it('returns empty list when no categories exist (200)', async () => {
      const res = await agent().get('/api/categories').expect(200);
      assert.ok(Array.isArray(res.body.categories));
      assert.equal(res.body.categories.length, 0);
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().get('/api/categories').expect(401);
    });

    it('returns user-created categories', async () => {
      const cat = makeCategory({ name: 'Custom Cat' });
      const res = await agent().get('/api/categories').expect(200);
      const found = res.body.categories.find(c => c.name === 'Custom Cat');
      assert.ok(found);
      assert.equal(found.id, cat.id);
    });
  });

  describe('POST /api/categories', () => {
    it('creates category (201)', async () => {
      const res = await agent().post('/api/categories')
        .send({ name: 'Groceries', type: 'expense', icon: '🛒', color: '#22c55e' })
        .expect(201);
      assert.equal(res.body.category.name, 'Groceries');
      assert.equal(res.body.category.type, 'expense');
      assert.equal(res.body.category.icon, '🛒');
      assert.equal(res.body.category.color, '#22c55e');
      assert.equal(res.body.category.is_system, 0);
    });

    it('creates category with defaults', async () => {
      const res = await agent().post('/api/categories')
        .send({ name: 'Misc', type: 'expense' })
        .expect(201);
      assert.equal(res.body.category.icon, '📁');
      assert.equal(res.body.category.color, '#8b5cf6');
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/categories')
        .send({ type: 'expense' })
        .expect(400);
    });

    it('rejects missing type (400)', async () => {
      await agent().post('/api/categories')
        .send({ name: 'NoType' })
        .expect(400);
    });

    it('rejects invalid type (400)', async () => {
      await agent().post('/api/categories')
        .send({ name: 'Bad', type: 'invalid' })
        .expect(400);
    });

    it('supports parent_id for subcategories', async () => {
      const parent = makeCategory({ name: 'Food', type: 'expense' });
      const res = await agent().post('/api/categories')
        .send({ name: 'Dining Out', type: 'expense', parent_id: parent.id })
        .expect(201);
      assert.equal(res.body.category.parent_id, parent.id);
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('updates user category', async () => {
      const cat = makeCategory({ name: 'Old Name' });
      const res = await agent().put(`/api/categories/${cat.id}`)
        .send({ name: 'New Name', icon: '✨' })
        .expect(200);
      assert.equal(res.body.category.name, 'New Name');
      assert.equal(res.body.category.icon, '✨');
    });

    it('refuses to update system category', async () => {
      const cat = makeCategory({ name: 'System Cat', is_system: 1 });
      await agent().put(`/api/categories/${cat.id}`)
        .send({ name: 'Hacked' })
        .expect(200);
      // Should not have been updated (WHERE is_system = 0)
      const { db } = setup();
      const actual = db.prepare('SELECT name FROM categories WHERE id = ?').get(cat.id);
      assert.equal(actual.name, 'System Cat');
    });

    it('returns 404 for non-existent ID', async () => {
      await agent().put('/api/categories/99999')
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('deletes user category (200)', async () => {
      const cat = makeCategory({ name: 'Deletable' });
      await agent().delete(`/api/categories/${cat.id}`).expect(200);
      const { db } = setup();
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id);
      assert.equal(row, undefined);
    });

    it('refuses to delete system category', async () => {
      const cat = makeCategory({ name: 'Protected', is_system: 1 });
      await agent().delete(`/api/categories/${cat.id}`).expect(200);
      const { db } = setup();
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id);
      assert.ok(row, 'System category should still exist');
    });

    it('returns 404 for non-existent ID', async () => {
      await agent().delete('/api/categories/99999').expect(404);
    });
  });
});
