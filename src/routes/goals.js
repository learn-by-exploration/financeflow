const express = require('express');
const router = express.Router();

module.exports = function createGoalRoutes({ db, audit }) {

  // GET /api/goals
  router.get('/', (req, res, next) => {
    try {
      const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY position').all(req.user.id);
      res.json({ goals });
    } catch (err) { next(err); }
  });

  // POST /api/goals
  router.post('/', (req, res, next) => {
    try {
      const { name, target_amount, current_amount, currency, icon, color, deadline } = req.body;
      if (!name) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } });
      }
      if (!target_amount || target_amount <= 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Target amount must be a positive number' } });
      }
      const result = db.prepare(`
        INSERT INTO savings_goals (user_id, name, target_amount, current_amount, currency, icon, color, deadline, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM savings_goals WHERE user_id = ?))
      `).run(req.user.id, name, target_amount, current_amount || 0, currency || req.user.defaultCurrency, icon || '🎯', color || '#10b981', deadline || null, req.user.id);
      audit.log(req.user.id, 'goal.create', 'savings_goal', result.lastInsertRowid);
      const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ goal });
    } catch (err) { next(err); }
  });

  // PUT /api/goals/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });
      const { name, target_amount, current_amount, icon, color, deadline, is_completed } = req.body;

      // Auto-mark completed if current_amount >= target_amount
      let effectiveCompleted = is_completed;
      const effectiveCurrent = current_amount !== undefined ? current_amount : existing.current_amount;
      const effectiveTarget = target_amount !== undefined ? target_amount : existing.target_amount;
      if (effectiveCurrent >= effectiveTarget) {
        effectiveCompleted = 1;
      }

      db.prepare(`
        UPDATE savings_goals SET name = COALESCE(?, name), target_amount = COALESCE(?, target_amount),
        current_amount = COALESCE(?, current_amount), icon = COALESCE(?, icon), color = COALESCE(?, color),
        deadline = COALESCE(?, deadline), is_completed = COALESCE(?, is_completed), updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(name, target_amount, current_amount, icon, color, deadline, effectiveCompleted, req.params.id, req.user.id);
      const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id);
      res.json({ goal });
    } catch (err) { next(err); }
  });

  // DELETE /api/goals/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });
      db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
      audit.log(req.user.id, 'goal.delete', 'savings_goal', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
