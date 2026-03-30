const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent } = require('./helpers');

describe('Zod Input Validation — v0.3.1', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('Auth validation', () => {
    it('rejects register with empty username', async () => {
      const res = await rawAgent().post('/api/auth/register').send({ username: '', password: 'Password123!' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects register with short password', async () => {
      const res = await rawAgent().post('/api/auth/register').send({ username: 'newuser', password: 'short' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects register with invalid email format', async () => {
      const res = await rawAgent().post('/api/auth/register').send({ username: 'newuser', password: 'Password123!', email: 'not-email' });
      assert.equal(res.status, 400);
    });
  });

  describe('Account validation', () => {
    it('rejects account with missing name', async () => {
      const res = await agent().post('/api/accounts').send({ type: 'checking' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects account with invalid type', async () => {
      const res = await agent().post('/api/accounts').send({ name: 'Test', type: 'invalid_type' });
      assert.equal(res.status, 400);
    });

    it('rejects negative balance as NaN string', async () => {
      const res = await agent().post('/api/accounts').send({ name: 'Test', balance: 'not-a-number' });
      assert.equal(res.status, 400);
    });
  });

  describe('Transaction validation', () => {
    it('rejects transaction with non-positive amount', async () => {
      const { makeAccount } = require('./helpers');
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: -50, description: 'Bad', date: '2025-01-01',
      });
      assert.equal(res.status, 400);
    });

    it('rejects transaction with missing description', async () => {
      const { makeAccount } = require('./helpers');
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'expense', amount: 50, date: '2025-01-01',
      });
      assert.equal(res.status, 400);
    });

    it('rejects transaction with invalid type', async () => {
      const { makeAccount } = require('./helpers');
      const acct = makeAccount();
      const res = await agent().post('/api/transactions').send({
        account_id: acct.id, type: 'refund', amount: 50, description: 'Bad', date: '2025-01-01',
      });
      assert.equal(res.status, 400);
    });
  });

  describe('Budget validation', () => {
    it('rejects budget with invalid period', async () => {
      const res = await agent().post('/api/budgets').send({ name: 'Test', period: 'biweekly' });
      assert.equal(res.status, 400);
    });
  });

  describe('Goal validation', () => {
    it('rejects goal with non-positive target_amount', async () => {
      const res = await agent().post('/api/goals').send({ name: 'Savings', target_amount: 0 });
      assert.equal(res.status, 400);
    });
  });

  describe('Subscription validation', () => {
    it('rejects subscription with invalid frequency', async () => {
      const res = await agent().post('/api/subscriptions').send({ name: 'Netflix', amount: 199, frequency: 'daily' });
      assert.equal(res.status, 400);
    });
  });

  describe('Tag validation', () => {
    it('rejects tag with empty name', async () => {
      const res = await agent().post('/api/tags').send({ name: '' });
      assert.equal(res.status, 400);
    });
  });

  describe('Recurring validation', () => {
    it('rejects recurring with invalid frequency', async () => {
      const { makeAccount } = require('./helpers');
      const acct = makeAccount();
      const res = await agent().post('/api/recurring').send({
        account_id: acct.id, type: 'expense', amount: 100, description: 'Test',
        frequency: 'never', next_date: '2025-01-01',
      });
      assert.equal(res.status, 400);
    });
  });

  describe('Error format consistency', () => {
    it('validation errors always have code and message', async () => {
      const res = await rawAgent().post('/api/auth/register').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
      assert.ok(res.body.error.code);
      assert.ok(res.body.error.message);
    });
  });
});
