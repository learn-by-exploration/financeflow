module.exports = function createChartRepository({ db }) {

  const DATE_FORMAT = {
    daily: '%Y-%m-%d',
    weekly: '%Y-W%W',
    monthly: '%Y-%m',
    quarterly: null, // handled in JS
    yearly: '%Y',
  };

  function getCashFlow(userId, from, to, interval = 'monthly') {
    const fmt = DATE_FORMAT[interval] || DATE_FORMAT.monthly;
    const rows = db.prepare(`
      SELECT
        strftime('${fmt}', date) AS period,
        ROUND(COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), 2) AS income,
        ROUND(COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0), 2) AS expense
      FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('income', 'expense')
      GROUP BY period
      ORDER BY period
    `).all(userId, from, to);

    return {
      labels: rows.map(r => r.period),
      datasets: [
        { name: 'Income', data: rows.map(r => r.income) },
        { name: 'Expense', data: rows.map(r => r.expense) },
        { name: 'Net', data: rows.map(r => Math.round((r.income - r.expense) * 100) / 100) },
      ],
    };
  }

  function getBalanceHistory(userId, accountId, from, to) {
    // Verify account belongs to user
    const account = db.prepare(
      'SELECT id, balance FROM accounts WHERE id = ? AND user_id = ?'
    ).get(accountId, userId);
    if (!account) return null;

    // Get the current balance and all transactions in/after the range to reconstruct history
    const currentBalance = account.balance;

    // Get all transactions for this account ordered by date desc to reconstruct
    // We need transactions from "from" onward. We'll compute a running balance.
    // Strategy: get balance at start of range, then build forward.

    // Sum all transactions after `to` to find balance at end of range
    const afterRange = db.prepare(`
      SELECT
        COALESCE(SUM(CASE
          WHEN type = 'income' THEN amount
          WHEN type = 'expense' THEN -amount
          WHEN type = 'transfer' AND account_id = ? THEN -amount
          WHEN type = 'transfer' AND transfer_to_account_id = ? THEN amount
          ELSE 0
        END), 0) AS delta
      FROM transactions
      WHERE user_id = ? AND date > ?
        AND (account_id = ? OR transfer_to_account_id = ?)
    `).get(accountId, accountId, userId, to, accountId, accountId);

    const balanceAtEnd = Math.round((currentBalance - afterRange.delta) * 100) / 100;

    // Get daily deltas within range
    const dailyDeltas = db.prepare(`
      SELECT
        date,
        ROUND(SUM(CASE
          WHEN type = 'income' THEN amount
          WHEN type = 'expense' THEN -amount
          WHEN type = 'transfer' AND account_id = ? THEN -amount
          WHEN type = 'transfer' AND transfer_to_account_id = ? THEN amount
          ELSE 0
        END), 2) AS delta
      FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ?
        AND (account_id = ? OR transfer_to_account_id = ?)
      GROUP BY date
      ORDER BY date
    `).all(accountId, accountId, userId, from, to, accountId, accountId);

    // Build running balance backward from balanceAtEnd
    // First, calculate balance at start by subtracting all deltas
    const totalDelta = dailyDeltas.reduce((sum, r) => sum + r.delta, 0);
    let runningBalance = Math.round((balanceAtEnd - totalDelta) * 100) / 100;

    const labels = [];
    const data = [];
    for (const row of dailyDeltas) {
      runningBalance = Math.round((runningBalance + row.delta) * 100) / 100;
      labels.push(row.date);
      data.push(runningBalance);
    }

    // If no transactions in range, return single point with computed balance
    if (labels.length === 0) {
      labels.push(from);
      data.push(balanceAtEnd);
    }

    return {
      labels,
      datasets: [{ name: 'Balance', data }],
    };
  }

  function getSpendingPie(userId, from, to) {
    const rows = db.prepare(`
      SELECT c.id AS category_id, c.name, c.icon, c.color,
        ROUND(SUM(t.amount), 2) AS amount
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
      GROUP BY c.id
      ORDER BY amount DESC
    `).all(userId, from, to);

    const total = rows.reduce((sum, r) => sum + r.amount, 0);

    return {
      labels: rows.map(r => r.name),
      datasets: [{
        name: 'Spending',
        data: rows.map(r => r.amount),
      }],
      meta: rows.map(r => ({
        category_id: r.category_id,
        icon: r.icon,
        color: r.color,
        percentage: total > 0 ? Math.round(r.amount / total * 10000) / 100 : 0,
      })),
      total: Math.round(total * 100) / 100,
    };
  }

  function getIncomeExpense(userId, from, to, interval = 'monthly') {
    const fmt = DATE_FORMAT[interval] || DATE_FORMAT.monthly;
    const rows = db.prepare(`
      SELECT
        strftime('${fmt}', date) AS period,
        ROUND(COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), 2) AS income,
        ROUND(COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0), 2) AS expense
      FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('income', 'expense')
      GROUP BY period
      ORDER BY period
    `).all(userId, from, to);

    return {
      labels: rows.map(r => r.period),
      datasets: [
        { name: 'Income', data: rows.map(r => r.income) },
        { name: 'Expense', data: rows.map(r => r.expense) },
      ],
    };
  }

  function getNetWorthTrend(userId, from, to, _interval = 'monthly') {
    // Use net_worth_snapshots if available, else compute from accounts
    const snapshots = db.prepare(`
      SELECT
        strftime('%Y-%m', date) AS period,
        ROUND(SUM(total_assets), 2) AS assets,
        ROUND(SUM(total_liabilities), 2) AS liabilities,
        ROUND(SUM(net_worth), 2) AS net_worth
      FROM net_worth_snapshots
      WHERE user_id = ? AND date >= ? AND date <= ?
      GROUP BY period
      ORDER BY period
    `).all(userId, from, to);

    if (snapshots.length > 0) {
      return {
        labels: snapshots.map(r => r.period),
        datasets: [
          { name: 'Assets', data: snapshots.map(r => r.assets) },
          { name: 'Liabilities', data: snapshots.map(r => r.liabilities) },
          { name: 'Net Worth', data: snapshots.map(r => r.net_worth) },
        ],
      };
    }

    // Fallback: compute current net worth as single point
    const accounts = db.prepare(`
      SELECT
        ROUND(COALESCE(SUM(CASE WHEN type NOT IN ('credit_card', 'loan') THEN balance ELSE 0 END), 0), 2) AS assets,
        ROUND(COALESCE(SUM(CASE WHEN type IN ('credit_card', 'loan') THEN ABS(balance) ELSE 0 END), 0), 2) AS liabilities
      FROM accounts
      WHERE user_id = ? AND is_active = 1 AND include_in_net_worth = 1
    `).get(userId);

    const netWorth = Math.round((accounts.assets - accounts.liabilities) * 100) / 100;
    const period = new Date().toISOString().slice(0, 7);

    return {
      labels: [period],
      datasets: [
        { name: 'Assets', data: [accounts.assets] },
        { name: 'Liabilities', data: [accounts.liabilities] },
        { name: 'Net Worth', data: [netWorth] },
      ],
    };
  }

  function getBudgetUtilization(userId, budgetId) {
    const budget = db.prepare(
      'SELECT * FROM budgets WHERE id = ? AND user_id = ?'
    ).get(budgetId, userId);
    if (!budget) return null;

    const items = db.prepare(`
      SELECT bi.id AS item_id, bi.category_id, c.name AS category_name, c.icon, c.color,
        ROUND(bi.amount, 2) AS allocated
      FROM budget_items bi
      LEFT JOIN categories c ON bi.category_id = c.id
      WHERE bi.budget_id = ?
    `).all(budgetId);

    // Calculate spent for each category within the budget period
    const spentStmt = db.prepare(`
      SELECT ROUND(COALESCE(SUM(t.amount), 0), 2) AS spent
      FROM transactions t
      WHERE t.user_id = ? AND t.category_id = ? AND t.type = 'expense'
        AND t.date >= ? AND t.date <= ?
    `);

    const labels = [];
    const allocated = [];
    const spent = [];
    const meta = [];

    for (const item of items) {
      const row = spentStmt.get(userId, item.category_id, budget.start_date, budget.end_date);
      labels.push(item.category_name || 'Uncategorized');
      allocated.push(item.allocated);
      spent.push(row.spent);
      meta.push({
        item_id: item.item_id,
        category_id: item.category_id,
        icon: item.icon,
        color: item.color,
        percentage: item.allocated > 0 ? Math.round(row.spent / item.allocated * 10000) / 100 : 0,
      });
    }

    return {
      budget_id: budget.id,
      budget_name: budget.name,
      period: budget.period,
      start_date: budget.start_date,
      end_date: budget.end_date,
      labels,
      datasets: [
        { name: 'Allocated', data: allocated },
        { name: 'Spent', data: spent },
      ],
      meta,
    };
  }

  function getSpendingTrend(userId, from, to, interval = 'daily') {
    const fmt = DATE_FORMAT[interval] || DATE_FORMAT.daily;
    const rows = db.prepare(`
      SELECT
        strftime('${fmt}', date) AS period,
        ROUND(COALESCE(SUM(amount), 0), 2) AS total
      FROM transactions
      WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?
      GROUP BY period
      ORDER BY period
    `).all(userId, from, to);

    return {
      labels: rows.map(r => r.period),
      datasets: [
        { name: 'Spending', data: rows.map(r => r.total) },
      ],
    };
  }

  return {
    getCashFlow,
    getBalanceHistory,
    getSpendingPie,
    getIncomeExpense,
    getNetWorthTrend,
    getBudgetUtilization,
    getSpendingTrend,
  };
};
