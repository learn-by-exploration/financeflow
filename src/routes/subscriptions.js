const express = require('express');
const router = express.Router();
const { createSubscriptionSchema } = require('../schemas/subscription.schema');
const createSubscriptionRepository = require('../repositories/subscription.repository');

module.exports = function createSubscriptionRoutes({ db, audit }) {
  const subRepo = createSubscriptionRepository({ db });

  // GET /api/subscriptions
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, frequency, is_active } = req.query;
      const filters = { limit, offset, frequency, is_active };
      const subs = subRepo.findAllByUser(req.user.id, filters);
      const total = subRepo.countByUser(req.user.id, filters);
      const totalMonthly = subs.filter(s => s.is_active).reduce((sum, s) => {
        const multiplier = { weekly: 4.33, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
        return sum + s.amount * (multiplier[s.frequency] || 1);
      }, 0);
      res.json({ subscriptions: subs, total, limit: Number(limit), offset: Number(offset), total_monthly: Math.round(totalMonthly * 100) / 100 });
    } catch (err) { next(err); }
  });

  // POST /api/subscriptions
  router.post('/', (req, res, next) => {
    try {
      const parsed = createSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const data = { ...parsed.data, currency: parsed.data.currency || req.user.defaultCurrency };
      const subscription = subRepo.create(req.user.id, data);
      audit.log(req.user.id, 'subscription.create', 'subscription', subscription.id);
      res.status(201).json({ subscription });
    } catch (err) { next(err); }
  });

  // PUT /api/subscriptions/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = subRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
      const subscription = subRepo.update(req.params.id, req.user.id, req.body);
      res.json({ subscription });
    } catch (err) { next(err); }
  });

  // DELETE /api/subscriptions/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = subRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
      subRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'subscription.delete', 'subscription', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
