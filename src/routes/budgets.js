const express = require('express');
const router = express.Router();
const { createBudgetSchema } = require('../schemas/budget.schema');
const createBudgetRepository = require('../repositories/budget.repository');

module.exports = function createBudgetRoutes({ db, audit }) {
  const budgetRepo = createBudgetRepository({ db });

  // GET /api/budgets
  router.get('/', (req, res, next) => {
    try {
      const budgets = budgetRepo.findAllByUser(req.user.id);
      res.json({ budgets });
    } catch (err) { next(err); }
  });

  // GET /api/budgets/:id
  router.get('/:id', (req, res, next) => {
    try {
      const budget = budgetRepo.findById(req.params.id, req.user.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });
      const items = budgetRepo.getItems(budget.id);
      res.json({ budget, items });
    } catch (err) { next(err); }
  });

  // GET /api/budgets/:id/summary
  router.get('/:id/summary', (req, res, next) => {
    try {
      const budget = budgetRepo.findById(req.params.id, req.user.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });

      const items = budgetRepo.getItems(budget.id);

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
      const parsed = createBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const budget = budgetRepo.create(req.user.id, parsed.data);
      audit.log(req.user.id, 'budget.create', 'budget', budget.id);
      res.status(201).json({ id: budget.id });
    } catch (err) { next(err); }
  });

  // PUT /api/budgets/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = budgetRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });
      const budget = budgetRepo.update(req.params.id, req.user.id, req.body);
      res.json({ budget });
    } catch (err) { next(err); }
  });

  // PUT /api/budgets/:id/items/:itemId — update budget item (rollover toggle, amount)
  router.put('/:id/items/:itemId', (req, res, next) => {
    try {
      const budget = budgetRepo.findById(req.params.id, req.user.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });

      const item = budgetRepo.findItemById(req.params.itemId, budget.id);
      if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget item not found' } });

      const updated = budgetRepo.updateItem(item.id, budget.id, req.body);
      res.json({ item: updated });
    } catch (err) { next(err); }
  });

  // DELETE /api/budgets/:id
  router.delete('/:id', (req, res, next) => {
    try {
      budgetRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'budget.delete', 'budget', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
