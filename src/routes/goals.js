const express = require('express');
const router = express.Router();
const { createGoalSchema, updateGoalSchema } = require('../schemas/goal.schema');
const createGoalRepository = require('../repositories/goal.repository');
const createTransactionRepository = require('../repositories/transaction.repository');
const createNotificationService = require('../services/notification.service');

module.exports = function createGoalRoutes({ db, audit }) {
  const goalRepo = createGoalRepository({ db });
  const txRepo = createTransactionRepository({ db });
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
      // Support shared goals via group_id
      if (parsed.data.group_id) {
        data.group_id = parsed.data.group_id;
      }
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
      const parsed = updateGoalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const goal = goalRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'goal.update', 'savings_goal', req.params.id);

      // Auto-notification: goal completed
      if (!existing.is_completed && goal.is_completed) {
        try { notifService.checkGoalCompleted(req.user.id, goal.id, goal.name); } catch (_e) {}
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

  // POST /api/goals/:id/transactions — link a transaction to a goal
  router.post('/:id/transactions', (req, res, next) => {
    try {
      const goal = goalRepo.findById(req.params.id, req.user.id);
      if (!goal) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });

      const { transaction_id, amount } = req.body;
      if (!transaction_id) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'transaction_id is required' } });

      const tx = txRepo.findById(transaction_id, req.user.id);
      if (!tx) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });

      const linkAmount = amount !== undefined ? Number(amount) : tx.amount;
      if (isNaN(linkAmount) || linkAmount <= 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Amount must be a positive number' } });
      }

      // Check if already linked
      const existing = goalRepo.findLinkedTransaction(goal.id, tx.id);
      if (existing) return res.status(409).json({ error: { code: 'ALREADY_LINKED', message: 'Transaction already linked to this goal' } });

      const link = goalRepo.linkTransaction(goal.id, tx.id, linkAmount);
      const updatedGoal = goalRepo.recalculateCurrentAmount(goal.id, req.user.id);
      audit.log(req.user.id, 'goal.link_transaction', 'savings_goal', goal.id);
      res.status(201).json({ link, goal: updatedGoal });
    } catch (err) { next(err); }
  });

  // GET /api/goals/:id/transactions — list linked transactions
  router.get('/:id/transactions', (req, res, next) => {
    try {
      const goal = goalRepo.findById(req.params.id, req.user.id);
      if (!goal) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });

      const transactions = goalRepo.getLinkedTransactions(goal.id);
      res.json({ transactions, total: transactions.length });
    } catch (err) { next(err); }
  });

  // DELETE /api/goals/:id/transactions/:txId — unlink a transaction
  router.delete('/:id/transactions/:txId', (req, res, next) => {
    try {
      const goal = goalRepo.findById(req.params.id, req.user.id);
      if (!goal) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });

      const existing = goalRepo.findLinkedTransaction(goal.id, Number(req.params.txId));
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Link not found' } });

      goalRepo.unlinkTransaction(goal.id, Number(req.params.txId));
      const updatedGoal = goalRepo.recalculateCurrentAmount(goal.id, req.user.id);
      audit.log(req.user.id, 'goal.unlink_transaction', 'savings_goal', goal.id);
      res.json({ ok: true, goal: updatedGoal });
    } catch (err) { next(err); }
  });

  // PUT /api/goals/:id/auto-allocate — set auto-allocate percentage
  router.put('/:id/auto-allocate', (req, res, next) => {
    try {
      const goal = goalRepo.findById(req.params.id, req.user.id);
      if (!goal) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });

      const { percent } = req.body;
      if (percent === undefined || percent === null) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'percent is required' } });
      }
      const pct = Number(percent);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'percent must be between 0 and 100' } });
      }

      const updatedGoal = goalRepo.setAutoAllocate(goal.id, req.user.id, pct);
      audit.log(req.user.id, 'goal.set_auto_allocate', 'savings_goal', goal.id);
      res.json({ goal: updatedGoal });
    } catch (err) { next(err); }
  });

  return router;
};
