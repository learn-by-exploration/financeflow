const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { createApiTokenSchema } = require('../schemas/api-token.schema');
const createApiTokenRepository = require('../repositories/api-token.repository');

module.exports = function createApiTokenRoutes({ db, audit }) {
  const tokenRepo = createApiTokenRepository({ db });

  // POST /api/tokens — create a new API token
  router.post('/', (req, res, next) => {
    try {
      const parsed = createApiTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { name, scope } = parsed.data;

      // Generate token: pfi_ prefix + 32 random bytes hex
      const rawToken = 'pfi_' + crypto.randomBytes(32).toString('hex');
      const token_hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const token = tokenRepo.create(req.user.id, { name, token_hash, scope });
      audit.log(req.user.id, 'api_token.create', 'api_token', token.id);

      // Return raw token only this once
      res.status(201).json({ token: { ...token, raw_token: rawToken } });
    } catch (err) { next(err); }
  });

  // GET /api/tokens — list all tokens for current user
  router.get('/', (req, res, next) => {
    try {
      const tokens = tokenRepo.findAllByUser(req.user.id);
      res.json({ tokens });
    } catch (err) { next(err); }
  });

  // DELETE /api/tokens/:id — revoke a token
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = tokenRepo.findById(req.params.id, req.user.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Token not found' } });
      }
      tokenRepo.delete(existing.id, req.user.id);
      audit.log(req.user.id, 'api_token.delete', 'api_token', existing.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
