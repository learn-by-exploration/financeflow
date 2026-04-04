const express = require('express');
const router = express.Router();

module.exports = function createExportRoutes({ db }) {

  function escapeCsv(value) {
    if (value === null || value === undefined) return '';
    let str = String(value);
    // Prevent CSV formula injection
    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function toCsv(headers, rows) {
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map(h => escapeCsv(row[h])).join(','));
    }
    return lines.join('\n');
  }

  function setCsvHeaders(res, filename) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }

  // GET /api/export/transactions
  router.get('/transactions', (req, res, next) => {
    try {
      const userId = req.user.id;
      const { account_id, category_id, type, from, to, start_date, end_date, tag_id, format } = req.query;

      // Support both from/to and start_date/end_date
      const dateFrom = from || start_date;
      const dateTo = to || end_date;

      let sql = `SELECT t.id, t.date, t.type, t.amount, t.currency, t.description, t.note, t.payee, t.reference_id,
                        c.name AS category_name, a.name AS account_name
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 LEFT JOIN accounts a ON t.account_id = a.id
                 WHERE t.user_id = ?`;
      const params = [userId];

      if (account_id) { sql += ' AND t.account_id = ?'; params.push(account_id); }
      if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
      if (type) { sql += ' AND t.type = ?'; params.push(type); }
      if (dateFrom) { sql += ' AND t.date >= ?'; params.push(dateFrom); }
      if (dateTo) { sql += ' AND t.date <= ?'; params.push(dateTo); }
      if (tag_id) { sql += ' AND t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id = ?)'; params.push(tag_id); }

      sql += ' ORDER BY t.date DESC, t.id DESC LIMIT 100000';

      const rows = db.prepare(sql).all(...params);

      // Batch load tags for all exported transactions (avoid N+1)
      if (rows.length > 0) {
        const rowIds = rows.map(r => r.id);
        const placeholders = rowIds.map(() => '?').join(',');
        const allTags = db.prepare(
          `SELECT tt.transaction_id, tg.name FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tt.transaction_id IN (${placeholders})`
        ).all(...rowIds);
        const tagsByTxn = {};
        for (const t of allTags) {
          if (!tagsByTxn[t.transaction_id]) tagsByTxn[t.transaction_id] = [];
          tagsByTxn[t.transaction_id].push(t.name);
        }
        for (const row of rows) {
          row.tags = (tagsByTxn[row.id] || []).join('; ');
        }
      }

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="transactions.json"');
        return res.json(rows);
      }

      // Default: CSV
      const headers = ['date', 'description', 'category_name', 'account_name', 'type', 'amount', 'tags'];
      setCsvHeaders(res, 'transactions.csv');
      res.send(toCsv(headers, rows));
    } catch (err) { next(err); }
  });

  // GET /api/export/accounts
  router.get('/accounts', (req, res, next) => {
    try {
      const userId = req.user.id;
      const rows = db.prepare(
        'SELECT id, name, type, currency, balance, icon, is_active, include_in_net_worth, created_at FROM accounts WHERE user_id = ? ORDER BY position ASC, id ASC'
      ).all(userId);

      const headers = ['id', 'name', 'type', 'currency', 'balance', 'icon', 'is_active', 'include_in_net_worth', 'created_at'];

      setCsvHeaders(res, 'accounts.csv');
      res.send(toCsv(headers, rows));
    } catch (err) { next(err); }
  });

  // GET /api/export/budgets
  router.get('/budgets', (req, res, next) => {
    try {
      const userId = req.user.id;
      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY id ASC').all(userId);

      const rows = [];
      // Batch load all budget items (avoid N+1)
      let itemsByBudget = {};
      if (budgets.length > 0) {
        const budgetIds = budgets.map(b => b.id);
        const placeholders = budgetIds.map(() => '?').join(',');
        const allItems = db.prepare(
          `SELECT bi.*, c.name AS category_name FROM budget_items bi
           LEFT JOIN categories c ON bi.category_id = c.id
           WHERE bi.budget_id IN (${placeholders})`
        ).all(...budgetIds);
        for (const item of allItems) {
          if (!itemsByBudget[item.budget_id]) itemsByBudget[item.budget_id] = [];
          itemsByBudget[item.budget_id].push(item);
        }
      }

      for (const b of budgets) {
        const items = itemsByBudget[b.id] || [];

        if (items.length === 0) {
          rows.push({
            budget_id: b.id,
            budget_name: b.name,
            period: b.period,
            start_date: b.start_date,
            end_date: b.end_date,
            is_active: b.is_active,
            item_id: '',
            category_name: '',
            item_amount: '',
            rollover: ''
          });
        } else {
          for (const item of items) {
            rows.push({
              budget_id: b.id,
              budget_name: b.name,
              period: b.period,
              start_date: b.start_date,
              end_date: b.end_date,
              is_active: b.is_active,
              item_id: item.id,
              category_name: item.category_name || '',
              item_amount: item.amount,
              rollover: item.rollover
            });
          }
        }
      }

      const headers = ['budget_id', 'budget_name', 'period', 'start_date', 'end_date', 'is_active', 'item_id', 'category_name', 'item_amount', 'rollover'];

      setCsvHeaders(res, 'budgets.csv');
      res.send(toCsv(headers, rows));
    } catch (err) { next(err); }
  });

  // GET /api/export/all
  router.get('/all', (req, res, next) => {
    try {
      const userId = req.user.id;

      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(userId);
      const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(userId);
      const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 500000').all(userId);
      const recurringRules = db.prepare('SELECT * FROM recurring_rules WHERE user_id = ?').all(userId);
      const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);
      const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId);
      const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').all(userId);
      const tags = db.prepare('SELECT * FROM tags WHERE user_id = ?').all(userId);

      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
      // Batch load budget items (avoid N+1)
      if (budgets.length > 0) {
        const budgetIds = budgets.map(b => b.id);
        const placeholders = budgetIds.map(() => '?').join(',');
        const allItems = db.prepare(`SELECT * FROM budget_items WHERE budget_id IN (${placeholders})`).all(...budgetIds);
        const itemsByBudget = {};
        for (const item of allItems) {
          if (!itemsByBudget[item.budget_id]) itemsByBudget[item.budget_id] = [];
          itemsByBudget[item.budget_id].push(item);
        }
        for (const b of budgets) {
          b.items = itemsByBudget[b.id] || [];
        }
      }

      let rules = [];
      rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ?').all(userId);

      res.json({
        exported_at: new Date().toISOString(),
        version: '1.0',
        accounts,
        categories,
        transactions,
        recurring_rules: recurringRules,
        budgets,
        goals,
        subscriptions,
        settings,
        tags,
        rules
      });
    } catch (err) { next(err); }
  });

  return router;
};
