const express = require('express');
const router = express.Router();
const createSplitService = require('../services/split.service');
const createSplitRepository = require('../repositories/split.repository');
const { createExpenseSchema, createSettlementSchema } = require('../schemas/split.schema');

module.exports = function createSplitRoutes({ db, audit }) {

  const splitService = createSplitService({ db });
  const splitRepo = createSplitRepository({ db });

  // GET /api/groups/:groupId/expenses — list shared expenses
  router.get('/:groupId/expenses', (req, res, next) => {
    try {
      const membership = splitRepo.getMembership(req.params.groupId, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const expenses = splitRepo.getGroupExpenses(req.params.groupId);
      res.json({ expenses });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:groupId/expenses — add shared expense
  router.post('/:groupId/expenses', (req, res, next) => {
    try {
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { paid_by, amount, currency, description, category_id, date, note, split_method, splits } = parsed.data;

      // Validate exact splits sum
      if (split_method === 'exact' && splits && splits.length) {
        const splitSum = Math.round(splits.reduce((s, sp) => s + sp.amount, 0) * 100) / 100;
        if (splitSum !== amount) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Split amounts (${splitSum}) must equal expense amount (${amount})` } });
        }
      }

      // Validate percentage splits
      if (split_method === 'percentage') {
        if (!splits || !splits.length) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Percentage split requires splits array with percentage field' } });
        }
        if (splits.some(s => typeof s.percentage !== 'number' || s.percentage <= 0)) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'All percentages must be positive numbers' } });
        }
        const pctSum = Math.round(splits.reduce((s, sp) => s + sp.percentage, 0) * 100) / 100;
        if (pctSum !== 100) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Percentages must sum to 100 (got ${pctSum})` } });
        }
      }

      // Validate shares splits
      if (split_method === 'shares') {
        if (!splits || !splits.length) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Shares split requires splits array with shares field' } });
        }
        if (splits.some(s => typeof s.shares !== 'number' || s.shares <= 0)) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'All shares must be positive numbers' } });
        }
      }

      const expenseId = splitRepo.createExpense(req.params.groupId, {
        paid_by, amount, currency: currency || req.user.defaultCurrency,
        description, category_id, date, note, split_method,
      });

      if (split_method === 'percentage' && splits && splits.length) {
        const percentages = splits.map(s => s.percentage);
        const amounts = splitService.calculatePercentageSplit(amount, percentages);
        splitRepo.createExpenseSplits(expenseId, splits.map((s, i) => ({ member_id: s.member_id, amount: amounts[i] })));
      } else if (split_method === 'shares' && splits && splits.length) {
        const sharesArr = splits.map(s => s.shares);
        const amounts = splitService.calculateSharesSplit(amount, sharesArr);
        splitRepo.createExpenseSplits(expenseId, splits.map((s, i) => ({ member_id: s.member_id, amount: amounts[i] })));
      } else if (splits && splits.length) {
        splitRepo.createExpenseSplits(expenseId, splits.map(s => ({ member_id: s.member_id, amount: s.amount })));
      } else {
        const members = splitRepo.getGroupMembers(req.params.groupId);
        const amounts = splitService.calculateEqualSplit(amount, members.length);
        splitRepo.createExpenseSplits(expenseId, members.map((m, i) => ({ member_id: m.id, amount: amounts[i] })));
      }

      audit.log(req.user.id, 'expense.create', 'shared_expense', expenseId);
      res.status(201).json({ id: expenseId });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:groupId/expenses/:id
  router.delete('/:groupId/expenses/:id', (req, res, next) => {
    try {
      const expense = splitRepo.getExpense(req.params.id, req.params.groupId);
      if (!expense) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });
      splitRepo.deleteExpense(req.params.id);
      audit.log(req.user.id, 'expense.delete', 'shared_expense', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:groupId/balances — who owes whom (simplified debts)
  router.get('/:groupId/balances', (req, res, next) => {
    try {
      const membership = splitRepo.getMembership(req.params.groupId, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const balanceList = splitService.calculateBalances(req.params.groupId);
      const simplified_debts = splitService.simplifyDebts(balanceList);

      res.json({ balances: balanceList, simplified_debts });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:groupId/settle — record a settlement
  router.post('/:groupId/settle', (req, res, next) => {
    try {
      const parsed = createSettlementSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { from_member, to_member, amount, note } = parsed.data;
      const settlementId = splitRepo.createSettlement(req.params.groupId, {
        from_member, to_member, amount, currency: req.user.defaultCurrency, note,
      });
      audit.log(req.user.id, 'settlement.create', 'settlement', settlementId);
      res.status(201).json({ id: settlementId });
    } catch (err) { next(err); }
  });

  return router;
};
