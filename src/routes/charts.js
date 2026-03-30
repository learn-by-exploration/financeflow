const express = require('express');
const router = express.Router();
const createChartRepository = require('../repositories/chart.repository');

module.exports = function createChartRoutes({ db }) {
  const chartRepo = createChartRepository({ db });

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const INTERVAL_RE = /^(daily|weekly|monthly)$/;

  function validateDateRange(req, res) {
    const { from, to } = req.query;
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from and to query parameters required in YYYY-MM-DD format' } });
      return null;
    }
    return { from, to };
  }

  // GET /api/charts/cashflow?from=DATE&to=DATE&interval=daily|weekly|monthly
  router.get('/cashflow', (req, res, next) => {
    try {
      const range = validateDateRange(req, res);
      if (!range) return;
      const interval = INTERVAL_RE.test(req.query.interval) ? req.query.interval : 'monthly';
      const data = chartRepo.getCashFlow(req.user.id, range.from, range.to, interval);
      res.json(data);
    } catch (err) { next(err); }
  });

  // GET /api/charts/balance-history?account_id=X&from=DATE&to=DATE
  router.get('/balance-history', (req, res, next) => {
    try {
      const range = validateDateRange(req, res);
      if (!range) return;
      const accountId = Number(req.query.account_id);
      if (!accountId) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'account_id query parameter required' } });
      }
      const data = chartRepo.getBalanceHistory(req.user.id, accountId, range.from, range.to);
      if (!data) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
      }
      res.json(data);
    } catch (err) { next(err); }
  });

  // GET /api/charts/spending-pie?from=DATE&to=DATE
  router.get('/spending-pie', (req, res, next) => {
    try {
      const range = validateDateRange(req, res);
      if (!range) return;
      const data = chartRepo.getSpendingPie(req.user.id, range.from, range.to);
      res.json(data);
    } catch (err) { next(err); }
  });

  // GET /api/charts/income-expense?from=DATE&to=DATE&interval=monthly
  router.get('/income-expense', (req, res, next) => {
    try {
      const range = validateDateRange(req, res);
      if (!range) return;
      const interval = INTERVAL_RE.test(req.query.interval) ? req.query.interval : 'monthly';
      const data = chartRepo.getIncomeExpense(req.user.id, range.from, range.to, interval);
      res.json(data);
    } catch (err) { next(err); }
  });

  // GET /api/charts/net-worth?from=DATE&to=DATE&interval=monthly
  router.get('/net-worth', (req, res, next) => {
    try {
      const range = validateDateRange(req, res);
      if (!range) return;
      const interval = INTERVAL_RE.test(req.query.interval) ? req.query.interval : 'monthly';
      const data = chartRepo.getNetWorthTrend(req.user.id, range.from, range.to, interval);
      res.json(data);
    } catch (err) { next(err); }
  });

  // GET /api/charts/budget-utilization?budget_id=X
  router.get('/budget-utilization', (req, res, next) => {
    try {
      const budgetId = Number(req.query.budget_id);
      if (!budgetId) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'budget_id query parameter required' } });
      }
      const data = chartRepo.getBudgetUtilization(req.user.id, budgetId);
      if (!data) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });
      }
      res.json(data);
    } catch (err) { next(err); }
  });

  return router;
};
