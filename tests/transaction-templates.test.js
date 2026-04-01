const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory } = require('./helpers');

describe('Transaction Templates API', () => {
  let account, category;
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    account = makeAccount();
    category = makeCategory({ name: 'Groceries' });
  });

  describe('POST /api/transaction-templates', () => {
    it('creates a template (201)', async () => {
      const res = await agent().post('/api/transaction-templates')
        .send({ name: 'Weekly Groceries', amount: 2000, type: 'expense', category_id: category.id, account_id: account.id })
        .expect(201);
      assert.ok(res.body.template.id);
      assert.equal(res.body.template.name, 'Weekly Groceries');
      assert.equal(res.body.template.amount, 2000);
      assert.equal(res.body.template.type, 'expense');
    });

    it('creates template with minimal fields (201)', async () => {
      const res = await agent().post('/api/transaction-templates')
        .send({ name: 'Quick Template' })
        .expect(201);
      assert.equal(res.body.template.name, 'Quick Template');
      assert.equal(res.body.template.type, 'expense');
    });

    it('rejects empty name (400)', async () => {
      const res = await agent().post('/api/transaction-templates')
        .send({ name: '' })
        .expect(400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects missing name (400)', async () => {
      await agent().post('/api/transaction-templates')
        .send({ amount: 100 })
        .expect(400);
    });

    it('rejects invalid type (400)', async () => {
      await agent().post('/api/transaction-templates')
        .send({ name: 'Bad', type: 'invalid' })
        .expect(400);
    });

    it('rejects negative amount (400)', async () => {
      await agent().post('/api/transaction-templates')
        .send({ name: 'Bad', amount: -100 })
        .expect(400);
    });

    it('rejects non-numeric amount (400)', async () => {
      await agent().post('/api/transaction-templates')
        .send({ name: 'Bad', amount: 'abc' })
        .expect(400);
    });

    it('trims whitespace from name', async () => {
      const res = await agent().post('/api/transaction-templates')
        .send({ name: '  Trimmed  ' })
        .expect(201);
      assert.equal(res.body.template.name, 'Trimmed');
    });

    it('rejects unauthenticated (401)', async () => {
      await rawAgent().post('/api/transaction-templates')
        .send({ name: 'Test' })
        .expect(401);
    });
  });

  describe('GET /api/transaction-templates', () => {
    it('lists templates (200)', async () => {
      await agent().post('/api/transaction-templates').send({ name: 'Template 1' }).expect(201);
      await agent().post('/api/transaction-templates').send({ name: 'Template 2' }).expect(201);

      const res = await agent().get('/api/transaction-templates').expect(200);
      assert.ok(Array.isArray(res.body.templates));
      assert.equal(res.body.templates.length, 2);
    });

    it('returns empty array when none exist (200)', async () => {
      const res = await agent().get('/api/transaction-templates').expect(200);
      assert.deepEqual(res.body.templates, []);
    });

    it('does not show other users templates', async () => {
      await agent().post('/api/transaction-templates').send({ name: 'My Template' }).expect(201);

      const { makeSecondUser } = require('./helpers');
      const { agent: user2Agent } = makeSecondUser();
      const res = await user2Agent.get('/api/transaction-templates').expect(200);
      assert.equal(res.body.templates.length, 0);
    });

    it('returns templates ordered by creation', async () => {
      await agent().post('/api/transaction-templates').send({ name: 'First' }).expect(201);
      await agent().post('/api/transaction-templates').send({ name: 'Second' }).expect(201);

      const res = await agent().get('/api/transaction-templates').expect(200);
      assert.equal(res.body.templates.length, 2);
      const names = res.body.templates.map(t => t.name);
      assert.ok(names.includes('First'));
      assert.ok(names.includes('Second'));
    });
  });

  describe('DELETE /api/transaction-templates/:id', () => {
    it('deletes a template (200)', async () => {
      const created = await agent().post('/api/transaction-templates').send({ name: 'To Delete' }).expect(201);
      await agent().delete(`/api/transaction-templates/${created.body.template.id}`).expect(200);

      const list = await agent().get('/api/transaction-templates').expect(200);
      assert.equal(list.body.templates.length, 0);
    });

    it('returns 404 for non-existent template', async () => {
      await agent().delete('/api/transaction-templates/99999').expect(404);
    });

    it('cannot delete another user\'s template (404)', async () => {
      const created = await agent().post('/api/transaction-templates').send({ name: 'Mine' }).expect(201);

      const { makeSecondUser } = require('./helpers');
      const { agent: user2Agent } = makeSecondUser();
      await user2Agent.delete(`/api/transaction-templates/${created.body.template.id}`).expect(404);
    });
  });

  describe('POST /api/transactions/from-template/:id', () => {
    it('creates transaction from template (201)', async () => {
      const tmpl = await agent().post('/api/transaction-templates')
        .send({ name: 'Grocery Run', amount: 1500, type: 'expense', account_id: account.id, category_id: category.id })
        .expect(201);

      const res = await agent().post(`/api/transactions/from-template/${tmpl.body.template.id}`)
        .send({})
        .expect(201);
      assert.ok(res.body.transaction.id);
      assert.equal(res.body.transaction.amount, 1500);
      assert.equal(res.body.transaction.type, 'expense');
      assert.equal(res.body.transaction.account_id, account.id);
    });

    it('allows overriding amount and description', async () => {
      const tmpl = await agent().post('/api/transaction-templates')
        .send({ name: 'Flexible', amount: 1000, type: 'expense', account_id: account.id })
        .expect(201);

      const res = await agent().post(`/api/transactions/from-template/${tmpl.body.template.id}`)
        .send({ amount: 2500, description: 'Override desc' })
        .expect(201);
      assert.equal(res.body.transaction.amount, 2500);
      assert.equal(res.body.transaction.description, 'Override desc');
    });

    it('updates account balance after creation', async () => {
      const tmpl = await agent().post('/api/transaction-templates')
        .send({ name: 'Rent', amount: 15000, type: 'expense', account_id: account.id })
        .expect(201);

      const beforeList = await agent().get('/api/accounts').expect(200);
      const beforeBalance = beforeList.body.accounts.find(a => a.id === account.id).balance;

      await agent().post(`/api/transactions/from-template/${tmpl.body.template.id}`).send({}).expect(201);

      const afterList = await agent().get('/api/accounts').expect(200);
      const afterBalance = afterList.body.accounts.find(a => a.id === account.id).balance;
      assert.equal(afterBalance, beforeBalance - 15000);
    });

    it('returns 404 for non-existent template', async () => {
      await agent().post('/api/transactions/from-template/99999').send({}).expect(404);
    });

    it('requires account_id either on template or in body (400)', async () => {
      const tmpl = await agent().post('/api/transaction-templates')
        .send({ name: 'No Account', amount: 100 })
        .expect(201);

      await agent().post(`/api/transactions/from-template/${tmpl.body.template.id}`)
        .send({})
        .expect(400);
    });

    it('requires amount either on template or in body (400)', async () => {
      const tmpl = await agent().post('/api/transaction-templates')
        .send({ name: 'No Amount', account_id: account.id })
        .expect(201);

      await agent().post(`/api/transactions/from-template/${tmpl.body.template.id}`)
        .send({})
        .expect(400);
    });

    it('rejects invalid type override (400)', async () => {
      const tmpl = await agent().post('/api/transaction-templates')
        .send({ name: 'Test', amount: 100, account_id: account.id })
        .expect(201);

      await agent().post(`/api/transactions/from-template/${tmpl.body.template.id}`)
        .send({ type: 'invalid' })
        .expect(400);
    });

    it('creates income transaction and increases balance', async () => {
      const tmpl = await agent().post('/api/transaction-templates')
        .send({ name: 'Salary', amount: 50000, type: 'income', account_id: account.id })
        .expect(201);

      const beforeList = await agent().get('/api/accounts').expect(200);
      const beforeBalance = beforeList.body.accounts.find(a => a.id === account.id).balance;

      await agent().post(`/api/transactions/from-template/${tmpl.body.template.id}`).send({}).expect(201);

      const afterList = await agent().get('/api/accounts').expect(200);
      const afterBalance = afterList.body.accounts.find(a => a.id === account.id).balance;
      assert.equal(afterBalance, beforeBalance + 50000);
    });
  });
});
