const express = require('express');
const router = express.Router();
const { createSpendingLimitSchema, updateSpendingLimitSchema } = require('../schemas/spending-limit.schema');
const createSpendingLimitRepository = require('../repositories/spending-limit.repository');

module.exports = function createSpendingLimitRoutes({ db, audit }) {
  const limitRepo = createSpendingLimitRepository({ db });

  // POST /api/spending-limits
  router.post('/', (req, res, next) => {
    try {
      const parsed = createSpendingLimitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }

      // Verify category exists if provided
      if (parsed.data.category_id) {
        const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(parsed.data.category_id, req.user.id);
        if (!cat) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Category not found' } });
        }
      }

      const limit = limitRepo.create(req.user.id, parsed.data);
      audit.log(req.user.id, 'spending_limit.create', 'spending_limit', limit.id);
      res.status(201).json({ spending_limit: limit });
    } catch (err) { next(err); }
  });

  // GET /api/spending-limits
  router.get('/', (req, res, next) => {
    try {
      const limits = limitRepo.findAllByUser(req.user.id);
      res.json({ spending_limits: limits });
    } catch (err) { next(err); }
  });

  // PUT /api/spending-limits/:id
  router.put('/:id', (req, res, next) => {
    try {
      const parsed = updateSpendingLimitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }

      const updated = limitRepo.update(Number(req.params.id), req.user.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spending limit not found' } });
      }

      audit.log(req.user.id, 'spending_limit.update', 'spending_limit', updated.id);
      res.json({ spending_limit: updated });
    } catch (err) { next(err); }
  });

  // DELETE /api/spending-limits/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const removed = limitRepo.remove(Number(req.params.id), req.user.id);
      if (!removed) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spending limit not found' } });
      }

      audit.log(req.user.id, 'spending_limit.delete', 'spending_limit', Number(req.params.id));
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
