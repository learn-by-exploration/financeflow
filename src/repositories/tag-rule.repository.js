// src/repositories/tag-rule.repository.js
module.exports = function createTagRuleRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare(
      'SELECT * FROM tag_rules WHERE user_id = ? ORDER BY position ASC, id ASC'
    ).all(userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM tag_rules WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { pattern, tag, match_type, match_value, position } = data;
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM tag_rules WHERE user_id = ?').get(userId).max;
    const result = db.prepare(
      'INSERT INTO tag_rules (user_id, pattern, tag, match_type, match_value, position, is_enabled) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(userId, pattern, tag, match_type || 'description', match_value || null, position !== undefined ? position : maxPos + 1);
    return db.prepare('SELECT * FROM tag_rules WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const fields = [];
    const params = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && ['pattern', 'tag', 'match_type', 'match_value', 'position', 'is_enabled'].includes(key)) {
        fields.push(`${key} = ?`);
        params.push(val);
      }
    }
    if (fields.length === 0) return findById(id, userId);
    fields.push("updated_at = datetime('now')");
    params.push(id, userId);
    db.prepare(`UPDATE tag_rules SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    return findById(id, userId);
  }

  function remove(id, userId) {
    return db.prepare('DELETE FROM tag_rules WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function getEnabledRules(userId) {
    return db.prepare(
      'SELECT * FROM tag_rules WHERE user_id = ? AND is_enabled = 1 ORDER BY position ASC, id ASC'
    ).all(userId);
  }

  return { findAllByUser, findById, create, update, remove, getEnabledRules };
};
