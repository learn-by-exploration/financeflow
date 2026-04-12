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
      const data = parsed.data;
      if (!data.currency) data.currency = req.user.defaultCurrency;
      const account = accountRepo.create(req.user.id, data);
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

  // PUT /api/accounts/:id/archive — soft-delete (archive) an account
  router.put('/:id/archive', (req, res, next) => {
    try {
      const account = accountRepo.findById(req.params.id, req.user.id);
      if (!account) throw new NotFoundError('Account');
      accountRepo.archive(req.params.id, req.user.id);
      audit.log(req.user.id, 'account.archive', 'account', req.params.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ ok: true, archived: true });
    } catch (err) { next(err); }
  });

  // POST /api/accounts/:id/reconcile — mark transactions as reconciled
  router.post('/:id/reconcile', (req, res, next) => {
    try {
      const account = accountRepo.findById(req.params.id, req.user.id);
      if (!account) throw new NotFoundError('Account');

      const { statement_balance, transaction_ids } = req.body;
      if (statement_balance === undefined || !Array.isArray(transaction_ids)) {
        throw new ValidationError('statement_balance and transaction_ids array required');
      }

      const now = new Date().toISOString();
      const reconciled_count = accountRepo.reconcileTransactions(req.user.id, req.params.id, transaction_ids, now);
      const reconciledTotal = accountRepo.getReconciledTotal(req.user.id, req.params.id);
      const diff = Math.round((statement_balance - reconciledTotal) * 100) / 100;

      audit.log(req.user.id, 'account.reconcile', 'account', req.params.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ ok: true, reconciled_count, balance_difference: diff });
    } catch (err) { next(err); }
  });

  // GET /api/accounts/:id/transactions
  router.get('/:id/transactions', (req, res, next) => {
    try {
      const accountId = Number(req.params.id);
      const userId = req.user.id;

      const account = accountRepo.findById(accountId, userId);
      if (!account) throw new NotFoundError('Account');

      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
      const offset = (page - 1) * limit;

      const { transactions, total } = accountRepo.findTransactions(userId, accountId, { limit, offset });

      res.json({ transactions, total, page, limit });
    } catch (err) { next(err); }
  });

  return router;
};
