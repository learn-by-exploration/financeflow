const express = require('express');
const router = express.Router();
const { createRecurringSchema, VALID_FREQUENCIES } = require('../schemas/recurring.schema');

module.exports = function createRecurringRoutes({ db, audit }) {

  // GET /api/recurring — list user's recurring rules
  router.get('/', (req, res, next) => {
    try {
      const rules = db.prepare(`
        SELECT r.*, a.name as account_name, a.icon as account_icon,
               c.name as category_name, c.icon as category_icon
        FROM recurring_rules r
        LEFT JOIN accounts a ON r.account_id = a.id
        LEFT JOIN categories c ON r.category_id = c.id
        WHERE r.user_id = ?
        ORDER BY r.next_date ASC
      `).all(req.user.id);
      res.json({ rules });
    } catch (err) { next(err); }
  });

  // POST /api/recurring — create recurring rule
  router.post('/', (req, res, next) => {
    try {
      const parsed = createRecurringSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { account_id, category_id, type, amount, description, payee, frequency, next_date, end_date } = parsed.data;
      const acct = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
      if (!acct) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account not found' } });
      }
      const currency = req.user.defaultCurrency || 'INR';
      const r = db.prepare(
        'INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, currency, description, payee, frequency, next_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
      ).run(req.user.id, account_id, category_id || null, type, amount, currency, description, payee || null, frequency, next_date, end_date || null);
      const rule = db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(r.lastInsertRowid);
      audit.log(req.user.id, 'recurring.create', 'recurring_rule', rule.id);
      res.status(201).json({ rule });
    } catch (err) { next(err); }
  });

  // PUT /api/recurring/:id — update recurring rule
  router.put('/:id', (req, res, next) => {
    try {
      const rule = db.prepare('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!rule) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });

      const fields = ['description', 'amount', 'frequency', 'next_date', 'end_date', 'payee', 'category_id', 'is_active', 'type', 'account_id'];
      const updates = [];
      const values = [];
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          if (f === 'frequency' && !VALID_FREQUENCIES.includes(req.body[f])) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid frequency` } });
          }
          updates.push(`${f} = ?`);
          values.push(req.body[f]);
        }
      }
      if (updates.length === 0) {
        return res.json({ rule });
      }
      values.push(rule.id, req.user.id);
      db.prepare(`UPDATE recurring_rules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      const updated = db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(rule.id);
      audit.log(req.user.id, 'recurring.update', 'recurring_rule', rule.id);
      res.json({ rule: updated });
    } catch (err) { next(err); }
  });

  // DELETE /api/recurring/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const rule = db.prepare('SELECT id FROM recurring_rules WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!rule) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });
      db.prepare('DELETE FROM recurring_rules WHERE id = ?').run(rule.id);
      audit.log(req.user.id, 'recurring.delete', 'recurring_rule', rule.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/:id/skip — advance next_date to following occurrence
  router.post('/:id/skip', (req, res, next) => {
    try {
      const rule = db.prepare('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!rule) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } });

      const nextDate = advanceDate(rule.next_date, rule.frequency);
      db.prepare('UPDATE recurring_rules SET next_date = ? WHERE id = ?').run(nextDate, rule.id);
      const updated = db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(rule.id);
      audit.log(req.user.id, 'recurring.skip', 'recurring_rule', rule.id);
      res.json({ rule: updated });
    } catch (err) { next(err); }
  });

  return router;
};

function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr + 'T00:00:00Z');
  switch (frequency) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}
