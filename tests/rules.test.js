const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

describe('Category Rules', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/rules', () => {
    it('returns empty array when no rules exist', async () => {
      const res = await agent().get('/api/rules').expect(200);
      assert.ok(Array.isArray(res.body.rules));
      assert.equal(res.body.rules.length, 0);
    });

    it('returns user rules and system rules', async () => {
      const { db } = setup();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      // Seed a system rule
      db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 1, 0)')
        .run(1, 'swiggy|zomato', cat.id);
      // Create a user rule
      await agent().post('/api/rules').send({ pattern: 'starbucks', category_id: cat.id }).expect(201);
      const res = await agent().get('/api/rules').expect(200);
      assert.ok(res.body.rules.length >= 2);
      const system = res.body.rules.find(r => r.is_system === 1);
      const custom = res.body.rules.find(r => r.is_system === 0);
      assert.ok(system);
      assert.ok(custom);
    });
  });

  describe('POST /api/rules', () => {
    it('creates rule with pattern and category_id (201)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const res = await agent().post('/api/rules').send({ pattern: 'swiggy|zomato', category_id: cat.id }).expect(201);
      assert.ok(res.body.rule);
      assert.equal(res.body.rule.pattern, 'swiggy|zomato');
      assert.equal(res.body.rule.category_id, cat.id);
      assert.equal(res.body.rule.is_system, 0);
    });

    it('rejects missing pattern (400)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      await agent().post('/api/rules').send({ category_id: cat.id }).expect(400);
    });

    it('rejects non-existent category_id (400)', async () => {
      await agent().post('/api/rules').send({ pattern: 'test', category_id: 99999 }).expect(400);
    });
  });

  describe('PUT /api/rules/:id', () => {
    it('updates pattern and category_id', async () => {
      const cat1 = makeCategory({ name: 'Food', type: 'expense' });
      const cat2 = makeCategory({ name: 'Transport', type: 'expense' });
      const create = await agent().post('/api/rules').send({ pattern: 'old', category_id: cat1.id }).expect(201);
      const res = await agent().put(`/api/rules/${create.body.rule.id}`).send({ pattern: 'new', category_id: cat2.id }).expect(200);
      assert.equal(res.body.rule.pattern, 'new');
      assert.equal(res.body.rule.category_id, cat2.id);
    });

    it('blocks update of system rules (403)', async () => {
      const { db } = setup();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const r = db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 1, 0)')
        .run(1, 'swiggy', cat.id);
      await agent().put(`/api/rules/${r.lastInsertRowid}`).send({ pattern: 'newpattern' }).expect(403);
    });

    it('returns 404 for non-existent rule', async () => {
      await agent().put('/api/rules/99999').send({ pattern: 'test' }).expect(404);
    });
  });

  describe('DELETE /api/rules/:id', () => {
    it('deletes rule', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const create = await agent().post('/api/rules').send({ pattern: 'test', category_id: cat.id }).expect(201);
      await agent().delete(`/api/rules/${create.body.rule.id}`).expect(200);
      const res = await agent().get('/api/rules').expect(200);
      assert.equal(res.body.rules.length, 0);
    });

    it('blocks deletion of system rules (403)', async () => {
      const { db } = setup();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const r = db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 1, 0)')
        .run(1, 'swiggy', cat.id);
      await agent().delete(`/api/rules/${r.lastInsertRowid}`).expect(403);
    });

    it('returns 404 for non-existent rule', async () => {
      await agent().delete('/api/rules/99999').expect(404);
    });
  });

  describe('Auto-categorization integration', () => {
    it('auto-assigns category when transaction description matches a rule', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });
      // Create a rule
      await agent().post('/api/rules').send({ pattern: 'swiggy|zomato', category_id: cat.id }).expect(201);
      // Create transaction without category_id, with matching description
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 500,
        date: new Date().toISOString().slice(0, 10),
        description: 'Swiggy order #12345'
      }).expect(201);
      assert.equal(res.body.transaction.category_id, cat.id);
    });

    it('does not override explicitly provided category_id', async () => {
      const cat1 = makeCategory({ name: 'Food', type: 'expense' });
      const cat2 = makeCategory({ name: 'Other', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });
      await agent().post('/api/rules').send({ pattern: 'swiggy', category_id: cat1.id }).expect(201);
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        category_id: cat2.id,
        type: 'expense',
        amount: 500,
        date: new Date().toISOString().slice(0, 10),
        description: 'Swiggy order'
      }).expect(201);
      assert.equal(res.body.transaction.category_id, cat2.id);
    });

    it('leaves category_id null when no rule matches', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });
      await agent().post('/api/rules').send({ pattern: 'swiggy', category_id: cat.id }).expect(201);
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 500,
        date: new Date().toISOString().slice(0, 10),
        description: 'Coffee shop'
      }).expect(201);
      assert.equal(res.body.transaction.category_id, null);
    });

    it('matches rules case-insensitively', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });
      await agent().post('/api/rules').send({ pattern: 'SWIGGY', category_id: cat.id }).expect(201);
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 500,
        date: new Date().toISOString().slice(0, 10),
        description: 'swiggy delivery'
      }).expect(201);
      assert.equal(res.body.transaction.category_id, cat.id);
    });

    it('uses rule position for priority (lower position = higher priority)', async () => {
      const cat1 = makeCategory({ name: 'Food', type: 'expense' });
      const cat2 = makeCategory({ name: 'Delivery', type: 'expense' });
      const acct = makeAccount({ name: 'Checking' });
      // Both match 'uber eats' but position 0 should win
      const { db } = setup();
      db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, 0)')
        .run(1, 'uber', cat1.id);
      db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, 1)')
        .run(1, 'uber eats', cat2.id);
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id,
        type: 'expense',
        amount: 500,
        date: new Date().toISOString().slice(0, 10),
        description: 'Uber Eats dinner'
      }).expect(201);
      assert.equal(res.body.transaction.category_id, cat1.id);
    });
  });

  describe('Pattern validation', () => {
    it('rejects empty pattern terms (400)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const res = await agent().post('/api/rules').send({ pattern: '|||', category_id: cat.id }).expect(400);
      assert.ok(res.body.error.message.includes('non-empty term'));
    });

    it('rejects overly long pattern (400)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const longPattern = 'a'.repeat(501);
      const res = await agent().post('/api/rules').send({ pattern: longPattern, category_id: cat.id }).expect(400);
      assert.ok(res.body.error.message.includes('500 characters'));
    });

    it('rejects pattern on update with empty terms (400)', async () => {
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const create = await agent().post('/api/rules').send({ pattern: 'valid', category_id: cat.id }).expect(201);
      const res = await agent().put(`/api/rules/${create.body.rule.id}`).send({ pattern: '|' }).expect(400);
      assert.ok(res.body.error.message.includes('non-empty term'));
    });
  });
});
