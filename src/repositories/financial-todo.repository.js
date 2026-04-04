// src/repositories/financial-todo.repository.js
module.exports = function createFinancialTodoRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0, status, priority } = options;
    let sql = 'SELECT * FROM financial_todos WHERE user_id = ?';
    const params = [userId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (priority) { sql += ' AND priority = ?'; params.push(priority); }
    sql += ' ORDER BY CASE priority WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 WHEN \'low\' THEN 3 END, created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    const { status, priority } = options;
    let sql = 'SELECT COUNT(*) as count FROM financial_todos WHERE user_id = ?';
    const params = [userId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (priority) { sql += ' AND priority = ?'; params.push(priority); }
    return db.prepare(sql).get(...params).count;
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM financial_todos WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { title, description, priority, due_date } = data;
    const result = db.prepare(
      'INSERT INTO financial_todos (user_id, title, description, priority, due_date) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, title, description || null, priority || 'medium', due_date || null);
    return db.prepare('SELECT * FROM financial_todos WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { title, description, priority, status, due_date } = data;
    const sets = [];
    const vals = [];
    if (title !== undefined) { sets.push('title = ?'); vals.push(title); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
    if (priority !== undefined) { sets.push('priority = ?'); vals.push(priority); }
    if (status !== undefined) {
      sets.push('status = ?'); vals.push(status);
      if (status === 'completed') { sets.push("completed_at = datetime('now')"); }
      else { sets.push('completed_at = NULL'); }
    }
    if (due_date !== undefined) { sets.push('due_date = ?'); vals.push(due_date); }
    if (sets.length === 0) return findById(id, userId);
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE financial_todos SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals, id, userId);
    return findById(id, userId);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM financial_todos WHERE id = ? AND user_id = ?').run(id, userId);
  }

  return { findAllByUser, countByUser, findById, create, update, delete: deleteById };
};
