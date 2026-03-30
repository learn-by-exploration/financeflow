const express = require('express');
const router = express.Router();
const { createTagSchema } = require('../schemas/tag.schema');
const createTagRepository = require('../repositories/tag.repository');

module.exports = function createTagRoutes({ db, audit }) {
  const tagRepo = createTagRepository({ db });

  // GET /api/tags
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const tags = tagRepo.findAllByUser(req.user.id, { limit, offset });
      const total = tagRepo.countByUser(req.user.id);
      res.json({ tags, total, limit: Number(limit), offset: Number(offset) });
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
      const existing = tagRepo.findByName(req.user.id, name);
      if (existing) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Tag already exists' } });
      }
      const tag = tagRepo.create(req.user.id, { name, color });
      audit.log(req.user.id, 'tag.create', 'tag', tag.id);
      res.status(201).json({ tag });
    } catch (err) { next(err); }
  });

  // PUT /api/tags/:id
  router.put('/:id', (req, res, next) => {
    try {
      const tag = tagRepo.findById(req.params.id, req.user.id);
      if (!tag) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } });

      const updated = tagRepo.update(tag.id, req.user.id, req.body);
      res.json({ tag: updated });
    } catch (err) { next(err); }
  });

  // DELETE /api/tags/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const tag = tagRepo.findById(req.params.id, req.user.id);
      if (!tag) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } });
      tagRepo.delete(tag.id, req.user.id);
      audit.log(req.user.id, 'tag.delete', 'tag', tag.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
