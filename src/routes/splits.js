const express = require('express');
const router = express.Router();

module.exports = function createSplitRoutes({ db, audit }) {

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

      const result = db.prepare(`
        INSERT INTO shared_expenses (group_id, paid_by, amount, currency, description, category_id, date, note, split_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.groupId, paid_by, amount, currency || req.user.defaultCurrency, description, category_id || null, date, note || null, split_method || 'equal');

      if (splits && splits.length) {
        const insert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)');
        const tx = db.transaction(() => {
          splits.forEach(s => insert.run(result.lastInsertRowid, s.member_id, s.amount));
        });
        tx();
      } else {
        // Auto equal split across all members
        const members = db.prepare('SELECT id FROM group_members WHERE group_id = ?').all(req.params.groupId);
        const splitAmount = Math.round((amount / members.length) * 100) / 100;
        const insert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)');
        const tx = db.transaction(() => {
          members.forEach(m => insert.run(result.lastInsertRowid, m.id, splitAmount));
        });
        tx();
      }

      audit.log(req.user.id, 'expense.create', 'shared_expense', result.lastInsertRowid);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:groupId/balances — who owes whom (simplified debts)
  router.get('/:groupId/balances', (req, res, next) => {
    try {
      const membership = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.groupId, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const members = db.prepare('SELECT id, display_name FROM group_members WHERE group_id = ?').all(req.params.groupId);
      const balances = {};
      members.forEach(m => { balances[m.id] = { id: m.id, name: m.display_name, balance: 0 }; });

      // Calculate: paid amounts vs owed amounts
      const expenses = db.prepare('SELECT * FROM shared_expenses WHERE group_id = ? AND is_settled = 0').all(req.params.groupId);
      for (const exp of expenses) {
        balances[exp.paid_by].balance += exp.amount;
        const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ? AND is_settled = 0').all(exp.id);
        for (const split of splits) {
          balances[split.member_id].balance -= split.amount;
        }
      }

      // Account for settlements
      const settlements = db.prepare('SELECT * FROM settlements WHERE group_id = ?').all(req.params.groupId);
      for (const s of settlements) {
        balances[s.from_member].balance += s.amount;
        balances[s.to_member].balance -= s.amount;
      }

      res.json({ balances: Object.values(balances) });
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
