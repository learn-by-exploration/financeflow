const express = require('express');
const router = express.Router();

module.exports = function createStatsRoutes({ db }) {

  // GET /api/stats/overview — dashboard summary
  router.get('/overview', (req, res, next) => {
    try {
      const userId = req.user.id;
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const accounts = db.prepare('SELECT SUM(CASE WHEN type NOT IN (\'credit_card\', \'loan\') THEN balance ELSE 0 END) as assets, SUM(CASE WHEN type IN (\'credit_card\', \'loan\') THEN ABS(balance) ELSE 0 END) as liabilities FROM accounts WHERE user_id = ? AND is_active = 1').get(userId);

      const monthIncome = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = \'income\' AND date >= ?').get(userId, monthStart);
      const monthExpense = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = \'expense\' AND date >= ?').get(userId, monthStart);

      const topCategories = db.prepare(`
        SELECT c.name, c.icon, SUM(t.amount) as total
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ?
        GROUP BY c.id ORDER BY total DESC LIMIT 5
      `).all(userId, monthStart);

      const recentTransactions = db.prepare(`
        SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC LIMIT 10
      `).all(userId);

      const subscriptionTotal = db.prepare('SELECT COALESCE(SUM(amount), 0) as monthly FROM subscriptions WHERE user_id = ? AND is_active = 1 AND frequency = \'monthly\'').get(userId);

      res.json({
        net_worth: (accounts.assets || 0) - (accounts.liabilities || 0),
        total_assets: accounts.assets || 0,
        total_liabilities: accounts.liabilities || 0,
        month_income: monthIncome.total,
        month_expense: monthExpense.total,
        month_savings: monthIncome.total - monthExpense.total,
        top_categories: topCategories,
        recent_transactions: recentTransactions,
        monthly_subscriptions: subscriptionTotal.monthly,
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/trends — monthly income vs expense over time
  router.get('/trends', (req, res, next) => {
    try {
      const months = parseInt(req.query.months || '12', 10);
      const trends = db.prepare(`
        SELECT strftime('%Y-%m', date) as month,
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
        FROM transactions WHERE user_id = ?
        GROUP BY month ORDER BY month DESC LIMIT ?
      `).all(req.user.id, months);
      res.json({ trends: trends.reverse() });
    } catch (err) { next(err); }
  });

  // GET /api/stats/category-breakdown
  router.get('/category-breakdown', (req, res, next) => {
    try {
      const { from, to, type = 'expense' } = req.query;
      let sql = `
        SELECT c.id, c.name, c.icon, c.color, SUM(t.amount) as total, COUNT(t.id) as count
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.type = ?
      `;
      const params = [req.user.id, type];
      if (from) { sql += ' AND t.date >= ?'; params.push(from); }
      if (to) { sql += ' AND t.date <= ?'; params.push(to); }
      sql += ' GROUP BY c.id ORDER BY total DESC';
      const breakdown = db.prepare(sql).all(...params);
      res.json({ breakdown });
    } catch (err) { next(err); }
  });

  // GET /api/stats/financial-health
  router.get('/financial-health', (req, res, next) => {
    try {
      const userId = req.user.id;
      const accounts = db.prepare('SELECT SUM(CASE WHEN type NOT IN (\'credit_card\', \'loan\') THEN balance ELSE 0 END) as assets, SUM(CASE WHEN type IN (\'credit_card\', \'loan\') THEN ABS(balance) ELSE 0 END) as liabilities FROM accounts WHERE user_id = ? AND is_active = 1').get(userId);

      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
      const avgMonthlyExpense = db.prepare('SELECT COALESCE(AVG(monthly), 0) as avg FROM (SELECT SUM(amount) as monthly FROM transactions WHERE user_id = ? AND type = \'expense\' AND date >= ? GROUP BY strftime(\'%Y-%m\', date))').get(userId, threeMonthsAgo);
      const avgMonthlyIncome = db.prepare('SELECT COALESCE(AVG(monthly), 0) as avg FROM (SELECT SUM(amount) as monthly FROM transactions WHERE user_id = ? AND type = \'income\' AND date >= ? GROUP BY strftime(\'%Y-%m\', date))').get(userId, threeMonthsAgo);

      const savingsAccounts = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE user_id = ? AND type IN (\'savings\', \'cash\') AND is_active = 1').get(userId);

      const emergencyFundMonths = avgMonthlyExpense.avg > 0 ? savingsAccounts.total / avgMonthlyExpense.avg : 0;
      const savingsRate = avgMonthlyIncome.avg > 0 ? ((avgMonthlyIncome.avg - avgMonthlyExpense.avg) / avgMonthlyIncome.avg) * 100 : 0;
      const debtToIncome = avgMonthlyIncome.avg > 0 ? ((accounts.liabilities || 0) / (avgMonthlyIncome.avg * 12)) * 100 : 0;

      // Simple 0-100 score
      let score = 50;
      if (emergencyFundMonths >= 6) score += 20; else if (emergencyFundMonths >= 3) score += 10;
      if (savingsRate >= 20) score += 15; else if (savingsRate >= 10) score += 8;
      if (debtToIncome < 36) score += 15; else if (debtToIncome < 50) score += 5;
      score = Math.min(100, Math.max(0, Math.round(score)));

      res.json({
        score,
        net_worth: (accounts.assets || 0) - (accounts.liabilities || 0),
        emergency_fund_months: Math.round(emergencyFundMonths * 10) / 10,
        savings_rate: Math.round(savingsRate * 10) / 10,
        debt_to_income: Math.round(debtToIncome * 10) / 10,
        avg_monthly_income: Math.round(avgMonthlyIncome.avg),
        avg_monthly_expense: Math.round(avgMonthlyExpense.avg),
      });
    } catch (err) { next(err); }
  });

  return router;
};
