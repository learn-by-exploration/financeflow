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

      // Attach tags
      for (const row of rows) {
        const tags = db.prepare('SELECT tg.name FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tt.transaction_id = ?').all(row.id);
        row.tags = tags.map(t => t.name).join('; ');
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
      for (const b of budgets) {
        const items = db.prepare(
          `SELECT bi.*, c.name AS category_name FROM budget_items bi
           LEFT JOIN categories c ON bi.category_id = c.id
           WHERE bi.budget_id = ?`
        ).all(b.id);

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
      const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(userId);
      const recurringRules = db.prepare('SELECT * FROM recurring_rules WHERE user_id = ?').all(userId);
      const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);
      const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId);
      const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').all(userId);
      const tags = db.prepare('SELECT * FROM tags WHERE user_id = ?').all(userId);

      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId).map(b => {
        b.items = db.prepare('SELECT * FROM budget_items WHERE budget_id = ?').all(b.id);
        return b;
      });

      let rules = [];
      try { rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ?').all(userId); } catch (_e) { /* category_rules may not exist in older schemas */ }

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
