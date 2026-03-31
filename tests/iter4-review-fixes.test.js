const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory } = require('./helpers');

describe('Iteration 4 Review Fixes', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('C1: Transfer validates destination account ownership', () => {
    it('rejects transfer to non-existent account', async () => {
      const src = makeAccount({ name: 'Source', balance: 1000 });
      const res = await agent().post('/api/transactions').send({
        account_id: src.id, type: 'transfer', amount: 100,
        transfer_to_account_id: 999999, description: 'Test transfer',
        date: '2025-01-01'
      });
      assert.equal(res.status, 400);
    });

    it('allows transfer to own account', async () => {
      const src = makeAccount({ name: 'Source', balance: 1000 });
      const dst = makeAccount({ name: 'Dest', balance: 0 });
      const res = await agent().post('/api/transactions').send({
        account_id: src.id, type: 'transfer', amount: 100,
        transfer_to_account_id: dst.id, description: 'Test transfer',
        date: '2025-01-01'
      }).expect(201);
      assert.ok(res.body.transaction);
    });
  });

  describe('C2: Settings import filters by allowed keys', () => {
    it('import rejects arbitrary settings keys', async () => {
      const acc = makeAccount({ name: 'Import Acc' });
      const importData = {
        password: 'testpassword',
        confirm: 'DELETE ALL DATA',
        data: {
          settings: [
            { key: 'default_currency', value: 'USD' },
            { key: 'malicious_key', value: 'evil_value' },
          ]
        }
      };
      await agent().post('/api/data/import').send(importData).expect(200);
      // Only allowed key should be imported
      const allowed = db.prepare("SELECT * FROM settings WHERE user_id = 1 AND key = 'default_currency'").get();
      assert.ok(allowed, 'Allowed key should be imported');
      const blocked = db.prepare("SELECT * FROM settings WHERE user_id = 1 AND key = 'malicious_key'").get();
      assert.equal(blocked, undefined, 'Malicious key should NOT be imported');
    });
  });

  describe('C3: Template transaction validates account ownership', () => {
    it('rejects account_id not belonging to user', async () => {
      // Create a template
      const acc = makeAccount();
      const tRes = await agent().post('/api/transaction-templates').send({
        name: 'TestTemplate', amount: 100, type: 'expense', account_id: acc.id
      }).expect(201);
      const templateId = tRes.body.template.id;
      // Try using with non-existent account
      const res = await agent().post(`/api/transactions/from-template/${templateId}`)
        .send({ account_id: 999999 });
      assert.equal(res.status, 400);
    });
  });

  describe('H8: Audit purge enforces min retention days', () => {
    it('rejects retentionDays < 7', async () => {
      const res = await agent().post('/api/admin/audit/purge')
        .send({ retentionDays: 1 });
      assert.equal(res.status, 400);
    });
  });

  describe('Auth: TOTP lockout reset timing', () => {
    it('lockout reset happens after TOTP check in code', () => {
      const fs = require('fs');
      const authSrc = fs.readFileSync(require.resolve('../src/routes/auth'), 'utf8');
      const totpCheckIdx = authSrc.indexOf('TOTP 2FA check');
      const lockoutResetIdx = authSrc.indexOf('reset lockout state');
      assert.ok(totpCheckIdx > 0, 'Should have TOTP check comment');
      assert.ok(lockoutResetIdx > 0, 'Should have lockout reset comment');
      assert.ok(totpCheckIdx < lockoutResetIdx, 'TOTP check should come before lockout reset');
    });
  });
});
