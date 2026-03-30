const express = require('express');
const router = express.Router();
const { createCategorySchema } = require('../schemas/category.schema');
const createCategoryRepository = require('../repositories/category.repository');
const { ValidationError, NotFoundError } = require('../errors');
const { safePatternTest } = require('../utils/safe-regex');

module.exports = function createCategoryRoutes({ db }) {

  const categoryRepo = createCategoryRepository({ db });

  // GET /api/categories/suggest?description=X
  router.get('/suggest', (req, res, next) => {
    try {
      const { description } = req.query;
      if (!description) {
        return res.json({ suggestion: null });
      }
      const rules = db.prepare(
        `SELECT r.*, c.name as category_name
         FROM category_rules r
         LEFT JOIN categories c ON r.category_id = c.id
         WHERE r.user_id = ?
         ORDER BY r.position ASC, r.id ASC`
      ).all(req.user.id);

      for (const rule of rules) {
        if (safePatternTest(rule.pattern, description)) {
          return res.json({
            suggestion: {
              category_id: rule.category_id,
              category_name: rule.category_name,
            },
          });
        }
      }
      res.json({ suggestion: null });
    } catch (err) { next(err); }
  });

  // GET /api/categories
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, type } = req.query;
      const filters = { limit, offset, type };
      const categories = categoryRepo.findAllByUser(req.user.id, filters);
      const total = categoryRepo.countByUser(req.user.id, filters);
      res.json({ categories, total, limit: Number(limit), offset: Number(offset) });
    } catch (err) { next(err); }
  });

  // POST /api/categories
  router.post('/', (req, res, next) => {
    try {
      const parsed = createCategorySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const category = categoryRepo.create(req.user.id, parsed.data);
      res.status(201).json({ category });
    } catch (err) { next(err); }
  });

  // PUT /api/categories/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = categoryRepo.findById(req.params.id, req.user.id);
      if (!existing) {
        throw new NotFoundError('Category');
      }
      if (existing.is_system) {
        return res.json({ category: existing });
      }
      const category = categoryRepo.update(req.params.id, req.user.id, req.body);
      res.json({ category });
    } catch (err) { next(err); }
  });

  // DELETE /api/categories/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = categoryRepo.findById(req.params.id, req.user.id);
      if (!existing) {
        throw new NotFoundError('Category');
      }
      categoryRepo.delete(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
