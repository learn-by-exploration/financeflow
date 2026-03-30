module.exports = function createGroupRepository({ db }) {

  function getMembership(groupId, userId) {
    return db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  }

  function findByUser(userId) {
    return db.prepare(`
      SELECT g.*, gm.role FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `).all(userId);
  }

  function create(name, icon, color, createdBy, displayName) {
    const result = db.prepare('INSERT INTO groups (name, icon, color, created_by) VALUES (?, ?, ?, ?)')
      .run(name, icon || '👥', color || '#f59e0b', createdBy);
    db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)')
      .run(result.lastInsertRowid, createdBy, displayName, 'owner');
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(result.lastInsertRowid);
  }

  function findById(id) {
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  }

  function getMembers(groupId) {
    return db.prepare('SELECT gm.*, u.username FROM group_members gm LEFT JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ?').all(groupId);
  }

  function update(id, data) {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
    if (!group) return null;
    const { name, icon, color } = data;
    db.prepare('UPDATE groups SET name = ?, icon = ?, color = ? WHERE id = ?')
      .run(name || group.name, icon || group.icon, color || group.color, id);
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  }

  function deleteById(id) {
    return db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  }

  function findUserByUsername(username) {
    return db.prepare('SELECT id, display_name FROM users WHERE username = ?').get(username);
  }

  function addMember(groupId, userId, displayName, role) {
    const result = db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)')
      .run(groupId, userId, displayName, role || 'member');
    return result.lastInsertRowid;
  }

  function getMemberById(memberId, groupId) {
    return db.prepare('SELECT * FROM group_members WHERE id = ? AND group_id = ?').get(memberId, groupId);
  }

  function getOwnerCount(groupId) {
    return db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND role = ?').get(groupId, 'owner').count;
  }

  function removeMember(memberId, groupId) {
    return db.prepare('DELETE FROM group_members WHERE id = ? AND group_id = ?').run(memberId, groupId);
  }

  // ─── Shared Budgets ───

  function getSharedBudgets(groupId) {
    return db.prepare('SELECT * FROM shared_budgets WHERE group_id = ? ORDER BY created_at DESC').all(groupId);
  }

  function createSharedBudget(groupId, name, period, items) {
    const result = db.prepare('INSERT INTO shared_budgets (group_id, name, period) VALUES (?, ?, ?)').run(groupId, name, period);
    const budgetId = result.lastInsertRowid;

    const insertedItems = [];
    if (items && items.length) {
      const insert = db.prepare('INSERT INTO shared_budget_items (shared_budget_id, category_id, amount) VALUES (?, ?, ?)');
      const tx = db.transaction(() => {
        for (const item of items) {
          const r = insert.run(budgetId, item.category_id || null, item.amount);
          insertedItems.push({ id: r.lastInsertRowid, category_id: item.category_id || null, amount: item.amount });
        }
      });
      tx();
    }

    const budget = db.prepare('SELECT * FROM shared_budgets WHERE id = ?').get(budgetId);
    return { budget, items: insertedItems };
  }

  function getSharedBudget(budgetId, groupId) {
    return db.prepare('SELECT * FROM shared_budgets WHERE id = ? AND group_id = ?').get(budgetId, groupId);
  }

  function getSharedBudgetItems(budgetId) {
    return db.prepare('SELECT * FROM shared_budget_items WHERE shared_budget_id = ?').all(budgetId);
  }

  function updateSharedBudget(budgetId, data) {
    const existing = db.prepare('SELECT * FROM shared_budgets WHERE id = ?').get(budgetId);
    if (!existing) return null;
    const { name, period, is_active } = data;
    db.prepare(`UPDATE shared_budgets SET name = ?, period = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name || existing.name, period || existing.period, is_active !== undefined ? is_active : existing.is_active, budgetId);
    return db.prepare('SELECT * FROM shared_budgets WHERE id = ?').get(budgetId);
  }

  function deleteSharedBudget(budgetId) {
    return db.prepare('DELETE FROM shared_budgets WHERE id = ?').run(budgetId);
  }

  // ─── Group Activities ───

  function createActivity(groupId, userId, action, details) {
    const result = db.prepare(
      'INSERT INTO group_activities (group_id, user_id, action, details) VALUES (?, ?, ?, ?)'
    ).run(groupId, userId || null, action, details || null);
    return result.lastInsertRowid;
  }

  function getActivities(groupId, { limit = 20, offset = 0 } = {}) {
    const activities = db.prepare(
      `SELECT ga.*, u.username, u.display_name as user_display_name
       FROM group_activities ga LEFT JOIN users u ON ga.user_id = u.id
       WHERE ga.group_id = ? ORDER BY ga.created_at DESC LIMIT ? OFFSET ?`
    ).all(groupId, Number(limit), Number(offset));
    const total = db.prepare('SELECT COUNT(*) as count FROM group_activities WHERE group_id = ?').get(groupId).count;
    return { activities, total };
  }

  function getLastReminder(groupId) {
    return db.prepare(
      "SELECT * FROM group_activities WHERE group_id = ? AND action = 'remind' ORDER BY created_at DESC LIMIT 1"
    ).get(groupId);
  }

  return {
    getMembership, findByUser, create, findById, getMembers,
    update, delete: deleteById,
    findUserByUsername, addMember, getMemberById, getOwnerCount, removeMember,
    getSharedBudgets, createSharedBudget, getSharedBudget, getSharedBudgetItems,
    updateSharedBudget, deleteSharedBudget,
    createActivity, getActivities, getLastReminder,
  };
};
