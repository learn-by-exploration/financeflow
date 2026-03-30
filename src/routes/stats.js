const express = require('express');
const router = express.Router();
const createHealthService = require('../services/health.service');
const createSplitService = require('../services/split.service');

module.exports = function createStatsRoutes({ db }) {

  const healthService = createHealthService();
  const splitService = createSplitService({ db });

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

      // Groups balance: aggregate simplified debts across all groups
      const userGroups = db.prepare(`
        SELECT g.id FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
      `).all(userId);

      let totalOwed = 0;
      let totalOwing = 0;
      for (const g of userGroups) {
        const balances = splitService.calculateBalances(g.id);
        const debts = splitService.simplifyDebts(balances);
        // Find the member id for the current user in this group
        const userMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(g.id, userId);
        if (userMember) {
          for (const d of debts) {
            if (d.to === userMember.id) totalOwed += d.amount;
            if (d.from === userMember.id) totalOwing += d.amount;
          }
        }
      }

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
        groups_balance: {
          total_owed: Math.round(totalOwed * 100) / 100,
          total_owing: Math.round(totalOwing * 100) / 100,
          net: Math.round((totalOwed - totalOwing) * 100) / 100,
          group_count: userGroups.length,
        },
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/trends — monthly income vs expense over time
  router.get('/trends', (req, res, next) => {
    try {
      const months = parseInt(req.query.months || '12', 10);
      const { fy } = req.query;

      // Check if user has FY preference or fy query param is provided
      let fyStart = null;
      if (fy) {
        // Read financial_year_start from user preferences
        const setting = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'financial_year_start'").get(req.user.id);
        fyStart = setting ? Number(setting.value) : 1;
      }

      if (fyStart && fyStart > 1 && fy) {
        // FY mode: e.g. fy=2025 with start=4 means April 2025 to March 2026
        const fyYear = parseInt(fy, 10);
        const fromDate = `${fyYear}-${String(fyStart).padStart(2, '0')}-01`;
        const toYear = fyStart === 1 ? fyYear : fyYear + 1;
        const toMonth = fyStart === 1 ? 12 : fyStart - 1;
        // Last day of the to month
        const toDate = `${toYear}-${String(toMonth).padStart(2, '0')}-31`;

        const trends = db.prepare(`
          SELECT strftime('%Y-%m', date) as month,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
          FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?
          GROUP BY month ORDER BY month ASC
        `).all(req.user.id, fromDate, toDate);
        return res.json({ trends });
      }

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

      // Gating: check if user has >= 30 days of data
      const earliest = db.prepare('SELECT MIN(date) as earliest FROM transactions WHERE user_id = ?').get(userId);
      if (!earliest.earliest) {
        return res.json({ gated: true, message: 'Need at least 30 days of transaction data for health analysis' });
      }
      const daysSinceFirst = Math.floor((Date.now() - new Date(earliest.earliest).getTime()) / 86400000);
      if (daysSinceFirst < 30) {
        return res.json({ gated: true, message: `Need at least 30 days of data. You have ${daysSinceFirst} days so far.` });
      }

      const accounts = db.prepare('SELECT SUM(CASE WHEN type NOT IN (\'credit_card\', \'loan\') THEN balance ELSE 0 END) as assets, SUM(CASE WHEN type IN (\'credit_card\', \'loan\') THEN ABS(balance) ELSE 0 END) as liabilities FROM accounts WHERE user_id = ? AND is_active = 1').get(userId);

      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
      const avgMonthlyExpense = db.prepare('SELECT COALESCE(AVG(monthly), 0) as avg FROM (SELECT SUM(amount) as monthly FROM transactions WHERE user_id = ? AND type = \'expense\' AND date >= ? GROUP BY strftime(\'%Y-%m\', date))').get(userId, threeMonthsAgo);
      const avgMonthlyIncome = db.prepare('SELECT COALESCE(AVG(monthly), 0) as avg FROM (SELECT SUM(amount) as monthly FROM transactions WHERE user_id = ? AND type = \'income\' AND date >= ? GROUP BY strftime(\'%Y-%m\', date))').get(userId, threeMonthsAgo);

      const savingsAccounts = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE user_id = ? AND type IN (\'savings\', \'cash\') AND is_active = 1').get(userId);

      const ratios = healthService.calculateRatios({
        savingsBalance: savingsAccounts.total,
        avgMonthlyExpense: avgMonthlyExpense.avg,
        avgMonthlyIncome: avgMonthlyIncome.avg,
        liabilities: accounts.liabilities || 0,
      });
      const score = healthService.calculateScore(ratios);
      const breakdown = healthService.calculateScoreBreakdown(ratios);
      const efRounded = Math.round(ratios.emergencyFundMonths * 10) / 10;
      const interpretation = healthService.generateInterpretation(ratios);

      res.json({
        score,
        net_worth: (accounts.assets || 0) - (accounts.liabilities || 0),
        emergency_fund_months: efRounded,
        savings_rate: Math.round(ratios.savingsRate * 10) / 10,
        debt_to_income: Math.round(ratios.debtToIncome * 10) / 10,
        avg_monthly_income: Math.round(avgMonthlyIncome.avg),
        avg_monthly_expense: Math.round(avgMonthlyExpense.avg),
        interpretation,
        ratios: breakdown.ratios,
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/daily-spending — daily spending totals for chart sparklines
  router.get('/daily-spending', (req, res, next) => {
    try {
      const { from, to } = req.query;
      let sql = `
        SELECT date, SUM(amount) as total
        FROM transactions WHERE user_id = ? AND type = 'expense'
      `;
      const params = [req.user.id];
      if (from) { sql += ' AND date >= ?'; params.push(from); }
      if (to) { sql += ' AND date <= ?'; params.push(to); }
      sql += ' GROUP BY date ORDER BY date ASC';
      const daily = db.prepare(sql).all(...params);
      res.json({ daily });
    } catch (err) { next(err); }
  });

  return router;
};
