module.exports = function createGoalRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY position').all(userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { name, target_amount, current_amount, currency, icon, color, deadline } = data;
    const result = db.prepare(`
      INSERT INTO savings_goals (user_id, name, target_amount, current_amount, currency, icon, color, deadline, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM savings_goals WHERE user_id = ?))
    `).run(userId, name, target_amount, current_amount || 0, currency || 'INR', icon || '🎯', color || '#10b981', deadline || null, userId);
    return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { name, target_amount, current_amount, icon, color, deadline, is_completed } = data;

    // Auto-mark completed if current_amount >= target_amount
    let effectiveCompleted = is_completed;
    const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return undefined;
    const effectiveCurrent = current_amount !== undefined ? current_amount : existing.current_amount;
    const effectiveTarget = target_amount !== undefined ? target_amount : existing.target_amount;
    if (effectiveCurrent >= effectiveTarget) {
      effectiveCompleted = 1;
    }

    db.prepare(`
      UPDATE savings_goals SET name = COALESCE(?, name), target_amount = COALESCE(?, target_amount),
      current_amount = COALESCE(?, current_amount), icon = COALESCE(?, icon), color = COALESCE(?, color),
      deadline = COALESCE(?, deadline), is_completed = COALESCE(?, is_completed), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(name, target_amount, current_amount, icon, color, deadline, effectiveCompleted, id, userId);
    return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function contribute(id, userId, amount) {
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(id, userId);
    if (!goal) return undefined;
    const newAmount = goal.current_amount + amount;
    const isCompleted = newAmount >= goal.target_amount ? 1 : goal.is_completed;
    db.prepare("UPDATE savings_goals SET current_amount = ?, is_completed = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(newAmount, isCompleted, id, userId);
    return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
  }

  return { findAllByUser, findById, create, update, delete: deleteById, contribute };
};
