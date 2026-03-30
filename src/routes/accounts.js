const express = require('express');
const router = express.Router();
const { createAccountSchema } = require('../schemas/account.schema');

module.exports = function createAccountRoutes({ db, audit }) {

  // GET /api/accounts
  router.get('/', (req, res, next) => {
    try {
      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY position').all(req.user.id);
      res.json({ accounts });
    } catch (err) { next(err); }
  });

  // POST /api/accounts
  router.post('/', (req, res, next) => {
    try {
      const parsed = createAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { name, type, currency, balance, icon, color, institution, account_number_last4 } = parsed.data;
      const result = db.prepare(`
        INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, institution, account_number_last4, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM accounts WHERE user_id = ?))
      `).run(req.user.id, name, type, currency || req.user.defaultCurrency, balance || 0, icon || '🏦', color || '#6366f1', institution || null, account_number_last4 || null, req.user.id);
      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
      audit.log(req.user.id, 'account.create', 'account', account.id);
      res.status(201).json({ account });
    } catch (err) { next(err); }
  });

  // PUT /api/accounts/:id
  router.put('/:id', (req, res, next) => {
    try {
      const { name, type, currency, balance, icon, color, institution, account_number_last4, is_active, include_in_net_worth } = req.body;
      db.prepare(`
        UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), currency = COALESCE(?, currency),
        balance = COALESCE(?, balance), icon = COALESCE(?, icon), color = COALESCE(?, color),
        institution = COALESCE(?, institution), account_number_last4 = COALESCE(?, account_number_last4),
        is_active = COALESCE(?, is_active), include_in_net_worth = COALESCE(?, include_in_net_worth),
        updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(name, type, currency, balance, icon, color, institution, account_number_last4, is_active, include_in_net_worth, req.params.id, req.user.id);
      const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!account) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
      }
      res.json({ account });
    } catch (err) { next(err); }
  });

  // DELETE /api/accounts/:id
  router.delete('/:id', (req, res, next) => {
    try {
      db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
      audit.log(req.user.id, 'account.delete', 'account', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
