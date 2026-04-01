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

  // GET /api/stats/emi-calculator — EMI calculation for loan planning
  router.get('/emi-calculator', (req, res, next) => {
    try {
      const principal = Number(req.query.principal);
      const annualRate = Number(req.query.rate);
      const tenureMonths = Number(req.query.tenure);

      if (!principal || principal <= 0 || !annualRate || annualRate <= 0 || !tenureMonths || tenureMonths <= 0) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'principal, rate (annual %), and tenure (months) are required and must be positive' }
        });
      }

      const monthlyRate = annualRate / 12 / 100;
      const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths) / (Math.pow(1 + monthlyRate, tenureMonths) - 1);
      const totalPayment = emi * tenureMonths;
      const totalInterest = totalPayment - principal;

      // Amortization schedule
      const schedule = [];
      let balance = principal;
      for (let m = 1; m <= tenureMonths; m++) {
        const interest = balance * monthlyRate;
        const principalPart = emi - interest;
        balance -= principalPart;
        schedule.push({
          month: m,
          emi: Math.round(emi * 100) / 100,
          principal: Math.round(principalPart * 100) / 100,
          interest: Math.round(interest * 100) / 100,
          balance: Math.max(0, Math.round(balance * 100) / 100),
        });
      }

      res.json({
        principal,
        annual_rate: annualRate,
        tenure_months: tenureMonths,
        monthly_emi: Math.round(emi * 100) / 100,
        total_payment: Math.round(totalPayment * 100) / 100,
        total_interest: Math.round(totalInterest * 100) / 100,
        schedule,
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

  return router;
};
