// src/routes/balance-alerts.js
const express = require('express');
const router = express.Router();
const { createBalanceAlertSchema, updateBalanceAlertSchema } = require('../schemas/balance-alert.schema');
const createBalanceAlertRepository = require('../repositories/balance-alert.repository');

module.exports = function createBalanceAlertRoutes({ db }) {
  const repo = createBalanceAlertRepository({ db });

  // GET /api/balance-alerts
  router.get('/', (req, res, next) => {
    try {
      const alerts = repo.findAllByUser(req.user.id);
      res.json({ alerts });
    } catch (err) { next(err); }
  });

  // POST /api/balance-alerts
  router.post('/', (req, res, next) => {
    try {
      const parsed = createBalanceAlertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      // Verify account belongs to user
      const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(parsed.data.account_id, req.user.id);
      if (!account) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account not found' } });
      }
      const alert = repo.create(req.user.id, parsed.data);
      res.status(201).json({ alert });
    } catch (err) { next(err); }
  });

  // PUT /api/balance-alerts/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = repo.findById(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Balance alert not found' } });
      }
      const parsed = updateBalanceAlertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const alert = repo.update(req.params.id, req.user.id, parsed.data);
      res.json({ alert });
    } catch (err) { next(err); }
  });

  // DELETE /api/balance-alerts/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = repo.findById(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Balance alert not found' } });
      }
      repo.remove(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
