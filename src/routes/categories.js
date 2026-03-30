const express = require('express');
const router = express.Router();
const { createCategorySchema } = require('../schemas/category.schema');
const createCategoryRepository = require('../repositories/category.repository');

module.exports = function createCategoryRoutes({ db }) {

  const categoryRepo = createCategoryRepository({ db });

  // GET /api/categories
  router.get('/', (req, res, next) => {
    try {
      const categories = categoryRepo.findAllByUser(req.user.id);
      res.json({ categories });
    } catch (err) { next(err); }
  });

  // POST /api/categories
  router.post('/', (req, res, next) => {
    try {
      const parsed = createCategorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
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
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
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
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
      }
      categoryRepo.delete(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
