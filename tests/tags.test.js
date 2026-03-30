const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeTransaction, makeSecondUser } = require('./helpers');

describe('Tags — v0.2.3', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('GET /api/tags', () => {
    it('returns empty list when no tags', async () => {
      const res = await agent().get('/api/tags').expect(200);
      assert.deepEqual(res.body.tags, []);
    });
  });

  describe('POST /api/tags', () => {
    it('creates a tag (201)', async () => {
      const res = await agent().post('/api/tags')
        .send({ name: 'vacation', color: '#FF6B6B' }).expect(201);
      assert.ok(res.body.tag.id);
      assert.equal(res.body.tag.name, 'vacation');
      assert.equal(res.body.tag.color, '#FF6B6B');
    });

    it('rejects duplicate tag name (409)', async () => {
      await agent().post('/api/tags').send({ name: 'travel' }).expect(201);
      await agent().post('/api/tags').send({ name: 'travel' }).expect(409);
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/tags').send({}).expect(400);
    });
  });

  describe('PUT /api/tags/:id', () => {
    it('updates a tag', async () => {
      const cres = await agent().post('/api/tags').send({ name: 'old' }).expect(201);
      const res = await agent().put(`/api/tags/${cres.body.tag.id}`)
        .send({ name: 'updated', color: '#00FF00' }).expect(200);
      assert.equal(res.body.tag.name, 'updated');
      assert.equal(res.body.tag.color, '#00FF00');
    });

    it('rejects update on non-existent tag (404)', async () => {
      await agent().put('/api/tags/9999').send({ name: 'x' }).expect(404);
    });
  });

  describe('DELETE /api/tags/:id', () => {
    it('deletes a tag', async () => {
      const cres = await agent().post('/api/tags').send({ name: 'temp' }).expect(201);
      await agent().delete(`/api/tags/${cres.body.tag.id}`).expect(200);
      const list = await agent().get('/api/tags').expect(200);
      assert.equal(list.body.tags.length, 0);
    });

    it('rejects delete on non-existent tag (404)', async () => {
      await agent().delete('/api/tags/9999').expect(404);
    });

    it('does not delete associated transactions', async () => {
      const tag = await agent().post('/api/tags').send({ name: 'deleteme' }).expect(201);
      const acct = makeAccount({ name: 'Checking' });
      const txn = await agent().post('/api/transactions')
        .send({
          account_id: acct.id, type: 'expense', amount: 100,
          description: 'Test', date: '2025-01-01', tag_ids: [tag.body.tag.id]
        }).expect(201);

      await agent().delete(`/api/tags/${tag.body.tag.id}`).expect(200);

      // Transaction should still exist
      const res = await agent().get('/api/transactions').expect(200);
      assert.ok(res.body.transactions.some(t => t.id === txn.body.transaction.id));
    });
  });

  describe('Transaction tagging', () => {
    it('creates a transaction with tags', async () => {
      const tag1 = await agent().post('/api/tags').send({ name: 'food' }).expect(201);
      const tag2 = await agent().post('/api/tags').send({ name: 'lunch' }).expect(201);
      const acct = makeAccount({ name: 'Checking' });

      const res = await agent().post('/api/transactions')
        .send({
          account_id: acct.id, type: 'expense', amount: 50,
          description: 'Lunch out', date: '2025-01-15',
          tag_ids: [tag1.body.tag.id, tag2.body.tag.id]
        }).expect(201);

      assert.ok(res.body.transaction.tags);
      assert.equal(res.body.transaction.tags.length, 2);
    });

    it('returns tags with transaction list', async () => {
      const tag = await agent().post('/api/tags').send({ name: 'groceries' }).expect(201);
      const acct = makeAccount({ name: 'Checking' });

      await agent().post('/api/transactions')
        .send({
          account_id: acct.id, type: 'expense', amount: 200,
          description: 'BigBasket', date: '2025-01-15',
          tag_ids: [tag.body.tag.id]
        }).expect(201);

      const res = await agent().get('/api/transactions').expect(200);
      assert.ok(res.body.transactions[0].tags);
      assert.equal(res.body.transactions[0].tags.length, 1);
      assert.equal(res.body.transactions[0].tags[0].name, 'groceries');
    });

    it('filters transactions by tag', async () => {
      const tag = await agent().post('/api/tags').send({ name: 'urgent' }).expect(201);
      const acct = makeAccount({ name: 'Checking' });

      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'expense', amount: 100, description: 'Tagged', date: '2025-01-15', tag_ids: [tag.body.tag.id] }).expect(201);
      await agent().post('/api/transactions')
        .send({ account_id: acct.id, type: 'expense', amount: 200, description: 'Untagged', date: '2025-01-15' }).expect(201);

      const res = await agent().get(`/api/transactions?tag_id=${tag.body.tag.id}`).expect(200);
      assert.equal(res.body.transactions.length, 1);
      assert.equal(res.body.transactions[0].description, 'Tagged');
    });
  });

  describe('Cross-user tag isolation', () => {
    it('user cannot see other user tags', async () => {
      await agent().post('/api/tags').send({ name: 'private' }).expect(201);
      const { agent: agentB } = makeSecondUser();
      const res = await agentB.get('/api/tags').expect(200);
      assert.equal(res.body.tags.length, 0);
    });
  });
});
