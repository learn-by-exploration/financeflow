module.exports = function createReportRepository({ db }) {

  function getMonthlySummary(userId, year, month) {
    const from = `${year}-${month}-01`;
    const to = `${year}-${month}-31`;
    const row = db.prepare(`
      SELECT
        ROUND(COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), 2) AS income,
        ROUND(COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0), 2) AS expense
      FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('income', 'expense')
    `).get(userId, from, to);

    const income = row.income;
    const expense = row.expense;
    const net = Math.round((income - expense) * 100) / 100;
    const savings_rate = income > 0 ? Math.round((income - expense) / income * 10000) / 100 : 0;

    return { income, expense, net, savings_rate };
  }

  function getTopCategories(userId, from, to, limit = 5) {
    return db.prepare(`
      SELECT c.id AS category_id, c.name, c.icon, c.color,
        ROUND(SUM(t.amount), 2) AS total,
        COUNT(t.id) AS count
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
      GROUP BY c.id
      ORDER BY total DESC
      LIMIT ?
    `).all(userId, from, to, limit);
  }

  function getDailyBreakdown(userId, year, month) {
    const from = `${year}-${month}-01`;
    const to = `${year}-${month}-31`;
    return db.prepare(`
      SELECT
        date,
        ROUND(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 2) AS income,
        ROUND(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 2) AS expense
      FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('income', 'expense')
      GROUP BY date
      ORDER BY date
    `).all(userId, from, to);
  }

  function getYearlyOverview(userId, year) {
    return db.prepare(`
      SELECT
        strftime('%m', date) AS month,
        ROUND(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 2) AS income,
        ROUND(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 2) AS expense,
        ROUND(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) -
              SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 2) AS net
      FROM transactions
      WHERE user_id = ? AND strftime('%Y', date) = ? AND type IN ('income', 'expense')
      GROUP BY month
      ORDER BY month
    `).all(userId, String(year));
  }

  function getCategoryBreakdown(userId, from, to) {
    const rows = db.prepare(`
      SELECT c.id AS category_id, c.name, c.icon, c.color,
        ROUND(SUM(t.amount), 2) AS amount,
        COUNT(t.id) AS count
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
      GROUP BY c.id
      ORDER BY amount DESC
    `).all(userId, from, to);

    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    return rows.map(r => ({
      ...r,
      percentage: total > 0 ? Math.round(r.amount / total * 10000) / 100 : 0,
    }));
  }

  function compareMonths(userId, month1, month2) {
    const [y1, m1] = month1.split('-');
    const [y2, m2] = month2.split('-');
    const s1 = getMonthlySummary(userId, y1, m1);
    const s2 = getMonthlySummary(userId, y2, m2);
    return {
      month1: { month: month1, ...s1 },
      month2: { month: month2, ...s2 },
      diff: {
        income: Math.round((s2.income - s1.income) * 100) / 100,
        expense: Math.round((s2.expense - s1.expense) * 100) / 100,
        net: Math.round((s2.net - s1.net) * 100) / 100,
        savings_rate: Math.round((s2.savings_rate - s1.savings_rate) * 100) / 100,
      },
    };
  }

  return {
    getMonthlySummary,
    getTopCategories,
    getDailyBreakdown,
    getYearlyOverview,
    getCategoryBreakdown,
    compareMonths,
  };
};
