const express = require('express');
const router = express.Router();
const { createBudgetSchema, updateBudgetSchema } = require('../schemas/budget.schema');
const createBudgetRepository = require('../repositories/budget.repository');
const { invalidateCache } = require('../middleware/cache');

const CACHE_PATTERNS = ['/api/reports', '/api/charts', '/api/insights', '/api/stats'];

module.exports = function createBudgetRoutes({ db, audit }) {
  const budgetRepo = createBudgetRepository({ db });

  // GET /api/budgets
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, period, is_active } = req.query;
      const filters = { limit, offset, period, is_active };
      const budgets = budgetRepo.findAllByUser(req.user.id, filters);
      const total = budgetRepo.countByUser(req.user.id, filters);
      res.json({ budgets, total, limit: Number(limit), offset: Number(offset) });
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
          rollover_amount: Math.round((rollover_amount + Number.EPSILON) * 100) / 100,
          effective_allocated: Math.round((item.amount + rollover_amount + Number.EPSILON) * 100) / 100,
          spent,
          remaining: Math.round((item.amount + rollover_amount - spent + Number.EPSILON) * 100) / 100
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

  // POST /api/budgets/from-template
  const TEMPLATES = {
    '50/30/20': { needs: 0.50, wants: 0.30, savings: 0.20 },
    'zero-based': null, // equal split
    'conscious-spending': { fixed: 0.55, savings: 0.10, investments: 0.10, spending: 0.25 },
  };

  router.post('/from-template', (req, res, next) => {
    try {
      const { template, income } = req.body;
      if (!template || !Object.prototype.hasOwnProperty.call(TEMPLATES, template)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template. Must be one of: 50/30/20, zero-based, conscious-spending' } });
      }
      if (!income || typeof income !== 'number' || income <= 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Income must be a positive number' } });
      }

      // Get user's expense categories
      const categories = db.prepare(
        "SELECT id, name FROM categories WHERE user_id = ? AND type = 'expense' ORDER BY name"
      ).all(req.user.id);

      // Build budget items from template
      const items = [];
      const catCount = categories.length || 1;

      if (template === 'zero-based') {
        const perCat = Math.round((income / catCount) * 100) / 100;
        for (const cat of categories) {
          items.push({ category_id: cat.id, amount: perCat, rollover: 0 });
        }
      } else {
        const splits = TEMPLATES[template];
        const buckets = Object.values(splits);
        for (let i = 0; i < categories.length; i++) {
          const bucketIdx = i % buckets.length;
          const amount = Math.round((income * buckets[bucketIdx] / Math.ceil(catCount / buckets.length)) * 100) / 100;
          items.push({ category_id: categories[i].id, amount, rollover: 0 });
        }
      }

      // Current month date range
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const budget = budgetRepo.create(req.user.id, {
        name: `${template} Budget`,
        period: 'monthly',
        start_date: start,
        end_date: end,
        items,
      });

      audit.log(req.user.id, 'budget.create_from_template', 'budget', budget.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.status(201).json({ id: budget.id, template });
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
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.status(201).json({ id: budget.id });
    } catch (err) { next(err); }
  });

  // PUT /api/budgets/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = budgetRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found' } });
      const parsed = updateBudgetSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const budget = budgetRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'budget.update', 'budget', req.params.id);
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

      const { amount, rollover } = req.body;
      const itemData = {};
      if (amount !== undefined) {
        if (typeof amount !== 'number' || amount < 0) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Amount must be a non-negative number' } });
        itemData.amount = amount;
      }
      if (rollover !== undefined) {
        if (![0, 1].includes(rollover)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Rollover must be 0 or 1' } });
        itemData.rollover = rollover;
      }
      const updated = budgetRepo.updateItem(item.id, budget.id, itemData);
      res.json({ item: updated });
    } catch (err) { next(err); }
  });

  // DELETE /api/budgets/:id
  router.delete('/:id', (req, res, next) => {
    try {
      budgetRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'budget.delete', 'budget', req.params.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
