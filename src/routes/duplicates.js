const express = require('express');
const router = express.Router();
const createDuplicateRepository = require('../repositories/duplicate.repository');
const { ValidationError } = require('../errors');

module.exports = function createDuplicateRoutes({ db }) {
  const dupRepo = createDuplicateRepository({ db });

  // GET /api/transactions/duplicates
  router.get('/', (req, res, next) => {
    try {
      const duplicates = dupRepo.findDuplicates(req.user.id, req.query);
      res.json({ duplicates });
    } catch (err) { next(err); }
  });

  // POST /api/transactions/duplicates/dismiss
  router.post('/dismiss', (req, res, next) => {
    try {
      const { transaction_id_1, transaction_id_2 } = req.body;
      if (!transaction_id_1 || !transaction_id_2) {
        throw new ValidationError('transaction_id_1 and transaction_id_2 are required');
      }
      if (transaction_id_1 === transaction_id_2) {
        throw new ValidationError('Cannot dismiss a transaction as duplicate of itself');
      }
      const result = dupRepo.dismiss(req.user.id, transaction_id_1, transaction_id_2);
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
};
