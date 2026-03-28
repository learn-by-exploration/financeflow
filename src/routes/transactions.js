const express = require('express');
const router = express.Router();

module.exports = function createTransactionRoutes({ db, audit }) {

  // GET /api/transactions
  router.get('/', (req, res, next) => {
    try {
      const { account_id, category_id, type, from, to, limit = 50, offset = 0, search } = req.query;
      let sql = 'SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id WHERE t.user_id = ?';
      const params = [req.user.id];
      if (account_id) { sql += ' AND t.account_id = ?'; params.push(account_id); }
      if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
      if (type) { sql += ' AND t.type = ?'; params.push(type); }
      if (from) { sql += ' AND t.date >= ?'; params.push(from); }
      if (to) { sql += ' AND t.date <= ?'; params.push(to); }
      if (search) { sql += ' AND (t.description LIKE ? OR t.payee LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit, 10), parseInt(offset, 10));
      const transactions = db.prepare(sql).all(...params);
      const total = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(req.user.id).count;
      res.json({ transactions, total });
    } catch (err) { next(err); }
  });

  // POST /api/transactions
  router.post('/', (req, res, next) => {
    try {
      const { account_id, category_id, type, amount, currency, description, note, date, payee, tags } = req.body;
      const result = db.prepare(`
        INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, account_id, category_id || null, type, amount, currency || req.user.defaultCurrency, description, note || null, date, payee || null, JSON.stringify(tags || []));

      // Update account balance
      const balanceChange = type === 'income' ? amount : -amount;
      db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
        .run(balanceChange, account_id, req.user.id);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
      audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);
      res.status(201).json({ transaction });
    } catch (err) { next(err); }
  });

  // PUT /api/transactions/:id
  router.put('/:id', (req, res, next) => {
    try {
      const old = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!old) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });

      const { category_id, description, note, date, payee, tags } = req.body;
      db.prepare(`
        UPDATE transactions SET category_id = COALESCE(?, category_id), description = COALESCE(?, description),
        note = COALESCE(?, note), date = COALESCE(?, date), payee = COALESCE(?, payee),
        tags = COALESCE(?, tags), updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(category_id, description, note, date, payee, tags ? JSON.stringify(tags) : null, req.params.id, req.user.id);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json({ transaction });
    } catch (err) { next(err); }
  });

  // DELETE /api/transactions/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!tx) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });

      // Reverse balance change
      const balanceChange = tx.type === 'income' ? -tx.amount : tx.amount;
      db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = datetime(\'now\') WHERE id = ?').run(balanceChange, tx.account_id);

      db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
      audit.log(req.user.id, 'transaction.delete', 'transaction', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
