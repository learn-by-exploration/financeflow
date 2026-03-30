const express = require('express');
const router = express.Router();
const createInsightRepository = require('../repositories/insight.repository');

module.exports = function createInsightRoutes({ db }) {
  const insightRepo = createInsightRepository({ db });

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // GET /api/insights/trends?months=6
  router.get('/trends', (req, res, next) => {
    try {
      const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 24);
      const result = insightRepo.getSpendingTrends(req.user.id, months);
      res.json(result);
    } catch (err) { next(err); }
  });

  // GET /api/insights/anomalies?months=3
  router.get('/anomalies', (req, res, next) => {
    try {
      const months = Math.min(Math.max(parseInt(req.query.months) || 3, 1), 12);
      const anomalies = insightRepo.getAnomalies(req.user.id, months);
      res.json({ anomalies });
    } catch (err) { next(err); }
  });

  // GET /api/insights/velocity
  router.get('/velocity', (req, res, next) => {
    try {
      const velocity = insightRepo.getSpendingVelocity(req.user.id);
      res.json(velocity);
    } catch (err) { next(err); }
  });

  // GET /api/insights/categories
  router.get('/categories', (req, res, next) => {
    try {
      const result = insightRepo.getCategoryChanges(req.user.id);
      res.json(result);
    } catch (err) { next(err); }
  });

  // GET /api/insights/payees?from=DATE&to=DATE&limit=10
  router.get('/payees', (req, res, next) => {
    try {
      const { from, to } = req.query;
      if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from and to query parameters required in YYYY-MM-DD format' } });
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
      const payees = insightRepo.getTopPayees(req.user.id, from, to, limit);
      res.json({ from, to, payees });
    } catch (err) { next(err); }
  });

  return router;
};
