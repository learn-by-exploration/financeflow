const express = require('express');
const router = express.Router();
const createSplitService = require('../services/split.service');

module.exports = function createSplitRoutes({ db, audit }) {

  const splitService = createSplitService({ db });

  // GET /api/groups/:groupId/expenses — list shared expenses
  router.get('/:groupId/expenses', (req, res, next) => {
    try {
      const membership = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.groupId, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const expenses = db.prepare(`
        SELECT se.*, gm.display_name as paid_by_name
        FROM shared_expenses se JOIN group_members gm ON se.paid_by = gm.id
        WHERE se.group_id = ? ORDER BY se.date DESC
      `).all(req.params.groupId);
      res.json({ expenses });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:groupId/expenses — add shared expense
  router.post('/:groupId/expenses', (req, res, next) => {
    try {
      const { paid_by, amount, currency, description, category_id, date, note, split_method, splits } = req.body;

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

      const result = db.prepare(`
        INSERT INTO shared_expenses (group_id, paid_by, amount, currency, description, category_id, date, note, split_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.groupId, paid_by, amount, currency || req.user.defaultCurrency, description, category_id || null, date, note || null, split_method || 'equal');

      if (split_method === 'percentage' && splits && splits.length) {
        // Calculate amounts from percentages
        const percentages = splits.map(s => s.percentage);
        const amounts = splitService.calculatePercentageSplit(amount, percentages);
        const insert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)');
        const tx = db.transaction(() => {
          splits.forEach((s, i) => insert.run(result.lastInsertRowid, s.member_id, amounts[i]));
        });
        tx();
      } else if (split_method === 'shares' && splits && splits.length) {
        // Calculate amounts from shares
        const sharesArr = splits.map(s => s.shares);
        const amounts = splitService.calculateSharesSplit(amount, sharesArr);
        const insert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)');
        const tx = db.transaction(() => {
          splits.forEach((s, i) => insert.run(result.lastInsertRowid, s.member_id, amounts[i]));
        });
        tx();
      } else if (splits && splits.length) {
        const insert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)');
        const tx = db.transaction(() => {
          splits.forEach(s => insert.run(result.lastInsertRowid, s.member_id, s.amount));
        });
        tx();
      } else {
        // Auto equal split with proper rounding
        const members = db.prepare('SELECT id FROM group_members WHERE group_id = ?').all(req.params.groupId);
        const amounts = splitService.calculateEqualSplit(amount, members.length);
        const insert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)');
        const tx = db.transaction(() => {
          members.forEach((m, i) => {
            insert.run(result.lastInsertRowid, m.id, amounts[i]);
          });
        });
        tx();
      }

      audit.log(req.user.id, 'expense.create', 'shared_expense', result.lastInsertRowid);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:groupId/expenses/:id
  router.delete('/:groupId/expenses/:id', (req, res, next) => {
    try {
      const expense = db.prepare('SELECT * FROM shared_expenses WHERE id = ? AND group_id = ?').get(req.params.id, req.params.groupId);
      if (!expense) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });
      // CASCADE will handle expense_splits
      db.prepare('DELETE FROM shared_expenses WHERE id = ?').run(req.params.id);
      audit.log(req.user.id, 'expense.delete', 'shared_expense', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:groupId/balances — who owes whom (simplified debts)
  router.get('/:groupId/balances', (req, res, next) => {
    try {
      const membership = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.groupId, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const balanceList = splitService.calculateBalances(req.params.groupId);
      const simplified_debts = splitService.simplifyDebts(balanceList);

      res.json({ balances: balanceList, simplified_debts });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:groupId/settle — record a settlement
  router.post('/:groupId/settle', (req, res, next) => {
    try {
      const { from_member, to_member, amount, note } = req.body;
      const result = db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount, currency, note) VALUES (?, ?, ?, ?, ?, ?)')
        .run(req.params.groupId, from_member, to_member, amount, req.user.defaultCurrency, note || null);
      audit.log(req.user.id, 'settlement.create', 'settlement', result.lastInsertRowid);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) { next(err); }
  });

  return router;
};
