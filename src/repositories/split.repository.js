module.exports = function createSplitRepository({ db }) {

  function getMembership(groupId, userId) {
    return db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  }

  function getGroupExpenses(groupId) {
    return db.prepare(`
      SELECT se.*, gm.display_name as paid_by_name
      FROM shared_expenses se JOIN group_members gm ON se.paid_by = gm.id
      WHERE se.group_id = ? ORDER BY se.date DESC
    `).all(groupId);
  }

  function createExpense(groupId, data) {
    const { paid_by, amount, currency, description, category_id, date, note, split_method } = data;
    const result = db.prepare(`
      INSERT INTO shared_expenses (group_id, paid_by, amount, currency, description, category_id, date, note, split_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(groupId, paid_by, amount, currency, description, category_id || null, date, note || null, split_method || 'equal');
    return result.lastInsertRowid;
  }

  function createExpenseSplits(expenseId, memberAmounts) {
    const insert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)');
    const tx = db.transaction(() => {
      for (const { member_id, amount } of memberAmounts) {
        insert.run(expenseId, member_id, amount);
      }
    });
    tx();
  }

  function getGroupMembers(groupId) {
    return db.prepare('SELECT id FROM group_members WHERE group_id = ?').all(groupId);
  }

  function getExpense(id, groupId) {
    return db.prepare('SELECT * FROM shared_expenses WHERE id = ? AND group_id = ?').get(id, groupId);
  }

  function deleteExpense(id) {
    return db.prepare('DELETE FROM shared_expenses WHERE id = ?').run(id);
  }

  function createSettlement(groupId, data) {
    const { from_member, to_member, amount, currency, note } = data;
    const result = db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount, currency, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(groupId, from_member, to_member, amount, currency, note || null);
    return result.lastInsertRowid;
  }

  function getGroupSettlements(groupId) {
    return db.prepare('SELECT * FROM settlements WHERE group_id = ?').all(groupId);
  }

  return {
    getMembership, getGroupExpenses, createExpense, createExpenseSplits,
    getGroupMembers, getExpense, deleteExpense,
    createSettlement, getGroupSettlements,
  };
};
