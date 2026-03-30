const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeGoal } = require('./helpers');

describe('Notification UI API', () => {
  let db;

  beforeEach(() => {
    ({ db } = setup());
    cleanDb();
  });

  after(() => teardown());

  function createNotif(overrides = {}) {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    return notifRepo.create(1, {
      type: 'system',
      title: 'Test Notification',
      message: 'Test message',
      ...overrides,
    });
  }

  // ─── 1. GET /api/notifications returns list ───
  it('should return notification list via GET /api/notifications', async () => {
    createNotif({ title: 'A1', message: 'msg1' });
    createNotif({ title: 'A2', message: 'msg2' });
    createNotif({ title: 'A3', message: 'msg3' });

    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.notifications));
    assert.equal(res.body.notifications.length, 3);
    assert.equal(typeof res.body.unread_count, 'number');
    assert.equal(typeof res.body.total, 'number');
    assert.equal(res.body.total, 3);
  });

  // ─── 2. GET /api/notifications returns unread_count ───
  it('should return correct unread_count in notification list', async () => {
    const n1 = createNotif({ title: 'U1', message: 'unread1' });
    createNotif({ title: 'U2', message: 'unread2' });
    createNotif({ title: 'U3', message: 'unread3' });

    // Mark one as read
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    notifRepo.markRead(n1.id, 1);

    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    assert.equal(res.body.unread_count, 2);
  });

  // ─── 3. PUT /api/notifications/:id/read marks as read ───
  it('should mark a notification as read via PUT', async () => {
    const n = createNotif({ title: 'ReadMe', message: 'mark me read' });

    const res = await agent().put(`/api/notifications/${n.id}/read`).send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.notification.is_read, 1);

    // Verify in listing
    const list = await agent().get('/api/notifications');
    const found = list.body.notifications.find(x => x.id === n.id);
    assert.equal(found.is_read, 1);
  });

  // ─── 4. POST /api/notifications/read-all marks all ───
  it('should mark all notifications as read via POST', async () => {
    createNotif({ title: 'B1', message: 'b1' });
    createNotif({ title: 'B2', message: 'b2' });
    createNotif({ title: 'B3', message: 'b3' });

    const res = await agent().post('/api/notifications/read-all').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.updated, 3);

    const list = await agent().get('/api/notifications');
    assert.equal(list.body.unread_count, 0);
  });

  // ─── 5. Filtering by unread_only ───
  it('should filter notifications by unread_only', async () => {
    const n1 = createNotif({ title: 'F1', message: 'filter1' });
    createNotif({ title: 'F2', message: 'filter2' });
    createNotif({ title: 'F3', message: 'filter3' });

    await agent().put(`/api/notifications/${n1.id}/read`).send({});

    const res = await agent().get('/api/notifications?unread_only=1');
    assert.equal(res.status, 200);
    assert.equal(res.body.notifications.length, 2);
    res.body.notifications.forEach(n => {
      assert.equal(n.is_read, 0);
    });
  });

  // ─── 6. Pagination with limit and offset ───
  it('should paginate notifications with limit and offset', async () => {
    for (let i = 0; i < 8; i++) {
      createNotif({ title: `P${i}`, message: `page${i}` });
    }

    const page1 = await agent().get('/api/notifications?limit=3&offset=0');
    assert.equal(page1.status, 200);
    assert.equal(page1.body.notifications.length, 3);
    assert.equal(page1.body.total, 8);
    assert.equal(page1.body.limit, 3);
    assert.equal(page1.body.offset, 0);

    const page2 = await agent().get('/api/notifications?limit=3&offset=3');
    assert.equal(page2.body.notifications.length, 3);

    const page3 = await agent().get('/api/notifications?limit=3&offset=6');
    assert.equal(page3.body.notifications.length, 2);
  });

  // ─── 7. Creating notifications and verifying appearance ───
  it('should create and retrieve notification with correct fields', async () => {
    const n = createNotif({ title: 'FieldCheck', message: 'checking fields', type: 'system', link: '/dashboard' });

    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    const found = res.body.notifications.find(x => x.id === n.id);
    assert.ok(found);
    assert.equal(found.title, 'FieldCheck');
    assert.equal(found.message, 'checking fields');
    assert.equal(found.type, 'system');
    assert.equal(found.is_read, 0);
    assert.ok(found.created_at);
  });

  // ─── 8. Marking already-read notification as read is idempotent ───
  it('should handle marking an already-read notification as read', async () => {
    const n = createNotif({ title: 'Idem', message: 'idempotent' });

    await agent().put(`/api/notifications/${n.id}/read`).send({});
    const res2 = await agent().put(`/api/notifications/${n.id}/read`).send({});
    assert.equal(res2.status, 200);
    assert.equal(res2.body.notification.is_read, 1);
  });

  // ─── 9. Mark all read when none exist ───
  it('should handle mark-all-read with no notifications', async () => {
    const res = await agent().post('/api/notifications/read-all').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.updated, 0);
  });

  // ─── 10. Notifications ordered newest first ───
  it('should return notifications ordered with newest first', async () => {
    createNotif({ title: 'Oldest', message: 'first created' });
    createNotif({ title: 'Middle', message: 'second created' });
    createNotif({ title: 'Newest', message: 'third created' });

    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    assert.equal(res.body.notifications.length, 3);
    // Verify ordering: each created_at should be >= the next one (newest first)
    for (let i = 0; i < res.body.notifications.length - 1; i++) {
      assert.ok(
        new Date(res.body.notifications[i].created_at) >= new Date(res.body.notifications[i + 1].created_at)
      );
    }
  });

  // ─── 11. PUT non-existent notification returns 404 ───
  it('should return 404 when marking non-existent notification as read', async () => {
    const res = await agent().put('/api/notifications/99999/read').send({});
    assert.equal(res.status, 404);
  });

  // ─── 12. Auto-notification on large transaction appears ───
  it('should create auto-notification for large transaction and appear in list', async () => {
    const account = makeAccount();
    const category = makeCategory();

    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 15000,
      description: 'Big purchase',
      date: new Date().toISOString().slice(0, 10),
    });

    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    const large = res.body.notifications.filter(n => n.type === 'large_transaction');
    assert.ok(large.length >= 1);
    assert.ok(large[0].message.includes('15000'));
    assert.equal(res.body.unread_count, large.length);
  });
});
