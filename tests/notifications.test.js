const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeGoal, makeSecondUser } = require('./helpers');

describe('Notifications', () => {
  let db;

  beforeEach(() => {
    ({ db } = setup());
    cleanDb();
  });

  after(() => teardown());

  // ─── Direct CRUD ───

  it('should create a notification directly via repository', () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    const notif = notifRepo.create(1, {
      type: 'system',
      title: 'Test',
      message: 'Hello world',
      link: '/test',
    });
    assert.ok(notif.id);
    assert.equal(notif.type, 'system');
    assert.equal(notif.title, 'Test');
    assert.equal(notif.message, 'Hello world');
    assert.equal(notif.link, '/test');
    assert.equal(notif.is_read, 0);
  });

  it('should list notifications with unread count', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    notifRepo.create(1, { type: 'system', title: 'N1', message: 'msg1' });
    notifRepo.create(1, { type: 'system', title: 'N2', message: 'msg2' });
    notifRepo.create(1, { type: 'system', title: 'N3', message: 'msg3' });

    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    assert.equal(res.body.notifications.length, 3);
    assert.equal(res.body.unread_count, 3);
    assert.equal(res.body.total, 3);
  });

  it('should mark a notification as read', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    const notif = notifRepo.create(1, { type: 'system', title: 'N1', message: 'msg1' });

    const res = await agent().put(`/api/notifications/${notif.id}/read`).send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.notification.is_read, 1);

    // Verify unread count decreased
    const list = await agent().get('/api/notifications');
    assert.equal(list.body.unread_count, 0);
  });

  it('should mark all notifications as read', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    notifRepo.create(1, { type: 'system', title: 'N1', message: 'msg1' });
    notifRepo.create(1, { type: 'system', title: 'N2', message: 'msg2' });
    notifRepo.create(1, { type: 'system', title: 'N3', message: 'msg3' });

    const res = await agent().post('/api/notifications/read-all').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.updated, 3);

    const list = await agent().get('/api/notifications');
    assert.equal(list.body.unread_count, 0);
  });

  it('should delete a notification', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    const notif = notifRepo.create(1, { type: 'system', title: 'N1', message: 'msg1' });

    const res = await agent().delete(`/api/notifications/${notif.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const list = await agent().get('/api/notifications');
    assert.equal(list.body.notifications.length, 0);
  });

  it('should return 404 for non-existent notification on read', async () => {
    const res = await agent().put('/api/notifications/9999/read').send({});
    assert.equal(res.status, 404);
  });

  it('should return 404 for non-existent notification on delete', async () => {
    const res = await agent().delete('/api/notifications/9999');
    assert.equal(res.status, 404);
  });

  // ─── Auto-notifications ───

  it('should auto-notify on large transaction', async () => {
    const account = makeAccount();
    const category = makeCategory();

    const res = await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 15000,
      description: 'Expensive purchase',
      date: new Date().toISOString().slice(0, 10),
    });
    assert.equal(res.status, 201);

    const notifs = await agent().get('/api/notifications');
    assert.equal(notifs.status, 200);
    const large = notifs.body.notifications.filter(n => n.type === 'large_transaction');
    assert.equal(large.length, 1);
    assert.ok(large[0].message.includes('15000'));
  });

  it('should not auto-notify on transaction below threshold', async () => {
    const account = makeAccount();
    const category = makeCategory();

    const res = await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 500,
      description: 'Small purchase',
      date: new Date().toISOString().slice(0, 10),
    });
    assert.equal(res.status, 201);

    const notifs = await agent().get('/api/notifications');
    const large = notifs.body.notifications.filter(n => n.type === 'large_transaction');
    assert.equal(large.length, 0);
  });

  it('should auto-notify on goal completion', async () => {
    const goal = makeGoal({ target_amount: 1000, current_amount: 900 });

    const res = await agent().put(`/api/goals/${goal.id}`).send({
      current_amount: 1000,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.goal.is_completed, 1);

    const notifs = await agent().get('/api/notifications');
    const goalNotifs = notifs.body.notifications.filter(n => n.type === 'goal_completed');
    assert.equal(goalNotifs.length, 1);
    assert.ok(goalNotifs[0].message.includes(goal.name));
  });

  // ─── Pagination ───

  it('should paginate notifications', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    for (let i = 0; i < 10; i++) {
      notifRepo.create(1, { type: 'system', title: `N${i}`, message: `msg${i}` });
    }

    const page1 = await agent().get('/api/notifications?limit=3&offset=0');
    assert.equal(page1.status, 200);
    assert.equal(page1.body.notifications.length, 3);
    assert.equal(page1.body.total, 10);

    const page2 = await agent().get('/api/notifications?limit=3&offset=3');
    assert.equal(page2.body.notifications.length, 3);

    const page4 = await agent().get('/api/notifications?limit=3&offset=9');
    assert.equal(page4.body.notifications.length, 1);
  });

  it('should filter unread only', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    const n1 = notifRepo.create(1, { type: 'system', title: 'N1', message: 'msg1' });
    notifRepo.create(1, { type: 'system', title: 'N2', message: 'msg2' });
    notifRepo.markRead(n1.id, 1);

    const res = await agent().get('/api/notifications?unread_only=1');
    assert.equal(res.body.notifications.length, 1);
    assert.equal(res.body.notifications[0].title, 'N2');
  });

  // ─── Multi-user isolation ───

  it('should only show own notifications', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    notifRepo.create(1, { type: 'system', title: 'User1 Notif', message: 'msg' });

    const { agent: agent2 } = makeSecondUser();
    notifRepo.create(2, { type: 'system', title: 'User2 Notif', message: 'msg' });

    // User 1 sees only their notification
    const res1 = await agent().get('/api/notifications');
    assert.equal(res1.body.notifications.length, 1);
    assert.equal(res1.body.notifications[0].title, 'User1 Notif');

    // User 2 sees only their notification
    const res2 = await agent2.get('/api/notifications');
    assert.equal(res2.body.notifications.length, 1);
    assert.equal(res2.body.notifications[0].title, 'User2 Notif');
  });

  it('should not let user mark another user notification as read', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    const { agent: agent2 } = makeSecondUser();
    const notif = notifRepo.create(1, { type: 'system', title: 'Private', message: 'msg' });

    const res = await agent2.put(`/api/notifications/${notif.id}/read`).send({});
    assert.equal(res.status, 404);
  });

  it('should not let user delete another user notification', async () => {
    const createNotificationRepository = require('../src/repositories/notification.repository');
    const notifRepo = createNotificationRepository({ db });
    const { agent: agent2 } = makeSecondUser();
    const notif = notifRepo.create(1, { type: 'system', title: 'Private', message: 'msg' });

    const res = await agent2.delete(`/api/notifications/${notif.id}`);
    assert.equal(res.status, 404);
  });

  // ─── Notification service unit tests ───

  it('should create budget overspend notification when spent > allocated', () => {
    const createNotificationService = require('../src/services/notification.service');
    const notifService = createNotificationService({ db });
    const notif = notifService.checkBudgetOverspend(1, 10, 5, 5000, 3000);
    assert.ok(notif);
    assert.equal(notif.type, 'budget_overspend');
    assert.ok(notif.message.includes('2000'));
  });

  it('should not create budget overspend notification when within budget', () => {
    const createNotificationService = require('../src/services/notification.service');
    const notifService = createNotificationService({ db });
    const notif = notifService.checkBudgetOverspend(1, 10, 5, 2000, 3000);
    assert.equal(notif, null);
  });

  it('should use configurable threshold from user settings', async () => {
    // Set custom threshold
    db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'large_transaction_threshold', '5000')").run(1);

    const account = makeAccount();
    const category = makeCategory();

    // 7000 exceeds custom threshold of 5000
    await agent().post('/api/transactions').send({
      account_id: account.id,
      category_id: category.id,
      type: 'expense',
      amount: 7000,
      description: 'Medium purchase',
      date: new Date().toISOString().slice(0, 10),
    });

    const notifs = await agent().get('/api/notifications');
    const large = notifs.body.notifications.filter(n => n.type === 'large_transaction');
    assert.equal(large.length, 1);
  });
});
