module.exports = function createInsightRepository({ db }) {

  function getSpendingTrends(userId, months = 6) {
    const rows = db.prepare(`
      SELECT
        strftime('%Y-%m', date) AS month,
        ROUND(COALESCE(SUM(amount), 0), 2) AS total
      FROM transactions
      WHERE user_id = ? AND type = 'expense'
        AND date >= date('now', '-' || ? || ' months', 'start of month')
      GROUP BY month
      ORDER BY month
    `).all(userId, months);

    let direction = 'stable';
    if (rows.length >= 2) {
      // Simple linear regression on index vs total
      const n = rows.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += rows[i].total;
        sumXY += i * rows[i].total;
        sumX2 += i * i;
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      if (slope > 0) direction = 'increasing';
      else if (slope < 0) direction = 'decreasing';
      else direction = 'stable';
    }

    return { months: rows, direction };
  }

  function getAnomalies(userId, months = 3) {
    // Get all expense transactions in the period, grouped with their category
    const transactions = db.prepare(`
      SELECT t.id, t.amount, t.description, t.date, t.category_id,
             c.name AS category_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense'
        AND t.date >= date('now', '-' || ? || ' months')
      ORDER BY t.date DESC
    `).all(userId, months);

    // Group by category to compute mean and stddev
    const byCategory = {};
    for (const t of transactions) {
      const key = t.category_id || '_uncategorized';
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(t);
    }

    const anomalies = [];
    for (const [, txns] of Object.entries(byCategory)) {
      if (txns.length < 2) continue;
      const amounts = txns.map(t => t.amount);
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / amounts.length;
      const stddev = Math.sqrt(variance);
      if (stddev === 0) continue;

      for (const t of txns) {
        if (t.amount > mean + 2 * stddev) {
          anomalies.push({
            transaction_id: t.id,
            amount: t.amount,
            description: t.description,
            date: t.date,
            category: t.category_name,
            category_mean: Math.round(mean * 100) / 100,
            category_stddev: Math.round(stddev * 100) / 100,
            deviation: Math.round(((t.amount - mean) / stddev) * 100) / 100,
          });
        }
      }
    }

    return anomalies.sort((a, b) => b.deviation - a.deviation);
  }

  function getSpendingVelocity(userId) {
    const today = new Date();
    const dayOfMonth = today.getUTCDate();

    // Current month total so far
    const currentMonth = today.toISOString().slice(0, 7);
    const currentRow = db.prepare(`
      SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total
      FROM transactions
      WHERE user_id = ? AND type = 'expense'
        AND strftime('%Y-%m', date) = ?
    `).get(userId, currentMonth);

    // Previous month total (full month)
    const prev = new Date(today);
    prev.setUTCDate(1);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    const prevMonth = prev.toISOString().slice(0, 7);
    const prevRow = db.prepare(`
      SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total
      FROM transactions
      WHERE user_id = ? AND type = 'expense'
        AND strftime('%Y-%m', date) = ?
    `).get(userId, prevMonth);

    // Previous month up to same day
    const prevSameDayRow = db.prepare(`
      SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total
      FROM transactions
      WHERE user_id = ? AND type = 'expense'
        AND strftime('%Y-%m', date) = ?
        AND CAST(strftime('%d', date) AS INTEGER) <= ?
    `).get(userId, prevMonth, dayOfMonth);

    const currentTotal = currentRow.total;
    const previousTotal = prevRow.total;
    const previousSameDayTotal = prevSameDayRow.total;
    const dailyRate = dayOfMonth > 0 ? Math.round(currentTotal / dayOfMonth * 100) / 100 : 0;
    const prevDailyRate = dayOfMonth > 0 ? Math.round(previousSameDayTotal / dayOfMonth * 100) / 100 : 0;

    let status = 'on_track';
    if (previousSameDayTotal > 0) {
      const ratio = currentTotal / previousSameDayTotal;
      if (ratio > 1.1) status = 'overspending';
      else if (ratio < 0.9) status = 'underspending';
    }

    return {
      current_month: currentMonth,
      previous_month: prevMonth,
      current_total: currentTotal,
      previous_total: previousTotal,
      previous_same_day_total: previousSameDayTotal,
      daily_rate: dailyRate,
      previous_daily_rate: prevDailyRate,
      day_of_month: dayOfMonth,
      status,
    };
  }

  function getCategoryChanges(userId) {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);
    const prev = new Date(today);
    prev.setUTCDate(1);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    const prevMonth = prev.toISOString().slice(0, 7);

    const current = db.prepare(`
      SELECT c.id AS category_id, c.name,
        ROUND(SUM(t.amount), 2) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense'
        AND strftime('%Y-%m', t.date) = ?
      GROUP BY c.id
    `).all(userId, currentMonth);

    const previous = db.prepare(`
      SELECT c.id AS category_id, c.name,
        ROUND(SUM(t.amount), 2) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense'
        AND strftime('%Y-%m', t.date) = ?
      GROUP BY c.id
    `).all(userId, prevMonth);

    const prevMap = {};
    for (const p of previous) prevMap[p.category_id] = p.total;

    const changes = current.map(c => {
      const prevTotal = prevMap[c.category_id] || 0;
      const change = Math.round((c.total - prevTotal) * 100) / 100;
      const change_pct = prevTotal > 0 ? Math.round((change / prevTotal) * 10000) / 100 : (c.total > 0 ? 100 : 0);
      return {
        category_id: c.category_id,
        name: c.name,
        current: c.total,
        previous: prevTotal,
        change,
        change_pct,
      };
    });

    // Add categories that existed last month but not this month
    for (const p of previous) {
      if (!current.find(c => c.category_id === p.category_id)) {
        changes.push({
          category_id: p.category_id,
          name: p.name,
          current: 0,
          previous: p.total,
          change: -p.total,
          change_pct: -100,
        });
      }
    }

    changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    const most_increased = changes.filter(c => c.change > 0).slice(0, 5);
    const most_decreased = changes.filter(c => c.change < 0).slice(0, 5);

    return {
      current_month: currentMonth,
      previous_month: prevMonth,
      changes,
      most_increased,
      most_decreased,
    };
  }

  function getTopPayees(userId, from, to, limit = 10) {
    return db.prepare(`
      SELECT description AS payee,
        ROUND(SUM(amount), 2) AS total,
        COUNT(id) AS count
      FROM transactions
      WHERE user_id = ? AND type = 'expense'
        AND date >= ? AND date <= ?
        AND description IS NOT NULL AND description != ''
      GROUP BY description
      ORDER BY total DESC
      LIMIT ?
    `).all(userId, from, to, limit);
  }

  return {
    getSpendingTrends,
    getAnomalies,
    getSpendingVelocity,
    getCategoryChanges,
    getTopPayees,
  };
};
