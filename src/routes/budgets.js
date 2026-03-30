const express = require('express');
const router = express.Router();

module.exports = function createBudgetRoutes({ db, audit }) {

  const VALID_PERIODS = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];

  // GET /api/budgets
  router.get('/', (req, res, next) => {
    try {
      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(req.user.id);
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

  // GET /api/budgets/:id/summary
  router.get('/:id/summary', (req, res, next) => {
    try {
      const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });

      const items = db.prepare(`
        SELECT bi.*, c.name as category_name, c.icon as category_icon
        FROM budget_items bi LEFT JOIN categories c ON bi.category_id = c.id
        WHERE bi.budget_id = ?
      `).all(budget.id);

      // Get spending per category in budget period
      const spending = db.prepare(`
        SELECT category_id, SUM(amount) as total_spent
        FROM transactions
        WHERE user_id = ? AND type = 'expense'
        AND date >= ? AND date <= ?
        GROUP BY category_id
      `).all(req.user.id, budget.start_date, budget.end_date);

      const spendingMap = {};
      for (const s of spending) {
        spendingMap[s.category_id] = s.total_spent;
      }

      const categories = items.map(item => {
        const spent = spendingMap[item.category_id] || 0;

        // Rollover calculation: find previous budget with same category
        let rollover_amount = 0;
        if (item.rollover) {
          const prevBudget = db.prepare(`
            SELECT b.id, b.start_date, b.end_date FROM budgets b
            WHERE b.user_id = ? AND b.id != ? AND b.end_date < ?
            ORDER BY b.end_date DESC LIMIT 1
          `).get(req.user.id, budget.id, budget.start_date);

          if (prevBudget) {
            const prevItem = db.prepare(`
              SELECT bi.amount FROM budget_items bi
              WHERE bi.budget_id = ? AND bi.category_id = ?
            `).get(prevBudget.id, item.category_id);

            if (prevItem) {
              const prevSpent = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total FROM transactions
                WHERE user_id = ? AND type = 'expense' AND category_id = ?
                AND date >= ? AND date <= ?
              `).get(req.user.id, item.category_id, prevBudget.start_date, prevBudget.end_date);
              rollover_amount = prevItem.amount - (prevSpent.total || 0);
            }
          }
        }

        return {
          category_id: item.category_id,
          category_name: item.category_name,
          category_icon: item.category_icon,
          allocated: item.amount,
          rollover_amount,
          effective_allocated: item.amount + rollover_amount,
          spent,
          remaining: item.amount + rollover_amount - spent
        };
      });

      const total_allocated = categories.reduce((s, c) => s + c.allocated, 0);
      const total_spent = categories.reduce((s, c) => s + c.spent, 0);

      res.json({
        budget,
        categories,
        total_allocated,
        total_spent,
        total_remaining: total_allocated - total_spent
      });
    } catch (err) { next(err); }
  });

  // POST /api/budgets
  router.post('/', (req, res, next) => {
    try {
      const { name, period, start_date, end_date, items } = req.body;
      if (!name) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Budget name is required' } });
      }
      if (!period || !VALID_PERIODS.includes(period)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Period must be one of: weekly, monthly, quarterly, yearly, custom' } });
      }
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

  // PUT /api/budgets/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });
      const { name, period, start_date, end_date, is_active } = req.body;
      db.prepare(`
        UPDATE budgets SET name = COALESCE(?, name), period = COALESCE(?, period),
        start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
        is_active = COALESCE(?, is_active), updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(name, period, start_date, end_date, is_active, req.params.id, req.user.id);
      const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
      res.json({ budget });
    } catch (err) { next(err); }
  });

  // PUT /api/budgets/:id/items/:itemId — update budget item (rollover toggle, amount)
  router.put('/:id/items/:itemId', (req, res, next) => {
    try {
      const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });

      const item = db.prepare('SELECT * FROM budget_items WHERE id = ? AND budget_id = ?').get(req.params.itemId, budget.id);
      if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget item not found' } });

      const updates = [];
      const values = [];
      if (req.body.rollover !== undefined) { updates.push('rollover = ?'); values.push(req.body.rollover); }
      if (req.body.amount !== undefined) { updates.push('amount = ?'); values.push(req.body.amount); }
      if (updates.length > 0) {
        values.push(item.id);
        db.prepare(`UPDATE budget_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }
      const updated = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(item.id);
      res.json({ item: updated });
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
