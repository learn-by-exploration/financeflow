const express = require('express');
const router = express.Router();
const { createAccountSchema } = require('../schemas/account.schema');
const createAccountRepository = require('../repositories/account.repository');
const { ValidationError, NotFoundError } = require('../errors');

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
      res.status(201).json({ account });
    } catch (err) { next(err); }
  });

  // PUT /api/accounts/:id
  router.put('/:id', (req, res, next) => {
    try {
      const account = accountRepo.update(req.params.id, req.user.id, req.body);
      if (!account) {
        throw new NotFoundError('Account');
      }
      res.json({ account });
    } catch (err) { next(err); }
  });

  // DELETE /api/accounts/:id
  router.delete('/:id', (req, res, next) => {
    try {
      accountRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'account.delete', 'account', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
