const express = require('express');
const router = express.Router();

module.exports = function createBudgetRoutes({ db, audit }) {

  // GET /api/budgets
  router.get('/', (req, res, next) => {
    try {
      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
      res.json({ budgets });
    } catch (err) { next(err); }
  });

  // GET /api/budgets/:id
  router.get('/:id', (req, res, next) => {
    try {
      const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });
      const items = db.prepare(`
        SELECT bi.*, c.name as category_name, c.icon as category_icon
        FROM budget_items bi LEFT JOIN categories c ON bi.category_id = c.id
        WHERE bi.budget_id = ?
      `).all(budget.id);
      res.json({ budget, items });
    } catch (err) { next(err); }
  });

  // POST /api/budgets
  router.post('/', (req, res, next) => {
    try {
      const { name, period, start_date, end_date, items } = req.body;
      const result = db.prepare('INSERT INTO budgets (user_id, name, period, start_date, end_date) VALUES (?, ?, ?, ?, ?)')
        .run(req.user.id, name, period, start_date || null, end_date || null);
      if (items && items.length) {
        const insert = db.prepare('INSERT INTO budget_items (budget_id, category_id, amount, rollover) VALUES (?, ?, ?, ?)');
        const tx = db.transaction(() => {
          items.forEach(item => insert.run(result.lastInsertRowid, item.category_id, item.amount, item.rollover ? 1 : 0));
        });
        tx();
      }
      audit.log(req.user.id, 'budget.create', 'budget', result.lastInsertRowid);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) { next(err); }
  });

  // DELETE /api/budgets/:id
  router.delete('/:id', (req, res, next) => {
    try {
      db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
      audit.log(req.user.id, 'budget.delete', 'budget', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
