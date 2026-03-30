const express = require('express');
const router = express.Router();
const createTransactionService = require('../services/transaction.service');
const { safePatternTest } = require('../utils/safe-regex');
const { createTransactionSchema } = require('../schemas/transaction.schema');

module.exports = function createTransactionRoutes({ db, audit }) {

  const txService = createTransactionService({ db });

  // GET /api/transactions
  router.get('/', (req, res, next) => {
    try {
      const { account_id, category_id, type, from, to, limit = 50, offset = 0, search, tag_id } = req.query;
      let sql = 'SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id WHERE t.user_id = ?';
      const params = [req.user.id];
      if (account_id) { sql += ' AND t.account_id = ?'; params.push(account_id); }
      if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
      if (type) { sql += ' AND t.type = ?'; params.push(type); }
      if (from) { sql += ' AND t.date >= ?'; params.push(from); }
      if (to) { sql += ' AND t.date <= ?'; params.push(to); }
      if (search) { sql += ' AND (t.description LIKE ? OR t.payee LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      if (tag_id) { sql += ' AND t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id = ?)'; params.push(tag_id); }
      sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit, 10), parseInt(offset, 10));
      const transactions = db.prepare(sql).all(...params);

      // Attach tags to each transaction
      const getTags = db.prepare('SELECT tg.id, tg.name, tg.color FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tt.transaction_id = ?');
      for (const txn of transactions) {
        txn.tags = getTags.all(txn.id);
      }

      const total = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(req.user.id).count;
      res.json({ transactions, total });
    } catch (err) { next(err); }
  });

  // POST /api/transactions
  router.post('/', (req, res, next) => {
    try {
      const parsed = createTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { account_id, category_id, type, amount, currency, description, note, date, payee, transfer_to_account_id, tag_ids } = parsed.data;

      // Transfer handling
      if (type === 'transfer') {
        if (!transfer_to_account_id) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'transfer_to_account_id is required for transfers' } });
        }
        if (transfer_to_account_id === account_id) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot transfer to the same account' } });
        }

        const transaction = txService.createTransfer({
          userId: req.user.id, accountId: account_id, transferToAccountId: transfer_to_account_id,
          categoryId: category_id, amount, currency: currency || req.user.defaultCurrency,
          description, note, date, payee, tags: tag_ids
        });
        audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);
        return res.status(201).json({ transaction });
      }

      // Auto-categorize if no category_id provided
      let resolvedCategoryId = category_id || null;
      if (!resolvedCategoryId && description) {
        const rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ? ORDER BY position ASC, id ASC').all(req.user.id);
        for (const rule of rules) {
          if (safePatternTest(rule.pattern, description)) {
            resolvedCategoryId = rule.category_id;
            break;
          }
        }
      }

      // Regular income/expense
      const result = db.prepare(`
        INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, account_id, resolvedCategoryId, type, amount, currency || req.user.defaultCurrency, description, note || null, date, payee || null, JSON.stringify(tag_ids || []));

      // Update account balance
      const balanceChange = type === 'income' ? amount : -amount;
      db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
        .run(balanceChange, account_id, req.user.id);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);

      // Link tags if provided
      if (Array.isArray(tag_ids) && tag_ids.length > 0) {
        const insertTag = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');
        for (const tid of tag_ids) insertTag.run(transaction.id, tid);
      }
      // Attach tags to response
      transaction.tags = db.prepare('SELECT tg.id, tg.name, tg.color FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tt.transaction_id = ?').all(transaction.id);

      audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);
      res.status(201).json({ transaction });
    } catch (err) { next(err); }
  });

  // PUT /api/transactions/:id
  router.put('/:id', (req, res, next) => {
    try {
      const old = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!old) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });

      const { category_id, description, note, date, payee, tags, amount } = req.body;

      // Handle amount update with delta-based balance recalculation
      txService.applyAmountDelta(old, amount);

      db.prepare(`
        UPDATE transactions SET category_id = COALESCE(?, category_id), description = COALESCE(?, description),
        note = COALESCE(?, note), date = COALESCE(?, date), payee = COALESCE(?, payee),
        tags = COALESCE(?, tags), amount = COALESCE(?, amount), updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(category_id, description, note, date, payee, tags ? JSON.stringify(tags) : null, amount, req.params.id, req.user.id);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json({ transaction });
    } catch (err) { next(err); }
  });

  // DELETE /api/transactions/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!tx) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });

      if (tx.transfer_transaction_id) {
        txService.deleteTransfer(tx);
      } else {
        // Regular: reverse balance change
        const balanceChange = tx.type === 'income' ? -tx.amount : tx.amount;
        db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = datetime(\'now\') WHERE id = ?').run(balanceChange, tx.account_id);
        db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
      }

      audit.log(req.user.id, 'transaction.delete', 'transaction', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
