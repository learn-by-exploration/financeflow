module.exports = function createGoalRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0, status } = options;
    let sql = 'SELECT * FROM savings_goals WHERE user_id = ?';
    const params = [userId];
    if (status === 'active') { sql += ' AND is_completed = 0'; }
    else if (status === 'completed') { sql += ' AND is_completed = 1'; }
    sql += ' ORDER BY position LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    const { status } = options;
    let sql = 'SELECT COUNT(*) as count FROM savings_goals WHERE user_id = ?';
    const params = [userId];
    if (status === 'active') { sql += ' AND is_completed = 0'; }
    else if (status === 'completed') { sql += ' AND is_completed = 1'; }
    return db.prepare(sql).get(...params).count;
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

  function linkTransaction(goalId, transactionId, amount) {
    const result = db.prepare(
      'INSERT INTO goal_transactions (goal_id, transaction_id, amount) VALUES (?, ?, ?)'
    ).run(goalId, transactionId, amount);
    return db.prepare('SELECT * FROM goal_transactions WHERE id = ?').get(result.lastInsertRowid);
  }

  function unlinkTransaction(goalId, transactionId) {
    return db.prepare('DELETE FROM goal_transactions WHERE goal_id = ? AND transaction_id = ?').run(goalId, transactionId);
  }

  function getLinkedTransactions(goalId) {
    return db.prepare(`
      SELECT gt.id as link_id, gt.amount as linked_amount, gt.created_at as linked_at,
             t.id, t.account_id, t.type, t.amount as transaction_amount, t.currency, t.description, t.date, t.payee
      FROM goal_transactions gt
      JOIN transactions t ON t.id = gt.transaction_id
      WHERE gt.goal_id = ?
      ORDER BY gt.created_at DESC
    `).all(goalId);
  }

  function getLinkedTransactionSum(goalId) {
    const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM goal_transactions WHERE goal_id = ?').get(goalId);
    return row.total;
  }

  function recalculateCurrentAmount(goalId, userId) {
    const total = getLinkedTransactionSum(goalId);
    const isCompleted = db.prepare('SELECT target_amount FROM savings_goals WHERE id = ?').get(goalId);
    const completed = isCompleted && total >= isCompleted.target_amount ? 1 : 0;
    db.prepare("UPDATE savings_goals SET current_amount = ?, is_completed = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(total, completed, goalId, userId);
    return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);
  }

  function setAutoAllocate(goalId, userId, percent) {
    db.prepare("UPDATE savings_goals SET auto_allocate_percent = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(percent, goalId, userId);
    return db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, userId);
  }

  function getAutoAllocateGoals(userId) {
    return db.prepare('SELECT * FROM savings_goals WHERE user_id = ? AND auto_allocate_percent > 0 AND is_completed = 0').all(userId);
  }

  function findLinkedTransaction(goalId, transactionId) {
    return db.prepare('SELECT * FROM goal_transactions WHERE goal_id = ? AND transaction_id = ?').get(goalId, transactionId);
  }

  return {
    findAllByUser, findById, create, update, delete: deleteById, contribute, countByUser,
    linkTransaction, unlinkTransaction, getLinkedTransactions, getLinkedTransactionSum,
    recalculateCurrentAmount, setAutoAllocate, getAutoAllocateGoals, findLinkedTransaction
  };
};
