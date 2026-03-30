const express = require('express');

module.exports = function createTransactionTemplateRoutes({ db }) {
  const router = express.Router();
  const fromTemplateRouter = express.Router();

  // POST /api/transaction-templates — create template
  router.post('/', (req, res, next) => {
    try {
      const { name, description, amount, type, category_id, account_id } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } });
      }
      const result = db.prepare(
        'INSERT INTO transaction_templates (user_id, name, description, amount, type, category_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(req.user.id, name.trim(), description || null, amount || null, type || 'expense', category_id || null, account_id || null);
      const template = db.prepare('SELECT * FROM transaction_templates WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ template });
    } catch (err) { next(err); }
  });

  // GET /api/transaction-templates — list user's templates
  router.get('/', (req, res, next) => {
    try {
      const templates = db.prepare(
        'SELECT * FROM transaction_templates WHERE user_id = ? ORDER BY created_at DESC'
      ).all(req.user.id);
      res.json({ templates });
    } catch (err) { next(err); }
  });

  // DELETE /api/transaction-templates/:id — delete template (owner only)
  router.delete('/:id', (req, res, next) => {
    try {
      const template = db.prepare(
        'SELECT * FROM transaction_templates WHERE id = ? AND user_id = ?'
      ).get(req.params.id, req.user.id);
      if (!template) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
      }
      db.prepare('DELETE FROM transaction_templates WHERE id = ?').run(template.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // POST /api/transactions/from-template/:id — create transaction from template
  fromTemplateRouter.post('/from-template/:id', (req, res, next) => {
    try {
      const template = db.prepare(
        'SELECT * FROM transaction_templates WHERE id = ? AND user_id = ?'
      ).get(req.params.id, req.user.id);
      if (!template) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
      }

      // Template values with optional overrides
      const description = req.body.description || template.description || template.name;
      const amount = req.body.amount != null ? req.body.amount : template.amount;
      const type = req.body.type || template.type || 'expense';
      const category_id = req.body.category_id != null ? req.body.category_id : template.category_id;
      const account_id = req.body.account_id != null ? req.body.account_id : template.account_id;
      const date = new Date().toISOString().slice(0, 10);
      const currency = req.user.defaultCurrency || 'INR';

      if (!account_id) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'account_id is required (set on template or provide in body)' } });
      }
      if (amount == null) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'amount is required (set on template or provide in body)' } });
      }

      const result = db.prepare(
        'INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(req.user.id, account_id, category_id || null, type, amount, currency, description, date);

      // Update account balance
      const balanceChange = type === 'income' ? amount : -amount;
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?').run(balanceChange, account_id, req.user.id);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ transaction });
    } catch (err) { next(err); }
  });

  router.fromTemplateRouter = fromTemplateRouter;
  return router;
};
