module.exports = function createNotificationRepository({ db }) {

  function create(userId, data) {
    const { type, title, message, link } = data;
    const result = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, type, title, message, link || null);
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
  }

  function findAllByUser(userId, options = {}) {
    const { limit = 20, offset = 0, unread_only } = options;
    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];
    if (unread_only === '1' || unread_only === 'true') {
      sql += ' AND is_read = 0';
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const notifications = db.prepare(sql).all(...params);

    const unread_count = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(userId).count;

    let countSql = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?';
    const countParams = [userId];
    if (unread_only === '1' || unread_only === 'true') {
      countSql += ' AND is_read = 0';
    }
    const total = db.prepare(countSql).get(...countParams).count;

    return { notifications, unread_count, total };
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function markRead(id, userId) {
    db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").run(id, userId);
    return findById(id, userId);
  }

  function markAllRead(userId) {
    const result = db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0").run(userId);
    return result.changes;
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId);
  }

  return { create, findAllByUser, findById, markRead, markAllRead, delete: deleteById };
};
