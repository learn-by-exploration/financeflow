const express = require('express');
const router = express.Router();
const { validatePattern } = require('../utils/safe-regex');
const { createRuleSchema, updateRuleSchema } = require('../schemas/rule.schema');

module.exports = function createRulesRoutes({ db }) {

  // GET /api/rules
  router.get('/', (req, res, next) => {
    try {
      const rules = db.prepare(`
        SELECT r.*, c.name as category_name, c.icon as category_icon
        FROM category_rules r
        LEFT JOIN categories c ON r.category_id = c.id
        WHERE r.user_id = ?
        ORDER BY r.position ASC, r.id ASC
      `).all(req.user.id);
      res.json({ rules });
    } catch (err) { next(err); }
  });

  // POST /api/rules
  router.post('/', (req, res, next) => {
    try {
      const parsed = createRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { pattern, category_id, position } = parsed.data;
      const patternCheck = validatePattern(pattern);
      if (!patternCheck.valid) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: patternCheck.reason } });
      }
      // Verify category exists and belongs to user
      const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(category_id, req.user.id);
      if (!cat) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Category not found' } });
      }
      const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM category_rules WHERE user_id = ?').get(req.user.id).max;
      const result = db.prepare(
        'INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 0, ?)'
      ).run(req.user.id, pattern, category_id, position !== null && position !== undefined ? position : maxPos + 1);
      const rule = db.prepare('SELECT * FROM category_rules WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ rule });
    } catch (err) { next(err); }
  });

  // PUT /api/rules/:id
  router.put('/:id', (req, res, next) => {
    try {
      const rule = db.prepare('SELECT * FROM category_rules WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!rule) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rule not found' } });
      }
      if (rule.is_system) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot modify system rules' } });
      }
      const parsed = updateRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { pattern, category_id, position } = parsed.data;
      if (pattern) {
        const patternCheck = validatePattern(pattern);
        if (!patternCheck.valid) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: patternCheck.reason } });
        }
      }
      db.prepare(`
        UPDATE category_rules
        SET pattern = COALESCE(?, pattern),
            category_id = COALESCE(?, category_id),
            position = COALESCE(?, position)
        WHERE id = ?
      `).run(pattern || null, category_id || null, position !== null && position !== undefined ? position : null, rule.id);
      const updated = db.prepare('SELECT * FROM category_rules WHERE id = ?').get(rule.id);
      res.json({ rule: updated });
    } catch (err) { next(err); }
  });

  // DELETE /api/rules/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const rule = db.prepare('SELECT * FROM category_rules WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!rule) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rule not found' } });
      }
      if (rule.is_system) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot delete system rules' } });
      }
      db.prepare('DELETE FROM category_rules WHERE id = ?').run(rule.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
