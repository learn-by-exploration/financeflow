const express = require('express');
const router = express.Router();
const { createAccountSchema, updateAccountSchema } = require('../schemas/account.schema');
const createAccountRepository = require('../repositories/account.repository');
const { ValidationError, NotFoundError } = require('../errors');
const { invalidateCache } = require('../middleware/cache');

const CACHE_PATTERNS = ['/api/reports', '/api/charts', '/api/insights', '/api/stats', '/api/net-worth'];

module.exports = function createAccountRoutes({ db, audit }) {

  const accountRepo = createAccountRepository({ db });

  // GET /api/accounts
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, type, is_active } = req.query;
      const filters = { limit, offset, type, is_active };
      const accounts = accountRepo.findAllByUser(req.user.id, filters);
      const total = accountRepo.countByUser(req.user.id, filters);
      res.json({ accounts, total, limit: Number(limit), offset: Number(offset) });
    } catch (err) { next(err); }
  });

  // POST /api/accounts
  router.post('/', (req, res, next) => {
    try {
      const parsed = createAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const { name, type, currency, balance, icon, color, institution, account_number_last4 } = parsed.data;
      const account = accountRepo.create(req.user.id, {
        name, type, currency: currency || req.user.defaultCurrency, balance, icon, color, institution, account_number_last4
      });
      audit.log(req.user.id, 'account.create', 'account', account.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.status(201).json({ account });
    } catch (err) { next(err); }
  });

  // PUT /api/accounts/:id
  router.put('/:id', (req, res, next) => {
    try {
      const parsed = updateAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const account = accountRepo.update(req.params.id, req.user.id, parsed.data);
      if (!account) {
        throw new NotFoundError('Account');
      }
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ account });
    } catch (err) { next(err); }
  });

  // DELETE /api/accounts/:id
  router.delete('/:id', (req, res, next) => {
    try {
      accountRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'account.delete', 'account', req.params.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // GET /api/accounts/:id/transactions
  router.get('/:id/transactions', (req, res, next) => {
    try {
      const accountId = Number(req.params.id);
      const userId = req.user.id;

      // Verify account belongs to user
      const account = accountRepo.findById ? accountRepo.findById(accountId, userId) : null;
      if (!account) {
        // Try direct query
        const acc = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
        if (!acc) {
          return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
        }
      }

      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
      const offset = (page - 1) * limit;

      // Get total count
      const total = db.prepare(
        'SELECT COUNT(*) as count FROM transactions WHERE account_id = ? AND user_id = ?'
      ).get(accountId, userId).count;

      // Get transactions with running balance using window function
      const transactions = db.prepare(`
        SELECT *, running_balance FROM (
          SELECT t.*,
            SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END)
              OVER (ORDER BY t.date ASC, t.id ASC) as running_balance
          FROM transactions t
          WHERE t.account_id = ? AND t.user_id = ?
        ) sub
        ORDER BY date DESC, id DESC
        LIMIT ? OFFSET ?
      `).all(accountId, userId, limit, offset);

      // Round running_balance values
      for (const tx of transactions) {
        tx.running_balance = Math.round(tx.running_balance * 100) / 100;
      }

      res.json({ transactions, total, page, limit });
    } catch (err) { next(err); }
  });

  return router;
};
