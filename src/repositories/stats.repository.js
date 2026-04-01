// src/repositories/stats.repository.js — Data access layer for stats queries
// Why: Extract reusable SQL from stats.js to follow repository pattern (SRP)
module.exports = function createStatsRepository({ db }) {

  function getAccountSummary(userId) {
    return db.prepare(`
      SELECT
        SUM(CASE WHEN type NOT IN ('credit_card', 'loan') THEN balance ELSE 0 END) as assets,
        SUM(CASE WHEN type IN ('credit_card', 'loan') THEN ABS(balance) ELSE 0 END) as liabilities
      FROM accounts WHERE user_id = ? AND is_active = 1
    `).get(userId);
  }

  function getMonthTotals(userId, monthStart) {
    const income = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ?"
    ).get(userId, monthStart);
    const expense = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ?"
    ).get(userId, monthStart);
    return { income: income.total, expense: expense.total };
  }

  function getTopCategories(userId, monthStart, limit = 5) {
    return db.prepare(`
      SELECT c.name, c.icon, SUM(t.amount) as total
      FROM transactions t JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ?
      GROUP BY c.id ORDER BY total DESC LIMIT ?
    `).all(userId, monthStart, limit);
  }

  function getRecentTransactions(userId, limit = 10) {
    return db.prepare(`
      SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC LIMIT ?
    `).all(userId, limit);
  }

  function getSubscriptionMonthlyTotal(userId) {
    return db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as monthly FROM subscriptions WHERE user_id = ? AND is_active = 1 AND frequency = 'monthly'"
    ).get(userId);
  }

  function getTrendsByMonths(userId, months) {
    return db.prepare(`
      SELECT strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions WHERE user_id = ?
      GROUP BY month ORDER BY month DESC LIMIT ?
    `).all(userId, months);
  }

  function getTrendsByDateRange(userId, fromDate, toDate) {
    return db.prepare(`
      SELECT strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?
      GROUP BY month ORDER BY month ASC
    `).all(userId, fromDate, toDate);
  }

  function getCategoryBreakdown(userId, type, from, to) {
    let sql = `
      SELECT c.id, c.name, c.icon, c.color, SUM(t.amount) as total, COUNT(t.id) as count
      FROM transactions t JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = ?
    `;
    const params = [userId, type];
    if (from) { sql += ' AND t.date >= ?'; params.push(from); }
    if (to) { sql += ' AND t.date <= ?'; params.push(to); }
    sql += ' GROUP BY c.id ORDER BY total DESC';
    return db.prepare(sql).all(...params);
  }

  function getDailySpending(userId, from, to) {
    return db.prepare(`
      SELECT date, SUM(amount) as total
      FROM transactions
      WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?
      GROUP BY date ORDER BY date ASC
    `).all(userId, from, to);
  }

  function getNetWorthSnapshots(userId, limit = 12) {
    return db.prepare(
      'SELECT * FROM net_worth_snapshots WHERE user_id = ? ORDER BY date DESC LIMIT ?'
    ).all(userId, limit);
  }

  function getSavingsChallenges(userId) {
    return db.prepare('SELECT * FROM savings_challenges WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  }

  function createSavingsChallenge(userId, data) {
    const result = db.prepare(
      'INSERT INTO savings_challenges (user_id, name, target_amount, current_amount, start_date, end_date) VALUES (?, ?, ?, 0, ?, ?)'
    ).run(userId, data.name, data.target_amount, data.start_date, data.end_date);
    return db.prepare('SELECT * FROM savings_challenges WHERE id = ?').get(result.lastInsertRowid);
  }

  function deleteSavingsChallenge(id, userId) {
    return db.prepare('DELETE FROM savings_challenges WHERE id = ? AND user_id = ?').run(id, userId);
  }

  // ─── Financial Health queries ───

  function getEarliestTransaction(userId) {
    return db.prepare('SELECT MIN(date) as earliest FROM transactions WHERE user_id = ?').get(userId);
  }

  function getAvgMonthlyExpense(userId, sinceDate) {
    return db.prepare(
      "SELECT COALESCE(AVG(monthly), 0) as avg FROM (SELECT SUM(amount) as monthly FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ? GROUP BY strftime('%Y-%m', date))"
    ).get(userId, sinceDate);
  }

  function getAvgMonthlyIncome(userId, sinceDate) {
    return db.prepare(
      "SELECT COALESCE(AVG(monthly), 0) as avg FROM (SELECT SUM(amount) as monthly FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ? GROUP BY strftime('%Y-%m', date))"
    ).get(userId, sinceDate);
  }

  function getSavingsAccountsTotal(userId) {
    return db.prepare(
      "SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE user_id = ? AND type IN ('savings', 'cash') AND is_active = 1"
    ).get(userId);
  }

  // ─── Budget Variance queries ───

  function getActiveBudgets(userId) {
    return db.prepare('SELECT * FROM budgets WHERE user_id = ? AND is_active = 1').all(userId);
  }

  function getBudgetItemsWithCategory(budgetId) {
    return db.prepare(
      'SELECT bi.*, c.name as category_name FROM budget_items bi LEFT JOIN categories c ON bi.category_id = c.id WHERE bi.budget_id = ?'
    ).all(budgetId);
  }

  function getCategorySpendInRange(userId, categoryId, startDate, endDate) {
    return db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND category_id = ? AND date >= ? AND date <= ?"
    ).get(userId, categoryId, startDate, endDate);
  }

  // ─── Financial Snapshot queries ───

  function getMonthlyIncomeExpense(userId, monthStart) {
    const income = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ?"
    ).get(userId, monthStart);
    const expense = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ?"
    ).get(userId, monthStart);
    return { income: income.total, expense: expense.total };
  }

  function getActiveBudgetCount(userId) {
    return db.prepare('SELECT COUNT(*) as count FROM budgets WHERE user_id = ? AND is_active = 1').get(userId);
  }

  function getGoalsSummary(userId) {
    return db.prepare(
      'SELECT COUNT(*) as count, COALESCE(SUM(current_amount), 0) as saved, COALESCE(SUM(target_amount), 0) as target FROM savings_goals WHERE user_id = ? AND is_completed = 0'
    ).get(userId);
  }

  function getSubscriptionsSummary(userId) {
    return db.prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(CASE WHEN frequency = 'monthly' THEN amount WHEN frequency = 'yearly' THEN amount / 12.0 WHEN frequency = 'quarterly' THEN amount / 3.0 ELSE amount * 4.33 END), 0) as monthly_total FROM subscriptions WHERE user_id = ? AND is_active = 1"
    ).get(userId);
  }

  function getTransactionCount(userId, sinceDate) {
    return db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND date >= ?').get(userId, sinceDate);
  }

  function getActiveAccountCount(userId) {
    return db.prepare("SELECT COUNT(*) as count FROM accounts WHERE user_id = ? AND is_active = 1").get(userId);
  }

  // ─── Debt queries ───

  function getAllDebtAccounts(userId) {
    return db.prepare(
      "SELECT * FROM accounts WHERE user_id = ? AND type IN ('credit_card', 'loan') AND is_active = 1"
    ).all(userId);
  }

  // ─── Savings Rate History ───

  function getIncomeExpenseInRange(userId, from, to) {
    const income = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ? AND date <= ?"
    ).get(userId, from, to);
    const expense = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?"
    ).get(userId, from, to);
    return { income: income.total, expense: expense.total };
  }

  // ─── User Settings ───

  function getUserSetting(userId, key) {
    return db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key);
  }

  // ─── User Groups ───

  function getUserGroups(userId) {
    return db.prepare(`
      SELECT g.id, g.name FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
    `).all(userId);
  }

  function getGroupMemberId(groupId, userId) {
    return db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  }

  return {
    getAccountSummary,
    getMonthTotals,
    getTopCategories,
    getRecentTransactions,
    getSubscriptionMonthlyTotal,
    getTrendsByMonths,
    getTrendsByDateRange,
    getCategoryBreakdown,
    getDailySpending,
    getNetWorthSnapshots,
    getSavingsChallenges,
    createSavingsChallenge,
    deleteSavingsChallenge,
    getEarliestTransaction,
    getAvgMonthlyExpense,
    getAvgMonthlyIncome,
    getSavingsAccountsTotal,
    getActiveBudgets,
    getBudgetItemsWithCategory,
    getCategorySpendInRange,
    getMonthlyIncomeExpense,
    getActiveBudgetCount,
    getGoalsSummary,
    getSubscriptionsSummary,
    getTransactionCount,
    getActiveAccountCount,
    getAllDebtAccounts,
    getIncomeExpenseInRange,
    getUserSetting,
    getUserGroups,
    getGroupMemberId,
  };
};
