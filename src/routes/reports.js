const express = require('express');
const router = express.Router();
const createReportRepository = require('../repositories/report.repository');

module.exports = function createReportRoutes({ db }) {
  const reportRepo = createReportRepository({ db });

  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // GET /api/reports/monthly?month=YYYY-MM
  router.get('/monthly', (req, res, next) => {
    try {
      const { month } = req.query;
      if (!month || !MONTH_RE.test(month)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'month query parameter required in YYYY-MM format' } });
      }
      const [year, mm] = month.split('-');
      const userId = req.user.id;

      const summary = reportRepo.getMonthlySummary(userId, year, mm);
      const top_categories = reportRepo.getTopCategories(userId, `${year}-${mm}-01`, `${year}-${mm}-31`);
      const daily = reportRepo.getDailyBreakdown(userId, year, mm);

      res.json({ month, ...summary, top_categories, daily });
    } catch (err) { next(err); }
  });

  // GET /api/reports/yearly?year=YYYY
  router.get('/yearly', (req, res, next) => {
    try {
      const { year } = req.query;
      if (!year || !/^\d{4}$/.test(year)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'year query parameter required in YYYY format' } });
      }
      const months = reportRepo.getYearlyOverview(req.user.id, year);
      res.json({ year, months });
    } catch (err) { next(err); }
  });

  // GET /api/reports/categories?from=DATE&to=DATE
  router.get('/categories', (req, res, next) => {
    try {
      const { from, to } = req.query;
      if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from and to query parameters required in YYYY-MM-DD format' } });
      }
      const categories = reportRepo.getCategoryBreakdown(req.user.id, from, to);
      res.json({ from, to, categories });
    } catch (err) { next(err); }
  });

  // GET /api/reports/compare?month1=YYYY-MM&month2=YYYY-MM
  router.get('/compare', (req, res, next) => {
    try {
      const { month1, month2 } = req.query;
      if (!month1 || !month2 || !MONTH_RE.test(month1) || !MONTH_RE.test(month2)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'month1 and month2 query parameters required in YYYY-MM format' } });
      }
      const comparison = reportRepo.compareMonths(req.user.id, month1, month2);
      res.json(comparison);
    } catch (err) { next(err); }
  });

  return router;
};
