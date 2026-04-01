// src/repositories/data.repository.js
// Extracts data export queries from the data route to reduce inline SQL

module.exports = function createDataRepository({ db }) {

  /**
   * Get all user data for export. Eliminates N+1 by batch-loading nested data.
   */
  function getExportData(userId) {
    const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(userId);
    const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(userId);
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(userId);
    const recurringRules = db.prepare('SELECT * FROM recurring_rules WHERE user_id = ?').all(userId);
    const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);
    const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId);
    const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').all(userId);
    const rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ?').all(userId);

    // Budgets + items (batch load items instead of N+1)
    const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
    if (budgets.length > 0) {
      const budgetIds = budgets.map(b => b.id);
      const placeholders = budgetIds.map(() => '?').join(',');
      const allItems = db.prepare(`SELECT * FROM budget_items WHERE budget_id IN (${placeholders})`).all(...budgetIds);
      const itemsByBudget = {};
      for (const item of allItems) {
        if (!itemsByBudget[item.budget_id]) itemsByBudget[item.budget_id] = [];
        itemsByBudget[item.budget_id].push(item);
      }
      for (const b of budgets) {
        b.items = itemsByBudget[b.id] || [];
      }
    }

    return { accounts, categories, transactions, recurring_rules: recurringRules, budgets, goals, subscriptions, settings, rules };
  }

  /**
   * Get groups the user belongs to with all nested data.
   * Uses batch loading to avoid N+1 queries.
   */
  function getExportGroups(userId) {
    const groups = db.prepare(`
      SELECT g.* FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
    `).all(userId);

    if (groups.length === 0) return [];

    const groupIds = groups.map(g => g.id);
    const placeholders = groupIds.map(() => '?').join(',');

    // Batch load all nested data
    const allMembers = db.prepare(`SELECT * FROM group_members WHERE group_id IN (${placeholders})`).all(...groupIds);
    const allExpenses = db.prepare(`SELECT * FROM shared_expenses WHERE group_id IN (${placeholders})`).all(...groupIds);
    const allSettlements = db.prepare(`SELECT * FROM settlements WHERE group_id IN (${placeholders})`).all(...groupIds);

    // Batch load splits for all expenses
    let allSplits = [];
    if (allExpenses.length > 0) {
      const expenseIds = allExpenses.map(e => e.id);
      const ePlaceholders = expenseIds.map(() => '?').join(',');
      allSplits = db.prepare(`SELECT * FROM expense_splits WHERE expense_id IN (${ePlaceholders})`).all(...expenseIds);
    }

    // Index by parent
    const membersByGroup = {};
    for (const m of allMembers) {
      if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
      membersByGroup[m.group_id].push(m);
    }
    const expensesByGroup = {};
    for (const e of allExpenses) {
      if (!expensesByGroup[e.group_id]) expensesByGroup[e.group_id] = [];
      expensesByGroup[e.group_id].push(e);
    }
    const splitsByExpense = {};
    for (const s of allSplits) {
      if (!splitsByExpense[s.expense_id]) splitsByExpense[s.expense_id] = [];
      splitsByExpense[s.expense_id].push(s);
    }
    const settlementsByGroup = {};
    for (const s of allSettlements) {
      if (!settlementsByGroup[s.group_id]) settlementsByGroup[s.group_id] = [];
      settlementsByGroup[s.group_id].push(s);
    }

    // Assemble
    for (const g of groups) {
      g.members = membersByGroup[g.id] || [];
      g.expenses = (expensesByGroup[g.id] || []).map(e => {
        e.splits = splitsByExpense[e.id] || [];
        return e;
      });
      g.settlements = settlementsByGroup[g.id] || [];
    }

    return groups;
  }

  /**
   * Delete all user data in preparation for import (reverse dependency order).
   */
  function deleteAllUserData(userId) {
    db.prepare('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM shared_expenses WHERE group_id IN (SELECT g.id FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?))').run(userId);
    db.prepare('DELETE FROM shared_expenses WHERE group_id IN (SELECT g.id FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?)').run(userId);
    db.prepare('DELETE FROM settlements WHERE group_id IN (SELECT g.id FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?)').run(userId);
    db.prepare('DELETE FROM group_members WHERE group_id IN (SELECT g.id FROM groups g WHERE g.created_by = ?)').run(userId);
    db.prepare('DELETE FROM groups WHERE created_by = ?').run(userId);
    db.prepare('DELETE FROM category_rules WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM budget_items WHERE budget_id IN (SELECT id FROM budgets WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM budgets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM recurring_rules WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM savings_goals WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM categories WHERE user_id = ?').run(userId);
  }

  return { getExportData, getExportGroups, deleteAllUserData };
};
