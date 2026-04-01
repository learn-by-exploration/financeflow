const express = require('express');
const router = express.Router();
const createReportRepository = require('../repositories/report.repository');

module.exports = function createReportRoutes({ db }) {
  const reportRepo = createReportRepository({ db });

  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const YEAR_RE = /^\d{4}$/;

  // GET /api/reports/year-in-review?year=2024
  router.get('/year-in-review', (req, res, next) => {
    try {
      const { year } = req.query;
      if (!year || !YEAR_RE.test(year)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'year query parameter required in YYYY format' } });
      }
      const userId = req.user.id;
      const yearStr = String(year);
      const from = `${yearStr}-01-01`;
      const to = `${yearStr}-12-31`;

      // Total income, expenses
      const totals = db.prepare(`
        SELECT
          ROUND(COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), 2) AS total_income,
          ROUND(COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0), 2) AS total_expenses,
          COUNT(*) AS transaction_count
        FROM transactions
        WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('income', 'expense')
      `).get(userId, from, to);

      const total_income = totals.total_income;
      const total_expenses = totals.total_expenses;
      const net_savings = Math.round((total_income - total_expenses) * 100) / 100;
      const savings_rate = total_income > 0 ? Math.round((net_savings / total_income) * 10000) / 100 : 0;
      const transaction_count = totals.transaction_count;

      // Top 5 expense categories
      const top_categories = db.prepare(`
        SELECT c.name, ROUND(SUM(t.amount), 2) AS amount
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
        GROUP BY c.id
        ORDER BY amount DESC
        LIMIT 5
      `).all(userId, from, to);

      // Monthly breakdown
      const monthlyRows = db.prepare(`
        SELECT
          strftime('%m', date) AS month,
          ROUND(COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), 2) AS income,
          ROUND(COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0), 2) AS expenses
        FROM transactions
        WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('income', 'expense')
        GROUP BY month
        ORDER BY month
      `).all(userId, from, to);

      // Fill in all 12 months
      const monthly_breakdown = [];
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        const found = monthlyRows.find(r => r.month === mm);
        monthly_breakdown.push({
          month: `${yearStr}-${mm}`,
          income: found ? found.income : 0,
          expenses: found ? found.expenses : 0,
          net: found ? Math.round((found.income - found.expenses) * 100) / 100 : 0,
        });
      }

      // Biggest single expense
      const biggestRow = db.prepare(`
        SELECT description, amount, date
        FROM transactions
        WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?
        ORDER BY amount DESC
        LIMIT 1
      `).get(userId, from, to);

      const biggest_expense = biggestRow ? { description: biggestRow.description, amount: biggestRow.amount, date: biggestRow.date } : null;

      // Most frequent merchant/description
      const freqRow = db.prepare(`
        SELECT description, COUNT(*) AS count
        FROM transactions
        WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ? AND description IS NOT NULL AND description != ''
        GROUP BY description
        ORDER BY count DESC
        LIMIT 1
      `).get(userId, from, to);

      const most_frequent_merchant = freqRow ? { description: freqRow.description, count: freqRow.count } : null;

      // Average daily spending
      const daysInYear = (yearStr % 4 === 0 && (yearStr % 100 !== 0 || yearStr % 400 === 0)) ? 366 : 365;
      const average_daily_spending = Math.round((total_expenses / daysInYear) * 100) / 100;

      res.json({
        year: yearStr,
        total_income,
        total_expenses,
        net_savings,
        savings_rate,
        transaction_count,
        top_categories,
        monthly_breakdown,
        biggest_expense,
        most_frequent_merchant,
        average_daily_spending,
      });
    } catch (err) { next(err); }
  });

  // GET /api/reports/monthly?month=YYYY-MM
  router.get('/monthly', (req, res, next) => {
    try {
      const { month } = req.query;
      if (!month || !MONTH_RE.test(month)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'month query parameter required in YYYY-MM format' } });
      }
      const [year, mm] = month.split('-');
      const userId = req.user.id;

      const summary = reportRepo.getMonthlySummary(userId, year, mm);
      const top_categories = reportRepo.getTopCategories(userId, `${year}-${mm}-01`, `${year}-${mm}-31`);
      const daily = reportRepo.getDailyBreakdown(userId, year, mm);
      const currency_breakdown = db.prepare(
        "SELECT currency, SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense, SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income FROM transactions WHERE user_id = ? AND strftime('%Y', date) = ? AND strftime('%m', date) = ? GROUP BY currency"
      ).all(userId, year, mm);

      res.json({ month, ...summary, top_categories, daily, currency_breakdown });
    } catch (err) { next(err); }
  });

  // GET /api/reports/yearly?year=YYYY
  router.get('/yearly', (req, res, next) => {
    try {
      const { year } = req.query;
      if (!year || !/^\d{4}$/.test(year)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'year query parameter required in YYYY format' } });
      }
      const months = reportRepo.getYearlyOverview(req.user.id, year);
      res.json({ year, months });
    } catch (err) { next(err); }
  });

  // GET /api/reports/categories?from=DATE&to=DATE
  router.get('/categories', (req, res, next) => {
    try {
      const { from, to } = req.query;
      if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from and to query parameters required in YYYY-MM-DD format' } });
      }
      const categories = reportRepo.getCategoryBreakdown(req.user.id, from, to);
      res.json({ from, to, categories });
    } catch (err) { next(err); }
  });

  // GET /api/reports/net-worth-history?from=YYYY-MM&to=YYYY-MM
  router.get('/net-worth-history', (req, res, next) => {
    try {
      const userId = req.user.id;
      const { from, to } = req.query;

      // Compute monthly net change from transactions
      const rows = db.prepare(`
        SELECT strftime('%Y-%m', date) as month,
               SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END) as net_change
        FROM transactions WHERE user_id = ? AND type IN ('income', 'expense')
        GROUP BY month ORDER BY month
      `).all(userId);

      if (rows.length === 0) {
        return res.json({ history: [] });
      }

      // Build running total (cumulative net worth)
      let cumulative = 0;
      let history = [];
      for (const row of rows) {
        cumulative = Math.round((cumulative + row.net_change) * 100) / 100;
        history.push({ month: row.month, net_worth: cumulative });
      }

      // Apply date range filter
      if (from) {
        history = history.filter(h => h.month >= from);
      }
      if (to) {
        history = history.filter(h => h.month <= to);
      }

      res.json({ history });
    } catch (err) { next(err); }
  });

  // GET /api/reports/trends?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/trends', (req, res, next) => {
    try {
      const userId = req.user.id;
      let { from, to } = req.query;

      // Validate if provided
      if (from && !DATE_RE.test(from)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from must be in YYYY-MM-DD format' } });
      }
      if (to && !DATE_RE.test(to)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'to must be in YYYY-MM-DD format' } });
      }
      if (from && to && from > to) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from must be before to' } });
      }

      // Default: last 12 months
      if (!from || !to) {
        const now = new Date();
        to = now.toISOString().slice(0, 10);
        const start = new Date(now);
        start.setMonth(start.getMonth() - 11);
        start.setDate(1);
        from = start.toISOString().slice(0, 10);
      }

      const months = db.prepare(`
        SELECT
          strftime('%Y-%m', date) AS month,
          ROUND(COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), 2) AS income,
          ROUND(COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0), 2) AS expenses
        FROM transactions
        WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('income', 'expense')
        GROUP BY month
        ORDER BY month
      `).all(userId, from, to);

      res.json({ from, to, months });
    } catch (err) { next(err); }
  });

  // GET /api/reports/compare?month1=YYYY-MM&month2=YYYY-MM
  router.get('/compare', (req, res, next) => {
    try {
      const { month1, month2 } = req.query;
      if (!month1 || !month2 || !MONTH_RE.test(month1) || !MONTH_RE.test(month2)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'month1 and month2 query parameters required in YYYY-MM format' } });
      }
      const comparison = reportRepo.compareMonths(req.user.id, month1, month2);
      res.json(comparison);
    } catch (err) { next(err); }
  });

  // GET /api/reports/cashflow-forecast?days=30
  router.get('/cashflow-forecast', (req, res, next) => {
    try {
      const userId = req.user.id;
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);

      // Starting balance = sum of all account balances
      const balanceRow = db.prepare(
        'SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE user_id = ? AND is_active = 1'
      ).get(userId);
      let runningBalance = balanceRow.total;

      // Load active recurring rules
      const recurringRules = db.prepare(
        'SELECT * FROM recurring_rules WHERE user_id = ? AND is_active = 1'
      ).all(userId);

      // Load active subscriptions
      const subscriptions = db.prepare(
        'SELECT * FROM subscriptions WHERE user_id = ? AND is_active = 1'
      ).all(userId);

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const forecast = [];

      for (let i = 0; i < days; i++) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const _dayOfMonth = d.getDate();
        const _dayOfWeek = d.getDay();

        let dailyChange = 0;

        // Check recurring rules
        for (const rule of recurringRules) {
          if (isRuleDueOnDate(rule, d, dateStr)) {
            if (rule.type === 'income') {
              dailyChange += rule.amount;
            } else {
              dailyChange -= rule.amount;
            }
          }
        }

        // Check subscriptions (treat as expenses on billing date)
        for (const sub of subscriptions) {
          if (isSubscriptionDueOnDate(sub, d, dateStr)) {
            dailyChange -= sub.amount;
          }
        }

        if (i > 0) {
          runningBalance += dailyChange;
        }

        forecast.push({
          date: dateStr,
          projected_balance: Math.round(runningBalance * 100) / 100,
        });
      }

      res.json({ forecast });
    } catch (err) { next(err); }
  });

  return router;
};

function isRuleDueOnDate(rule, date, dateStr) {
  if (rule.end_date && dateStr > rule.end_date) return false;
  if (dateStr < rule.next_date) return false;

  const nextDate = new Date(rule.next_date);
  const freq = rule.frequency;

  if (freq === 'daily') return true;

  if (freq === 'weekly') {
    const diff = Math.round((date - nextDate) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff % 7 === 0;
  }

  if (freq === 'biweekly') {
    const diff = Math.round((date - nextDate) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff % 14 === 0;
  }

  if (freq === 'monthly') {
    return date.getDate() === nextDate.getDate();
  }

  if (freq === 'quarterly') {
    const monthDiff = (date.getFullYear() - nextDate.getFullYear()) * 12 + date.getMonth() - nextDate.getMonth();
    return monthDiff >= 0 && monthDiff % 3 === 0 && date.getDate() === nextDate.getDate();
  }

  if (freq === 'yearly') {
    return date.getMonth() === nextDate.getMonth() && date.getDate() === nextDate.getDate();
  }

  return false;
}

function isSubscriptionDueOnDate(sub, date, dateStr) {
  if (!sub.next_billing_date) return false;

  const freq = sub.frequency;
  const nextBilling = new Date(sub.next_billing_date);

  if (dateStr < sub.next_billing_date) return false;

  if (freq === 'weekly') {
    const diff = Math.round((date - nextBilling) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff % 7 === 0;
  }

  if (freq === 'monthly') {
    return date.getDate() === nextBilling.getDate();
  }

  if (freq === 'quarterly') {
    const monthDiff = (date.getFullYear() - nextBilling.getFullYear()) * 12 + date.getMonth() - nextBilling.getMonth();
    return monthDiff >= 0 && monthDiff % 3 === 0 && date.getDate() === nextBilling.getDate();
  }

  if (freq === 'yearly') {
    return date.getMonth() === nextBilling.getMonth() && date.getDate() === nextBilling.getDate();
  }

  return false;
}
