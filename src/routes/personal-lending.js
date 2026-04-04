// src/routes/personal-lending.js
const express = require('express');
const router = express.Router();
const { createLendingSchema, updateLendingSchema, createPaymentSchema } = require('../schemas/personal-lending.schema');
const createPersonalLendingRepository = require('../repositories/personal-lending.repository');

module.exports = function createPersonalLendingRoutes({ db, audit }) {

  const lendingRepo = createPersonalLendingRepository({ db });

  // GET /api/lending — list all
  router.get('/', (req, res, next) => {
    try {
      const { limit, offset, type, is_settled, priority } = req.query;
      const filters = { limit: limit || 50, offset: offset || 0, type, is_settled, priority };
      const items = lendingRepo.findAllByUser(req.user.id, filters);
      const total = lendingRepo.countByUser(req.user.id, filters);
      res.json({ items, total, limit: Number(filters.limit), offset: Number(filters.offset) });
    } catch (err) { next(err); }
  });

  // GET /api/lending/summary
  router.get('/summary', (req, res, next) => {
    try {
      const summary = lendingRepo.summary(req.user.id);
      res.json({ summary });
    } catch (err) { next(err); }
  });

  // POST /api/lending
  router.post('/', (req, res, next) => {
    try {
      const parsed = createLendingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const item = lendingRepo.create(req.user.id, parsed.data);
      audit.log(req.user.id, 'lending.create', 'personal_lending', item.id);
      res.status(201).json({ item });
    } catch (err) { next(err); }
  });

  // PUT /api/lending/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = lendingRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lending record not found' } });
      const parsed = updateLendingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const item = lendingRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'lending.update', 'personal_lending', item.id);
      res.json({ item });
    } catch (err) { next(err); }
  });

  // DELETE /api/lending/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = lendingRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lending record not found' } });
      lendingRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'lending.delete', 'personal_lending', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // GET /api/lending/:id/payments
  router.get('/:id/payments', (req, res, next) => {
    try {
      const existing = lendingRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lending record not found' } });
      const payments = lendingRepo.findPayments(req.params.id);
      res.json({ payments });
    } catch (err) { next(err); }
  });

  // POST /api/lending/:id/payments
  router.post('/:id/payments', (req, res, next) => {
    try {
      const existing = lendingRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lending record not found' } });
      const parsed = createPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const roundedPayment = Math.round((parsed.data.amount + Number.EPSILON) * 100) / 100;
      if (roundedPayment > Math.round((existing.outstanding + Number.EPSILON) * 100) / 100) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Payment exceeds outstanding amount' } });
      }
      const payment = lendingRepo.addPayment(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'lending.payment', 'personal_lending', req.params.id);
      const updated = lendingRepo.findById(req.params.id, req.user.id);
      res.status(201).json({ payment, lending: updated });
    } catch (err) { next(err); }
  });

  return router;
};
