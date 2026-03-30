module.exports = function createSpendingLimitRepository({ db }) {

  function create(userId, data) {
    const { category_id, period, amount } = data;
    const result = db.prepare(`
      INSERT INTO spending_limits (user_id, category_id, period, amount)
      VALUES (?, ?, ?, ?)
    `).run(userId, category_id || null, period, amount);
    return findById(result.lastInsertRowid, userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM spending_limits WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function findAllByUser(userId) {
    const limits = db.prepare('SELECT sl.*, c.name as category_name FROM spending_limits sl LEFT JOIN categories c ON sl.category_id = c.id WHERE sl.user_id = ? ORDER BY sl.created_at DESC').all(userId);

    // Attach current spending for each limit
    for (const limit of limits) {
      limit.current_spending = getCurrentSpending(userId, limit.category_id, limit.period);
      limit.percentage = limit.amount > 0 ? Math.round((limit.current_spending / limit.amount) * 10000) / 100 : 0;
    }

    return limits;
  }

  function update(id, userId, data) {
    const existing = findById(id, userId);
    if (!existing) return null;

    const period = data.period || existing.period;
    const amount = data.amount !== undefined ? data.amount : existing.amount;

    db.prepare('UPDATE spending_limits SET period = ?, amount = ? WHERE id = ? AND user_id = ?')
      .run(period, amount, id, userId);

    return findById(id, userId);
  }

  function remove(id, userId) {
    const existing = findById(id, userId);
    if (!existing) return false;
    db.prepare('DELETE FROM spending_limits WHERE id = ? AND user_id = ?').run(id, userId);
    return true;
  }

  function getCurrentSpending(userId, categoryId, period) {
    const { startDate } = getPeriodRange(period);

    let sql, params;
    if (categoryId) {
      sql = `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
             WHERE user_id = ? AND type = 'expense' AND category_id = ? AND date >= ?`;
      params = [userId, categoryId, startDate];
    } else {
      sql = `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
             WHERE user_id = ? AND type = 'expense' AND date >= ?`;
      params = [userId, startDate];
    }

    return db.prepare(sql).get(...params).total;
  }

  function getLimitsForCheck(userId, categoryId) {
    // Get limits that match this category or are overall (no category)
    const limits = db.prepare(`
      SELECT * FROM spending_limits
      WHERE user_id = ? AND (category_id = ? OR category_id IS NULL)
    `).all(userId, categoryId || null);

    return limits;
  }

  function getAverageSpending(userId, categoryId) {
    // Average transaction amount for this category over the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString().slice(0, 10);

    let sql, params;
    if (categoryId) {
      sql = `SELECT AVG(amount) as avg_amount, COUNT(*) as tx_count FROM transactions
             WHERE user_id = ? AND type = 'expense' AND category_id = ? AND date >= ?`;
      params = [userId, categoryId, startDate];
    } else {
      sql = `SELECT AVG(amount) as avg_amount, COUNT(*) as tx_count FROM transactions
             WHERE user_id = ? AND type = 'expense' AND date >= ?`;
      params = [userId, startDate];
    }

    const result = db.prepare(sql).get(...params);
    return { avg: result.avg_amount || 0, count: result.tx_count || 0 };
  }

  function getPeriodRange(period) {
    const now = new Date();
    let startDate;

    switch (period) {
      case 'daily':
        startDate = now.toISOString().slice(0, 10);
        break;
      case 'weekly': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        const monday = new Date(now);
        monday.setDate(diff);
        startDate = monday.toISOString().slice(0, 10);
        break;
      }
      case 'monthly':
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        break;
      default:
        startDate = now.toISOString().slice(0, 10);
    }

    return { startDate };
  }

  return { create, findById, findAllByUser, update, remove, getCurrentSpending, getLimitsForCheck, getAverageSpending };
};
