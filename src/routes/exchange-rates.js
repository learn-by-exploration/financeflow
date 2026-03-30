const express = require('express');
const router = express.Router();
const createExchangeRateRepository = require('../repositories/exchange-rate.repository');
const { createExchangeRateSchema } = require('../schemas/exchange-rate.schema');
const { ValidationError, NotFoundError } = require('../errors');

module.exports = function createExchangeRateRoutes({ db, audit }) {

  const rateRepo = createExchangeRateRepository({ db });

  // GET /api/exchange-rates
  router.get('/', (req, res, next) => {
    try {
      const rates = rateRepo.findAll(req.query);
      const total = rateRepo.count(req.query);
      res.json({ rates, total });
    } catch (err) { next(err); }
  });

  // POST /api/exchange-rates
  router.post('/', (req, res, next) => {
    try {
      const parsed = createExchangeRateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const { base_currency, target_currency, rate, date } = parsed.data;
      if (base_currency === target_currency) {
        throw new ValidationError('Base and target currency must be different');
      }
      const exchangeRate = rateRepo.create({ base_currency, target_currency, rate, date });
      audit.log(req.user.id, 'exchange_rate.create', 'exchange_rate', exchangeRate.id);
      res.status(201).json({ rate: exchangeRate });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return next(new ValidationError('Exchange rate for this currency pair and date already exists'));
      }
      next(err);
    }
  });

  // DELETE /api/exchange-rates/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = rateRepo.findById(id);
      if (!existing) throw new NotFoundError('Exchange rate not found');
      rateRepo.delete(id);
      audit.log(req.user.id, 'exchange_rate.delete', 'exchange_rate', id);
      res.json({ message: 'Exchange rate deleted' });
    } catch (err) { next(err); }
  });

  return router;
};
