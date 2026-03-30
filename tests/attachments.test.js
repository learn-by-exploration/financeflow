const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { setup, cleanDb, teardown, makeAccount, makeTransaction, makeSecondUser, agent } = require('./helpers');

describe('Transaction Attachments — v0.3.15', () => {
  let account, transaction;

  before(() => setup());
  after(() => teardown());

  beforeEach(() => {
    cleanDb();
    account = makeAccount();
    transaction = makeTransaction(account.id, { description: 'Receipt test' });
  });

  // Helper: create a small valid PNG buffer (1x1 pixel)
  function makePngBuffer() {
    // Minimal valid PNG: 1x1 transparent pixel
    return Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001' +
      '0100000000376ef9240000000a49444154789c626001000000' +
      '0500010d0a2db40000000049454e44ae426082',
      'hex'
    );
  }

  function makePdfBuffer() {
    return Buffer.from('%PDF-1.4 minimal test content for validation');
  }

  describe('POST /api/transactions/:id/attachments', () => {
    it('uploads an image attachment', async () => {
      const res = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt.png');

      assert.equal(res.status, 201);
      assert.ok(res.body.attachment);
      assert.equal(res.body.attachment.transaction_id, transaction.id);
      assert.equal(res.body.attachment.original_name, 'receipt.png');
      assert.equal(res.body.attachment.mime_type, 'image/png');
      assert.ok(res.body.attachment.size > 0);
      assert.ok(res.body.attachment.id);
    });

    it('uploads a PDF attachment', async () => {
      const res = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePdfBuffer(), 'invoice.pdf');

      assert.equal(res.status, 201);
      assert.equal(res.body.attachment.original_name, 'invoice.pdf');
      assert.equal(res.body.attachment.mime_type, 'application/pdf');
    });

    it('rejects non-image/pdf files', async () => {
      const res = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', Buffer.from('hello world'), 'script.js');

      assert.equal(res.status, 400);
    });

    it('rejects files larger than 5MB', async () => {
      const bigBuf = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
      const res = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', bigBuf, 'huge.png');

      assert.equal(res.status, 400);
    });

    it('returns 404 for non-existent transaction', async () => {
      const res = await agent()
        .post('/api/transactions/99999/attachments')
        .attach('file', makePngBuffer(), 'receipt.png');

      assert.equal(res.status, 404);
    });

    it('cannot attach to another user\'s transaction', async () => {
      const user2 = makeSecondUser();
      const res = await user2.agent
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt.png');

      assert.equal(res.status, 404);
    });

    it('rejects request with no file', async () => {
      const res = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .send({});

      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/transactions/:id/attachments', () => {
    it('lists attachments for a transaction', async () => {
      // Upload two files
      await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt1.png');
      await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePdfBuffer(), 'receipt2.pdf');

      const res = await agent()
        .get(`/api/transactions/${transaction.id}/attachments`);

      assert.equal(res.status, 200);
      assert.equal(res.body.attachments.length, 2);
    });

    it('returns empty array when no attachments', async () => {
      const res = await agent()
        .get(`/api/transactions/${transaction.id}/attachments`);

      assert.equal(res.status, 200);
      assert.equal(res.body.attachments.length, 0);
    });

    it('returns 404 for non-existent transaction', async () => {
      const res = await agent()
        .get('/api/transactions/99999/attachments');

      assert.equal(res.status, 404);
    });

    it('cannot list another user\'s transaction attachments', async () => {
      const user2 = makeSecondUser();
      const res = await user2.agent
        .get(`/api/transactions/${transaction.id}/attachments`);

      assert.equal(res.status, 404);
    });
  });

  describe('GET /api/attachments/:id', () => {
    it('downloads an attachment', async () => {
      const uploadRes = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt.png');

      const attachmentId = uploadRes.body.attachment.id;
      const res = await agent()
        .get(`/api/attachments/${attachmentId}`);

      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('image/png'));
    });

    it('returns 404 for non-existent attachment', async () => {
      const res = await agent()
        .get('/api/attachments/99999');

      assert.equal(res.status, 404);
    });

    it('cannot download another user\'s attachment', async () => {
      const uploadRes = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt.png');

      const user2 = makeSecondUser();
      const res = await user2.agent
        .get(`/api/attachments/${uploadRes.body.attachment.id}`);

      assert.equal(res.status, 403);
    });
  });

  describe('DELETE /api/attachments/:id', () => {
    it('deletes an attachment and removes file from disk', async () => {
      const uploadRes = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt.png');

      const attachment = uploadRes.body.attachment;
      assert.ok(fs.existsSync(attachment.file_path));

      const res = await agent()
        .delete(`/api/attachments/${attachment.id}`);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });

      // File should be removed from disk
      assert.ok(!fs.existsSync(attachment.file_path));

      // DB record should be gone
      const listRes = await agent()
        .get(`/api/transactions/${transaction.id}/attachments`);
      assert.equal(listRes.body.attachments.length, 0);
    });

    it('returns 404 for non-existent attachment', async () => {
      const res = await agent()
        .delete('/api/attachments/99999');

      assert.equal(res.status, 404);
    });

    it('cannot delete another user\'s attachment', async () => {
      const uploadRes = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt.png');

      const user2 = makeSecondUser();
      const res = await user2.agent
        .delete(`/api/attachments/${uploadRes.body.attachment.id}`);

      assert.equal(res.status, 403);
    });
  });

  describe('Cascade delete', () => {
    it('deletes attachments when transaction is deleted', async () => {
      const uploadRes = await agent()
        .post(`/api/transactions/${transaction.id}/attachments`)
        .attach('file', makePngBuffer(), 'receipt.png');

      const filePath = uploadRes.body.attachment.file_path;
      assert.ok(fs.existsSync(filePath));

      // Delete the transaction
      await agent().delete(`/api/transactions/${transaction.id}`);

      // Attachment DB records should be cascade-deleted
      const { db } = setup();
      const rows = db.prepare('SELECT * FROM attachments WHERE transaction_id = ?').all(transaction.id);
      assert.equal(rows.length, 0);
    });
  });
});
