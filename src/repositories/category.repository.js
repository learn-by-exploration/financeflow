module.exports = function createCategoryRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0, type } = options;
    let sql = 'SELECT * FROM categories WHERE user_id = ?';
    const params = [userId];
    if (type !== undefined) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY type, position LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    const { type } = options;
    let sql = 'SELECT COUNT(*) as count FROM categories WHERE user_id = ?';
    const params = [userId];
    if (type !== undefined) { sql += ' AND type = ?'; params.push(type); }
    return db.prepare(sql).get(...params).count;
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { name, icon, color, type, parent_id, nature } = data;
    const result = db.prepare(`
      INSERT INTO categories (user_id, name, icon, color, type, parent_id, nature, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE user_id = ? AND type = ?))
    `).run(userId, name, icon || '📁', color || '#8b5cf6', type, parent_id || null, nature || null, userId, type);
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { name, icon, color, nature } = data;
    const sets = ['name = COALESCE(?, name)', 'icon = COALESCE(?, icon)', 'color = COALESCE(?, color)'];
    const vals = [name, icon, color];
    if (data.nature !== undefined) { sets.push('nature = ?'); vals.push(nature); }
    db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND is_system = 0`)
      .run(...vals, id, userId);
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ? AND is_system = 0').run(id, userId);
  }

  return { findAllByUser, findById, create, update, delete: deleteById, countByUser };
};
