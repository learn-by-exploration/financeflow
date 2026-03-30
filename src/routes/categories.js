const express = require('express');
const router = express.Router();
const { createCategorySchema } = require('../schemas/category.schema');

module.exports = function createCategoryRoutes({ db }) {

  // GET /api/categories
  router.get('/', (req, res, next) => {
    try {
      const categories = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, position').all(req.user.id);
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
      const { name, icon, color, type, parent_id } = parsed.data;
      const result = db.prepare(`
        INSERT INTO categories (user_id, name, icon, color, type, parent_id, position)
        VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE user_id = ? AND type = ?))
      `).run(req.user.id, name, icon || '📁', color || '#8b5cf6', type, parent_id || null, req.user.id, type);
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ category });
    } catch (err) { next(err); }
  });

  // PUT /api/categories/:id
  router.put('/:id', (req, res, next) => {
    try {
      const { name, icon, color } = req.body;
      const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
      }
      if (existing.is_system) {
        return res.json({ category: existing });
      }
      db.prepare('UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ? AND user_id = ? AND is_system = 0')
        .run(name, icon, color, req.params.id, req.user.id);
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
      res.json({ category });
    } catch (err) { next(err); }
  });

  // DELETE /api/categories/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
      }
      db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ? AND is_system = 0').run(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
