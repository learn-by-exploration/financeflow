const express = require('express');
const router = express.Router();
const { createGoalSchema } = require('../schemas/goal.schema');
const createGoalRepository = require('../repositories/goal.repository');
const createNotificationService = require('../services/notification.service');

module.exports = function createGoalRoutes({ db, audit }) {
  const goalRepo = createGoalRepository({ db });
  const notifService = createNotificationService({ db });

  // GET /api/goals
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, status } = req.query;
      const filters = { limit, offset, status };
      const goals = goalRepo.findAllByUser(req.user.id, filters);
      const total = goalRepo.countByUser(req.user.id, filters);
      res.json({ goals, total, limit: Number(limit), offset: Number(offset) });
    } catch (err) { next(err); }
  });

  // POST /api/goals
  router.post('/', (req, res, next) => {
    try {
      const parsed = createGoalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const data = { ...parsed.data, currency: parsed.data.currency || req.user.defaultCurrency };
      const goal = goalRepo.create(req.user.id, data);
      audit.log(req.user.id, 'goal.create', 'savings_goal', goal.id);
      res.status(201).json({ goal });
    } catch (err) { next(err); }
  });

  // PUT /api/goals/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = goalRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });
      const goal = goalRepo.update(req.params.id, req.user.id, req.body);

      // Auto-notification: goal completed
      if (!existing.is_completed && goal.is_completed) {
        try { notifService.checkGoalCompleted(req.user.id, goal.id, goal.name); } catch (_) {}
      }

      res.json({ goal });
    } catch (err) { next(err); }
  });

  // DELETE /api/goals/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = goalRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });
      goalRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'goal.delete', 'savings_goal', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
