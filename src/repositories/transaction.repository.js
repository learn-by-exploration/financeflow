module.exports = function createTransactionRepository({ db }) {

  function findAllByUser(userId, filters = {}) {
    const { account_id, category_id, type, from, to, limit = 50, offset = 0, search, tag_id } = filters;
    let sql = 'SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id WHERE t.user_id = ?';
    const params = [userId];
    if (account_id) { sql += ' AND t.account_id = ?'; params.push(account_id); }
    if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
    if (type) { sql += ' AND t.type = ?'; params.push(type); }
    if (from) { sql += ' AND t.date >= ?'; params.push(from); }
    if (to) { sql += ' AND t.date <= ?'; params.push(to); }
    if (search) { sql += ' AND (t.description LIKE ? OR t.payee LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (tag_id) { sql += ' AND t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id = ?)'; params.push(tag_id); }
    sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    return db.prepare(sql).all(...params);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { account_id, category_id, type, amount, currency, description, note, date, payee, tag_ids } = data;
    const result = db.prepare(`
      INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, account_id, category_id || null, type, amount, currency, description, note || null, date, payee || null, JSON.stringify(tag_ids || []));
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { category_id, description, note, date, payee, tags, amount } = data;
    db.prepare(`
      UPDATE transactions SET category_id = COALESCE(?, category_id), description = COALESCE(?, description),
      note = COALESCE(?, note), date = COALESCE(?, date), payee = COALESCE(?, payee),
      tags = COALESCE(?, tags), amount = COALESCE(?, amount), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(category_id, description, note, date, payee, tags ? JSON.stringify(tags) : null, amount, id, userId);
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  }

  function countByUser(userId) {
    return db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(userId).count;
  }

  function getTagsForTransaction(transactionId) {
    return db.prepare('SELECT tg.id, tg.name, tg.color FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tt.transaction_id = ?').all(transactionId);
  }

  function linkTags(transactionId, tagIds) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');
    for (const tid of tagIds) {
      insertTag.run(transactionId, tid);
    }
  }

  return { findAllByUser, findById, create, update, delete: deleteById, countByUser, getTagsForTransaction, linkTags };
};
