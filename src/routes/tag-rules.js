// src/routes/tag-rules.js
const express = require('express');
const router = express.Router();
const { createTagRuleSchema, updateTagRuleSchema } = require('../schemas/tag-rule.schema');
const createTagRuleRepository = require('../repositories/tag-rule.repository');
const { validatePattern } = require('../utils/safe-regex');

module.exports = function createTagRuleRoutes({ db }) {
  const repo = createTagRuleRepository({ db });

  // GET /api/tag-rules
  router.get('/', (req, res, next) => {
    try {
      const rules = repo.findAllByUser(req.user.id);
      res.json({ rules });
    } catch (err) { next(err); }
  });

  // POST /api/tag-rules
  router.post('/', (req, res, next) => {
    try {
      const parsed = createTagRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      // Validate pattern for description match_type
      if (parsed.data.match_type === 'description') {
        const check = validatePattern(parsed.data.pattern);
        if (!check.valid) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: check.reason } });
        }
      }
      const rule = repo.create(req.user.id, parsed.data);
      res.status(201).json({ rule });
    } catch (err) { next(err); }
  });

  // PUT /api/tag-rules/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = repo.findById(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tag rule not found' } });
      }
      const parsed = updateTagRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      if (parsed.data.pattern && (parsed.data.match_type || existing.match_type) === 'description') {
        const check = validatePattern(parsed.data.pattern);
        if (!check.valid) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: check.reason } });
        }
      }
      const rule = repo.update(req.params.id, req.user.id, parsed.data);
      res.json({ rule });
    } catch (err) { next(err); }
  });

  // DELETE /api/tag-rules/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = repo.findById(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tag rule not found' } });
      }
      repo.remove(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
