const express = require('express');
const router = express.Router();
const { createRecurringSchema, updateRecurringSchema } = require('../schemas/recurring.schema');
const createRecurringRepository = require('../repositories/recurring.repository');

module.exports = function createRecurringRoutes({ db, audit }) {
  const recurringRepo = createRecurringRepository({ db });

  // GET /api/recurring — list user's recurring rules
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, frequency, is_active, type } = req.query;
      const filters = { limit, offset, frequency, is_active, type };
      const rules = recurringRepo.findAllByUser(req.user.id, filters);
      const total = recurringRepo.countByUser(req.user.id, filters);
      res.json({ rules, total, limit: Number(limit), offset: Number(offset) });
    } catch (err) { next(err); }
  });

  // POST /api/recurring — create recurring rule
  router.post('/', (req, res, next) => {
    try {
      const parsed = createRecurringSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { account_id } = parsed.data;
      const acct = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
      if (!acct) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account not found' } });
      }
      const currency = req.user.defaultCurrency || 'INR';
      const rule = recurringRepo.create(req.user.id, { ...parsed.data, currency });
      audit.log(req.user.id, 'recurring.create', 'recurring_rule', rule.id);
      res.status(201).json({ rule });
    } catch (err) { next(err); }
  });

  // PUT /api/recurring/:id — update recurring rule
  router.put('/:id', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });

      const parsed = updateRecurringSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });

      const rule = recurringRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'recurring.update', 'recurring_rule', rule.id);
      res.json({ rule });
    } catch (err) { next(err); }
  });

  // DELETE /api/recurring/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });
      recurringRepo.delete(existing.id, req.user.id);
      audit.log(req.user.id, 'recurring.delete', 'recurring_rule', existing.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/:id/skip — advance next_date to following occurrence
  router.post('/:id/skip', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });

      const rule = recurringRepo.advanceNextDate(req.params.id, req.user.id);
      audit.log(req.user.id, 'recurring.skip', 'recurring_rule', rule.id);
      res.json({ rule });
    } catch (err) { next(err); }
  });

  return router;
};
