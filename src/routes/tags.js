const express = require('express');
const router = express.Router();
const { createTagSchema } = require('../schemas/tag.schema');

module.exports = function createTagRoutes({ db, audit }) {
  // GET /api/tags
  router.get('/', (req, res, next) => {
    try {
      const tags = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name').all(req.user.id);
      res.json({ tags });
    } catch (err) { next(err); }
  });

  // POST /api/tags
  router.post('/', (req, res, next) => {
    try {
      const parsed = createTagSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { name, color } = parsed.data;
      const existing = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(req.user.id, name);
      if (existing) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Tag already exists' } });
      }
      const r = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(req.user.id, name, color || null);
      const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(r.lastInsertRowid);
      audit.log(req.user.id, 'tag.create', 'tag', tag.id);
      res.status(201).json({ tag });
    } catch (err) { next(err); }
  });

  // PUT /api/tags/:id
  router.put('/:id', (req, res, next) => {
    try {
      const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!tag) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } });

      const updates = [];
      const values = [];
      if (req.body.name !== undefined) { updates.push('name = ?'); values.push(req.body.name.trim()); }
      if (req.body.color !== undefined) { updates.push('color = ?'); values.push(req.body.color); }
      if (updates.length > 0) {
        values.push(tag.id);
        db.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }
      const updated = db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id);
      res.json({ tag: updated });
    } catch (err) { next(err); }
  });

  // DELETE /api/tags/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const tag = db.prepare('SELECT id FROM tags WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!tag) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } });
      db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
      audit.log(req.user.id, 'tag.delete', 'tag', tag.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
