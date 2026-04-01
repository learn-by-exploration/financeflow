const express = require('express');
const router = express.Router();
const { createRecurringSchema, updateRecurringSchema } = require('../schemas/recurring.schema');
const createRecurringRepository = require('../repositories/recurring.repository');

module.exports = function createRecurringRoutes({ db, audit }) {
  const recurringRepo = createRecurringRepository({ db });

  // GET /api/recurring — list user's recurring rules
  router.get('/', (req, res, next) => {
    try {
      const { limit = 50, offset = 0, frequency, is_active, type } = req.query;
      const filters = { limit, offset, frequency, is_active, type };
      const rules = recurringRepo.findAllByUser(req.user.id, filters);
      const total = recurringRepo.countByUser(req.user.id, filters);
      res.json({ rules, total, limit: Number(limit), offset: Number(offset) });
    } catch (err) { next(err); }
  });

  // POST /api/recurring — create recurring rule
  router.post('/', (req, res, next) => {
    try {
      const parsed = createRecurringSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { account_id } = parsed.data;
      const acct = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
      if (!acct) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account not found' } });
      }
      const currency = req.user.defaultCurrency || 'INR';
      const rule = recurringRepo.create(req.user.id, { ...parsed.data, currency });
      audit.log(req.user.id, 'recurring.create', 'recurring_rule', rule.id);
      res.status(201).json({ rule });
    } catch (err) { next(err); }
  });

  // PUT /api/recurring/:id — update recurring rule
  router.put('/:id', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });

      const parsed = updateRecurringSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });

      const rule = recurringRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'recurring.update', 'recurring_rule', rule.id);
      res.json({ rule });
    } catch (err) { next(err); }
  });

  // DELETE /api/recurring/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });
      recurringRepo.delete(existing.id, req.user.id);
      audit.log(req.user.id, 'recurring.delete', 'recurring_rule', existing.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/:id/skip — advance next_date to following occurrence
  router.post('/:id/skip', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });

      const rule = recurringRepo.advanceNextDate(req.params.id, req.user.id);
      audit.log(req.user.id, 'recurring.skip', 'recurring_rule', rule.id);
      res.json({ rule });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/:id/pause — deactivate a recurring rule
  router.post('/:id/pause', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });
      if (!existing.is_active) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Rule is already paused' } });

      const rule = recurringRepo.update(req.params.id, req.user.id, { is_active: 0 });
      audit.log(req.user.id, 'recurring.pause', 'recurring_rule', rule.id);
      res.json({ rule });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/:id/resume — reactivate a recurring rule
  router.post('/:id/resume', (req, res, next) => {
    try {
      const existing = recurringRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });
      if (existing.is_active) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Rule is already active' } });

      const rule = recurringRepo.update(req.params.id, req.user.id, { is_active: 1 });
      audit.log(req.user.id, 'recurring.resume', 'recurring_rule', rule.id);
      res.json({ rule });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/:id/execute-now — immediately create a transaction from this rule
  router.post('/:id/execute-now', (req, res, next) => {
    try {
      const rule = recurringRepo.findById(req.params.id, req.user.id);
      if (!rule) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });

      const todayStr = new Date().toISOString().slice(0, 10);

      // Create the transaction inside a DB transaction for atomicity
      const result = db.transaction(() => {
        const txResult = db.prepare(`
          INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, payee, date, is_recurring, recurring_rule_id, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '[]')
        `).run(
          req.user.id, rule.account_id, rule.category_id, rule.type, rule.amount,
          rule.currency, rule.description, rule.payee, todayStr, rule.id
        );

        // Update account balance
        const balanceChange = rule.type === 'income' ? rule.amount : -rule.amount;
        db.prepare("UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime('now') WHERE id = ? AND user_id = ?")
          .run(Math.round((balanceChange + Number.EPSILON) * 100) / 100, rule.account_id, req.user.id);

        return db.prepare('SELECT * FROM transactions WHERE id = ?').get(txResult.lastInsertRowid);
      })();

      audit.log(req.user.id, 'recurring.execute', 'recurring_rule', rule.id);
      res.status(201).json({ transaction: result });
    } catch (err) { next(err); }
  });

  return router;
};
