const express = require('express');
const router = express.Router();
const createHealthService = require('../services/health.service');
const createSplitService = require('../services/split.service');
const { calculateEMI, calculateSIP, calculateLumpsum, calculateFIRE } = require('../services/stats.service');

module.exports = function createStatsRoutes({ db }) {

  const healthService = createHealthService();
  const splitService = createSplitService({ db });

  // GET /api/stats/overview — dashboard summary
  router.get('/overview', (req, res, next) => {
    try {
      const userId = req.user.id;
      const now = new Date();
      const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

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
      const months = Math.min(Math.max(parseInt(req.query.months || '12', 10) || 12, 1), 120);
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

  // GET /api/stats/emi-calculator — EMI calculation for loan planning
  router.get('/emi-calculator', (req, res, next) => {
    try {
      const principal = Number(req.query.principal);
      const annualRate = Number(req.query.rate);
      const tenureMonths = Number(req.query.tenure);

      if (!principal || principal <= 0 || principal > 1e12 || !annualRate || annualRate <= 0 || annualRate > 100 || !tenureMonths || tenureMonths <= 0 || tenureMonths > 600) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'principal (max 1e12), rate (1-100%), and tenure (1-600 months) are required and must be positive' }
        });
      }

      res.json(calculateEMI(principal, annualRate, tenureMonths));
    } catch (err) { next(err); }
  });

  // GET /api/stats/sip-calculator — SIP returns with optional step-up
  router.get('/sip-calculator', (req, res, next) => {
    try {
      const monthly = Number(req.query.monthly);
      const annualReturn = Number(req.query.return);
      const years = Number(req.query.years);
      const stepUp = Number(req.query.step_up || 0);

      if (!monthly || monthly <= 0 || monthly > 1e8 || !annualReturn || annualReturn <= 0 || annualReturn > 50 || !years || years <= 0 || years > 50) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'monthly (max 1e8), return (1-50%), and years (1-50) are required' }
        });
      }
      if (stepUp < 0 || stepUp > 100) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'step_up must be 0-100%' }
        });
      }

      res.json(calculateSIP(monthly, annualReturn, years, stepUp));
    } catch (err) { next(err); }
  });

  // GET /api/stats/lumpsum-calculator — lumpsum investment growth
  router.get('/lumpsum-calculator', (req, res, next) => {
    try {
      const principal = Number(req.query.principal);
      const annualReturn = Number(req.query.return);
      const years = Number(req.query.years);

      if (!principal || principal <= 0 || principal > 1e12 || !annualReturn || annualReturn <= 0 || annualReturn > 50 || !years || years <= 0 || years > 50) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'principal (max 1e12), return (1-50%), and years (1-50) are required' }
        });
      }

      res.json(calculateLumpsum(principal, annualReturn, years));
    } catch (err) { next(err); }
  });

  // GET /api/stats/fire-calculator — FIRE (Financial Independence, Retire Early) number
  router.get('/fire-calculator', (req, res, next) => {
    try {
      const annualExpense = Number(req.query.annual_expense);
      const withdrawalRate = Number(req.query.withdrawal_rate || 4);
      const inflationRate = Number(req.query.inflation_rate || 6);
      const yearsToRetirement = Number(req.query.years || 20);

      if (!annualExpense || annualExpense <= 0 || annualExpense > 1e10) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'annual_expense is required (max 1e10)' }
        });
      }
      if (withdrawalRate <= 0 || withdrawalRate > 20 || inflationRate < 0 || inflationRate > 30 || yearsToRetirement <= 0 || yearsToRetirement > 50) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'withdrawal_rate (0-20%), inflation_rate (0-30%), years (1-50) must be valid' }
        });
      }

      res.json(calculateFIRE(annualExpense, withdrawalRate, inflationRate, yearsToRetirement));
    } catch (err) { next(err); }
  });

  // GET /api/stats/spending-streak — consecutive days with expenses tracked
  router.get('/spending-streak', (req, res, next) => {
    try {
      const userId = req.user.id;
      const days = db.prepare(
        "SELECT DISTINCT date FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 365"
      ).all(userId).map(r => r.date);

      if (days.length === 0) {
        return res.json({ current_streak: 0, longest_streak: 0, total_tracking_days: 0 });
      }

      // Current streak (consecutive days from today backwards)
      let currentStreak = 0;
      const todayStr = new Date().toISOString().slice(0, 10);
      const daySet = new Set(days);

      const d = new Date(todayStr + 'T00:00:00Z');
      while (daySet.has(d.toISOString().slice(0, 10))) {
        currentStreak++;
        d.setUTCDate(d.getUTCDate() - 1);
      }

      // Longest streak
      let longestStreak = 0;
      let streak = 1;
      const sorted = [...days].sort();
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
        const curr = new Date(sorted[i] + 'T00:00:00Z');
        const diff = (curr - prev) / 86400000;
        if (diff === 1) {
          streak++;
        } else {
          longestStreak = Math.max(longestStreak, streak);
          streak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, streak);

      res.json({
        current_streak: currentStreak,
        longest_streak: longestStreak,
        total_tracking_days: days.length,
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/net-worth-trend — net worth over time
  router.get('/net-worth-trend', (req, res, next) => {
    try {
      const userId = req.user.id;
      const months = Math.min(Math.max(parseInt(req.query.months || '12', 10) || 12, 1), 60);

      // Get net worth snapshots if available
      const snapshots = db.prepare(
        'SELECT * FROM net_worth_snapshots WHERE user_id = ? ORDER BY date DESC LIMIT ?'
      ).all(userId, months);

      if (snapshots.length > 0) {
        return res.json({ trend: snapshots.reverse() });
      }

      // Fallback: compute from current accounts
      const accounts = db.prepare(
        'SELECT SUM(CASE WHEN type NOT IN (\'credit_card\', \'loan\') THEN balance ELSE 0 END) as assets, SUM(CASE WHEN type IN (\'credit_card\', \'loan\') THEN ABS(balance) ELSE 0 END) as liabilities FROM accounts WHERE user_id = ? AND is_active = 1'
      ).get(userId);

      res.json({
        trend: [{
          date: new Date().toISOString().slice(0, 10),
          total_assets: accounts.assets || 0,
          total_liabilities: accounts.liabilities || 0,
          net_worth: (accounts.assets || 0) - (accounts.liabilities || 0),
        }],
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/subscription-savings — analyze subscription spending and savings opportunities
  router.get('/subscription-savings', (req, res, next) => {
    try {
      const userId = req.user.id;
      const subs = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND is_active = 1').all(userId);

      let monthlyTotal = 0;
      const analysis = subs.map(s => {
        let monthlyCost = s.amount;
        if (s.frequency === 'yearly') monthlyCost = s.amount / 12;
        else if (s.frequency === 'quarterly') monthlyCost = s.amount / 3;
        else if (s.frequency === 'weekly') monthlyCost = s.amount * 4.33;
        monthlyTotal += monthlyCost;
        return {
          id: s.id,
          name: s.name,
          amount: s.amount,
          frequency: s.frequency,
          monthly_cost: Math.round(monthlyCost * 100) / 100,
        };
      });

      analysis.sort((a, b) => b.monthly_cost - a.monthly_cost);

      res.json({
        total_monthly: Math.round(monthlyTotal * 100) / 100,
        total_yearly: Math.round(monthlyTotal * 12 * 100) / 100,
        subscription_count: subs.length,
        subscriptions: analysis,
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/budget-variance — budget vs actual spending variance
  router.get('/budget-variance', (req, res, next) => {
    try {
      const userId = req.user.id;
      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND is_active = 1').all(userId);

      const variance = budgets.map(b => {
        const items = db.prepare('SELECT bi.*, c.name as category_name FROM budget_items bi LEFT JOIN categories c ON bi.category_id = c.id WHERE bi.budget_id = ?').all(b.id);

        const itemVariance = items.map(item => {
          const spent = db.prepare(
            'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND category_id = ? AND type = \'expense\' AND date >= ? AND date <= ?'
          ).get(userId, item.category_id, b.start_date, b.end_date).total;

          return {
            category_id: item.category_id,
            category_name: item.category_name,
            budgeted: item.amount,
            actual: Math.round(spent * 100) / 100,
            variance: Math.round((item.amount - spent) * 100) / 100,
            variance_pct: item.amount > 0 ? Math.round((spent / item.amount) * 10000) / 100 : 0,
            status: spent > item.amount ? 'over' : spent > item.amount * 0.8 ? 'warning' : 'on_track',
          };
        });

        const totalBudgeted = items.reduce((sum, i) => sum + i.amount, 0);
        const totalActual = itemVariance.reduce((sum, i) => sum + i.actual, 0);

        return {
          budget_id: b.id,
          budget_name: b.name,
          period: b.period,
          start_date: b.start_date,
          end_date: b.end_date,
          total_budgeted: totalBudgeted,
          total_actual: Math.round(totalActual * 100) / 100,
          total_variance: Math.round((totalBudgeted - totalActual) * 100) / 100,
          items: itemVariance,
        };
      });

      res.json({ budgets: variance });
    } catch (err) { next(err); }
  });

  // GET /api/stats/debt-payoff — debt snowball/avalanche strategy comparison
  router.get('/debt-payoff', (req, res, next) => {
    try {
      const userId = req.user.id;
      const extraPayment = Number(req.query.extra || 0);

      // Find loan/credit card accounts with negative balance (debt)
      const debts = db.prepare(
        "SELECT id, name, type, ABS(balance) as balance, currency FROM accounts WHERE user_id = ? AND is_active = 1 AND type IN ('credit_card', 'loan') AND balance < 0 ORDER BY ABS(balance) ASC"
      ).all(userId);

      if (debts.length === 0) {
        return res.json({ debts: [], snowball: null, avalanche: null, message: 'No debts found' });
      }

      // Minimum monthly payment assumption: 2% of balance or ₹500, whichever is greater
      const withMinPayments = debts.map(d => ({
        ...d,
        min_payment: Math.max(d.balance * 0.02, 500),
        // Estimated interest rate based on type
        rate: d.type === 'credit_card' ? 36 : 12,
      }));

      // Snowball: smallest balance first
      const snowball = [...withMinPayments].sort((a, b) => a.balance - b.balance);

      // Avalanche: highest rate first
      const avalanche = [...withMinPayments].sort((a, b) => b.rate - a.rate);

      const totalDebt = withMinPayments.reduce((s, d) => s + d.balance, 0);
      const totalMinPayment = withMinPayments.reduce((s, d) => s + d.min_payment, 0);

      res.json({
        total_debt: Math.round(totalDebt * 100) / 100,
        total_min_payment: Math.round(totalMinPayment * 100) / 100,
        extra_payment: extraPayment,
        debt_count: debts.length,
        snowball_order: snowball.map(d => ({ id: d.id, name: d.name, balance: d.balance, rate: d.rate })),
        avalanche_order: avalanche.map(d => ({ id: d.id, name: d.name, balance: d.balance, rate: d.rate })),
        recommendation: 'avalanche',
        recommendation_reason: 'Avalanche method saves more on interest over time',
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/tax-summary — tax-relevant spending summary (Indian 80C/80D/HRA)
  router.get('/tax-summary', (req, res, next) => {
    try {
      const userId = req.user.id;
      const fy = req.query.fy || new Date().getFullYear().toString();
      const fyYear = parseInt(fy, 10);

      // FY runs April-March in India
      const fyStart = `${fyYear}-04-01`;
      const fyEnd = `${fyYear + 1}-03-31`;

      // Get all expense transactions in the FY
      const totalIncome = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ? AND date <= ?"
      ).get(userId, fyStart, fyEnd).total;

      const totalExpense = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?"
      ).get(userId, fyStart, fyEnd).total;

      // Tax-tagged categories: look for categories with names containing tax keywords
      const taxCategories = db.prepare(
        "SELECT c.id, c.name, COALESCE(SUM(t.amount), 0) as total FROM categories c LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ? WHERE c.user_id = ? AND (c.name LIKE '%80C%' OR c.name LIKE '%80D%' OR c.name LIKE '%HRA%' OR c.name LIKE '%tax%' OR c.name LIKE '%insurance%' OR c.name LIKE '%LIC%' OR c.name LIKE '%PPF%' OR c.name LIKE '%ELSS%' OR c.name LIKE '%NPS%') GROUP BY c.id"
      ).all(userId, fyStart, fyEnd, userId);

      const totalTaxSavings = taxCategories.reduce((s, c) => s + c.total, 0);

      res.json({
        financial_year: `FY ${fyYear}-${fyYear + 1}`,
        fy_start: fyStart,
        fy_end: fyEnd,
        total_income: totalIncome,
        total_expense: totalExpense,
        tax_saving_investments: taxCategories,
        total_tax_savings: Math.round(totalTaxSavings * 100) / 100,
        section_80c_limit: 150000,
        section_80c_utilized: Math.min(totalTaxSavings, 150000),
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/financial-snapshot — comprehensive single-page financial summary
  router.get('/financial-snapshot', (req, res, next) => {
    try {
      const userId = req.user.id;
      const now = new Date();
      const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

      // Net worth
      const accounts = db.prepare(
        'SELECT SUM(CASE WHEN type NOT IN (\'credit_card\', \'loan\') THEN balance ELSE 0 END) as assets, SUM(CASE WHEN type IN (\'credit_card\', \'loan\') THEN ABS(balance) ELSE 0 END) as liabilities FROM accounts WHERE user_id = ? AND is_active = 1'
      ).get(userId);

      // Monthly income/expense
      const monthIncome = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = \'income\' AND date >= ?').get(userId, monthStart);
      const monthExpense = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = \'expense\' AND date >= ?').get(userId, monthStart);

      // Active budgets count
      const activeBudgets = db.prepare('SELECT COUNT(*) as count FROM budgets WHERE user_id = ? AND is_active = 1').get(userId);

      // Active goals
      const goals = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(current_amount), 0) as saved, COALESCE(SUM(target_amount), 0) as target FROM savings_goals WHERE user_id = ? AND is_completed = 0').get(userId);

      // Active subscriptions
      const subs = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(CASE WHEN frequency = \'monthly\' THEN amount WHEN frequency = \'yearly\' THEN amount / 12.0 WHEN frequency = \'quarterly\' THEN amount / 3.0 ELSE amount * 4.33 END), 0) as monthly_total FROM subscriptions WHERE user_id = ? AND is_active = 1').get(userId);

      // Transaction count this month
      const txnCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND date >= ?').get(userId, monthStart);

      // Accounts count
      const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE user_id = ? AND is_active = 1').get(userId);

      // Savings rate
      const savingsRate = monthIncome.total > 0
        ? Math.round(((monthIncome.total - monthExpense.total) / monthIncome.total) * 10000) / 100
        : 0;

      res.json({
        net_worth: (accounts.assets || 0) - (accounts.liabilities || 0),
        total_assets: accounts.assets || 0,
        total_liabilities: accounts.liabilities || 0,
        month_income: monthIncome.total,
        month_expense: monthExpense.total,
        month_savings: monthIncome.total - monthExpense.total,
        savings_rate: savingsRate,
        active_budgets: activeBudgets.count,
        active_goals: goals.count,
        goals_progress: goals.target > 0 ? Math.round((goals.saved / goals.target) * 10000) / 100 : 0,
        active_subscriptions: subs.count,
        monthly_subscription_cost: Math.round(subs.monthly_total * 100) / 100,
        accounts_count: accountCount.count,
        transactions_this_month: txnCount.count,
      });
    } catch (err) { next(err); }
  });

  // GET /api/stats/savings-rate-history — monthly savings rate over time
  router.get('/savings-rate-history', (req, res, next) => {
    try {
      const userId = req.user.id;
      const months = Math.min(Math.max(parseInt(req.query.months || '12', 10) || 12, 1), 60);

      const data = db.prepare(`
        SELECT strftime('%Y-%m', date) as month,
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
        FROM transactions WHERE user_id = ?
        GROUP BY month ORDER BY month DESC LIMIT ?
      `).all(userId, months);

      const history = data.reverse().map(m => ({
        month: m.month,
        income: m.income,
        expense: m.expense,
        savings: m.income - m.expense,
        savings_rate: m.income > 0 ? Math.round(((m.income - m.expense) / m.income) * 10000) / 100 : 0,
      }));

      res.json({ history });
    } catch (err) { next(err); }
  });

  // GET /api/stats/goal-milestones — progress milestones for goals
  router.get('/goal-milestones', (req, res, next) => {
    try {
      const userId = req.user.id;
      const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);

      const milestones = goals.map(g => {
        const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
        const milestoneList = [10, 25, 50, 75, 90, 100];
        const achieved = milestoneList.filter(m => pct >= m);
        const next = milestoneList.find(m => pct < m) || null;
        const nextAmount = next !== null ? g.target_amount * (next / 100) : null;

        return {
          goal_id: g.id,
          goal_name: g.name,
          target: g.target_amount,
          current: g.current_amount,
          percentage: Math.round(pct * 100) / 100,
          is_completed: g.is_completed === 1,
          milestones_achieved: achieved,
          next_milestone: next,
          amount_to_next: nextAmount !== null ? Math.round((nextAmount - g.current_amount) * 100) / 100 : 0,
        };
      });

      res.json({ milestones });
    } catch (err) { next(err); }
  });

  // GET /api/stats/challenges — list savings challenges
  router.get('/challenges', (req, res, next) => {
    try {
      const userId = req.user.id;
      const { active } = req.query;
      let sql = 'SELECT sc.*, c.name as category_name FROM savings_challenges sc LEFT JOIN categories c ON sc.category_id = c.id WHERE sc.user_id = ?';
      const params = [userId];
      if (active === '1') { sql += ' AND sc.is_active = 1'; }
      sql += ' ORDER BY sc.created_at DESC';
      const challenges = db.prepare(sql).all(...params);

      // Calculate progress for each challenge
      const result = challenges.map(ch => {
        let progress = 0;
        if (ch.type === 'no_spend' && ch.category_id) {
          // Count spending in category during challenge period
          const spent = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND category_id = ? AND type = 'expense' AND date >= ? AND date <= ?"
          ).get(userId, ch.category_id, ch.start_date, ch.end_date).total;
          progress = spent === 0 ? 100 : 0;
        } else if (ch.type === 'savings_target') {
          progress = ch.target_amount > 0 ? Math.round((ch.current_amount / ch.target_amount) * 10000) / 100 : 0;
        } else if (ch.type === 'reduce_category' && ch.category_id) {
          // Compare to previous period
          const days = Math.max(1, Math.ceil((new Date(ch.end_date) - new Date(ch.start_date)) / 86400000));
          const prevStart = new Date(new Date(ch.start_date).getTime() - days * 86400000).toISOString().slice(0, 10);
          const prevSpent = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND category_id = ? AND type = 'expense' AND date >= ? AND date < ?"
          ).get(userId, ch.category_id, prevStart, ch.start_date).total;
          const currSpent = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND category_id = ? AND type = 'expense' AND date >= ? AND date <= ?"
          ).get(userId, ch.category_id, ch.start_date, ch.end_date).total;

          if (prevSpent > 0) {
            const reduction = ((prevSpent - currSpent) / prevSpent) * 100;
            const targetReduction = ch.target_amount; // target_amount used as % reduction target
            progress = targetReduction > 0 ? Math.min(100, Math.round((reduction / targetReduction) * 10000) / 100) : 0;
          }
        }
        return { ...ch, is_active: ch.is_active === 1, is_completed: ch.is_completed === 1, progress };
      });

      res.json({ challenges: result });
    } catch (err) { next(err); }
  });

  // POST /api/stats/challenges — create a savings challenge
  router.post('/challenges', (req, res, next) => {
    try {
      const userId = req.user.id;
      const { name, type, target_amount, category_id, start_date, end_date } = req.body;

      if (!name || !type || !start_date || !end_date) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name, type, start_date, and end_date are required' } });
      }
      if (!['no_spend', 'savings_target', 'reduce_category'].includes(type)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'type must be no_spend, savings_target, or reduce_category' } });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dates must be YYYY-MM-DD' } });
      }
      if (start_date > end_date) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'start_date must be before end_date' } });
      }

      const result = db.prepare(
        'INSERT INTO savings_challenges (user_id, name, type, target_amount, category_id, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(userId, name, type, target_amount || 0, category_id || null, start_date, end_date);

      const challenge = db.prepare('SELECT * FROM savings_challenges WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ challenge });
    } catch (err) { next(err); }
  });

  // DELETE /api/stats/challenges/:id — delete a challenge
  router.delete('/challenges/:id', (req, res, next) => {
    try {
      const userId = req.user.id;
      const challenge = db.prepare('SELECT * FROM savings_challenges WHERE id = ? AND user_id = ?').get(req.params.id, userId);
      if (!challenge) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Challenge not found' } });

      db.prepare('DELETE FROM savings_challenges WHERE id = ? AND user_id = ?').run(req.params.id, userId);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

  // GET /api/stats/month-comparison — compare two months side by side
  router.get('/month-comparison', (req, res, next) => {
    try {
      const userId = req.user.id;
      const now = new Date();
      const thisMonth = req.query.month1 || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const prevMonth = req.query.month2 || (() => {
        const d = new Date(now);
        d.setUTCMonth(d.getUTCMonth() - 1);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      })();

      function getMonthData(month) {
        const from = `${month}-01`;
        const to = `${month}-31`;
        const income = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ? AND date <= ?").get(userId, from, to);
        const expense = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?").get(userId, from, to);
        const txnCount = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?").get(userId, from, to);
        const topCategories = db.prepare(
          "SELECT c.name, SUM(t.amount) as total FROM transactions t JOIN categories c ON t.category_id = c.id WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ? GROUP BY c.id ORDER BY total DESC LIMIT 5"
        ).all(userId, from, to);
        return {
          month,
          income: income.total,
          expense: expense.total,
          savings: income.total - expense.total,
          savings_rate: income.total > 0 ? Math.round(((income.total - expense.total) / income.total) * 10000) / 100 : 0,
          transaction_count: txnCount.count,
          top_categories: topCategories,
        };
      }

      const month1Data = getMonthData(thisMonth);
      const month2Data = getMonthData(prevMonth);

      const incomeChange = month2Data.income > 0 ? Math.round(((month1Data.income - month2Data.income) / month2Data.income) * 10000) / 100 : 0;
      const expenseChange = month2Data.expense > 0 ? Math.round(((month1Data.expense - month2Data.expense) / month2Data.expense) * 10000) / 100 : 0;

      res.json({
        month1: month1Data,
        month2: month2Data,
        changes: {
          income_change_pct: incomeChange,
          expense_change_pct: expenseChange,
          savings_improved: month1Data.savings > month2Data.savings,
        },
      });
    } catch (err) { next(err); }
  });

  return router;
};
