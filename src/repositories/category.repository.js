module.exports = function createCategoryRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, position').all(userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { name, icon, color, type, parent_id } = data;
    const result = db.prepare(`
      INSERT INTO categories (user_id, name, icon, color, type, parent_id, position)
      VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE user_id = ? AND type = ?))
    `).run(userId, name, icon || '📁', color || '#8b5cf6', type, parent_id || null, userId, type);
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { name, icon, color } = data;
    db.prepare('UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ? AND user_id = ? AND is_system = 0')
      .run(name, icon, color, id, userId);
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ? AND is_system = 0').run(id, userId);
  }

  return { findAllByUser, findById, create, update, delete: deleteById };
};
