module.exports = function createBudgetRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { name, period, start_date, end_date, items } = data;
    const result = db.prepare('INSERT INTO budgets (user_id, name, period, start_date, end_date) VALUES (?, ?, ?, ?, ?)')
      .run(userId, name, period, start_date || null, end_date || null);
    const budgetId = result.lastInsertRowid;
    if (items && items.length) {
      const insert = db.prepare('INSERT INTO budget_items (budget_id, category_id, amount, rollover) VALUES (?, ?, ?, ?)');
      const tx = db.transaction(() => {
        items.forEach(item => insert.run(budgetId, item.category_id, item.amount, item.rollover ? 1 : 0));
      });
      tx();
    }
    return db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId);
  }

  function update(id, userId, data) {
    const { name, period, start_date, end_date, is_active } = data;
    db.prepare(`
      UPDATE budgets SET name = COALESCE(?, name), period = COALESCE(?, period),
      start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
      is_active = COALESCE(?, is_active), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(name, period, start_date, end_date, is_active, id, userId);
    return db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function getItems(budgetId) {
    return db.prepare(`
      SELECT bi.*, c.name as category_name, c.icon as category_icon
      FROM budget_items bi LEFT JOIN categories c ON bi.category_id = c.id
      WHERE bi.budget_id = ?
    `).all(budgetId);
  }

  function updateItem(itemId, budgetId, data) {
    const updates = [];
    const values = [];
    if (data.rollover !== undefined) { updates.push('rollover = ?'); values.push(data.rollover); }
    if (data.amount !== undefined) { updates.push('amount = ?'); values.push(data.amount); }
    if (updates.length > 0) {
      values.push(itemId);
      db.prepare(`UPDATE budget_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    return db.prepare('SELECT * FROM budget_items WHERE id = ?').get(itemId);
  }

  function findItemById(itemId, budgetId) {
    return db.prepare('SELECT * FROM budget_items WHERE id = ? AND budget_id = ?').get(itemId, budgetId);
  }

  return { findAllByUser, findById, create, update, delete: deleteById, getItems, updateItem, findItemById };
};
