const express = require('express');

module.exports = function createTransactionTemplateRoutes({ db, audit }) {
  const router = express.Router();
  const fromTemplateRouter = express.Router();

  const VALID_TYPES = ['income', 'expense', 'transfer'];

  // POST /api/transaction-templates — create template
  router.post('/', (req, res, next) => {
    try {
      const { name, description, amount, type, category_id, account_id } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } });
      }
      if (type && !VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'type must be income, expense, or transfer' } });
      }
      if (amount !== undefined && amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1e15)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number (max 1e15)' } });
      }
      const result = db.prepare(
        'INSERT INTO transaction_templates (user_id, name, description, amount, type, category_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(req.user.id, name.trim(), description || null, amount || null, type || 'expense', category_id || null, account_id || null);
      const template = db.prepare('SELECT * FROM transaction_templates WHERE id = ?').get(result.lastInsertRowid);
      audit.log(req.user.id, 'template.create', 'template', template.id);
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
      audit.log(req.user.id, 'template.delete', 'template', req.params.id);
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
      const amount = req.body.amount !== null && req.body.amount !== undefined ? req.body.amount : template.amount;
      const type = req.body.type || template.type || 'expense';

      // Validate type and amount
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'type must be income or expense' } });
      }
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1e15) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number (max 1e15)' } });
      }

      const category_id = req.body.category_id !== null && req.body.category_id !== undefined ? req.body.category_id : template.category_id;
      const account_id = req.body.account_id !== null && req.body.account_id !== undefined ? req.body.account_id : template.account_id;
      const date = new Date().toISOString().slice(0, 10);
      const currency = req.user.defaultCurrency || 'INR';

      if (!account_id) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'account_id is required (set on template or provide in body)' } });
      }

      // Verify account belongs to user
      const acctCheck = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
      if (!acctCheck) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account not found' } });
      }

      if (amount === null || amount === undefined) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'amount is required (set on template or provide in body)' } });
      }

      const result = db.prepare(
        'INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(req.user.id, account_id, category_id || null, type, numAmount, currency, description, date);

      // Update account balance
      const balanceChange = type === 'income' ? numAmount : -numAmount;
      db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(balanceChange, account_id, req.user.id);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
      audit.log(req.user.id, 'transaction.create_from_template', 'transaction', transaction.id);
      res.status(201).json({ transaction });
    } catch (err) { next(err); }
  });

  router.fromTemplateRouter = fromTemplateRouter;
  return router;
};
