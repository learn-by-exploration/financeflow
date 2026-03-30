module.exports = function createTagRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    return db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name LIMIT ? OFFSET ?').all(userId, Number(limit), Number(offset));
  }

  function countByUser(userId) {
    return db.prepare('SELECT COUNT(*) as count FROM tags WHERE user_id = ?').get(userId).count;
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function findByName(userId, name) {
    return db.prepare('SELECT * FROM tags WHERE user_id = ? AND name = ?').get(userId, name);
  }

  function create(userId, data) {
    const { name, color } = data;
    const result = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, name, color || null);
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const updates = [];
    const values = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name.trim()); }
    if (data.color !== undefined) { updates.push('color = ?'); values.push(data.color); }
    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  function getTransactionTags(transactionId) {
    return db.prepare('SELECT tg.id, tg.name, tg.color FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tt.transaction_id = ?').all(transactionId);
  }

  function linkTransactionTags(transactionId, tagIds) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');
    for (const tid of tagIds) {
      insertTag.run(transactionId, tid);
    }
  }

  return { findAllByUser, findById, findByName, create, update, delete: deleteById, getTransactionTags, linkTransactionTags, countByUser };
};
