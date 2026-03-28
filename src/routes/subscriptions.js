const express = require('express');
const router = express.Router();

module.exports = function createSubscriptionRoutes({ db, audit }) {

  // GET /api/subscriptions
  router.get('/', (req, res, next) => {
    try {
      const subs = db.prepare('SELECT s.*, c.name as category_name FROM subscriptions s LEFT JOIN categories c ON s.category_id = c.id WHERE s.user_id = ? ORDER BY s.is_active DESC, s.next_billing_date').all(req.user.id);
      const totalMonthly = subs.filter(s => s.is_active).reduce((sum, s) => {
        const multiplier = { weekly: 4.33, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
        return sum + s.amount * (multiplier[s.frequency] || 1);
      }, 0);
      res.json({ subscriptions: subs, total_monthly: Math.round(totalMonthly * 100) / 100 });
    } catch (err) { next(err); }
  });

  // POST /api/subscriptions
  router.post('/', (req, res, next) => {
    try {
      const { name, amount, currency, frequency, category_id, next_billing_date, provider, notes } = req.body;
      const result = db.prepare(`
        INSERT INTO subscriptions (user_id, name, amount, currency, frequency, category_id, next_billing_date, provider, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, name, amount, currency || req.user.defaultCurrency, frequency, category_id || null, next_billing_date || null, provider || null, notes || null);
      audit.log(req.user.id, 'subscription.create', 'subscription', result.lastInsertRowid);
      const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ subscription: sub });
    } catch (err) { next(err); }
  });

  // PUT /api/subscriptions/:id
  router.put('/:id', (req, res, next) => {
    try {
      const { name, amount, frequency, is_active, next_billing_date, provider, notes } = req.body;
      db.prepare(`
        UPDATE subscriptions SET name = COALESCE(?, name), amount = COALESCE(?, amount),
        frequency = COALESCE(?, frequency), is_active = COALESCE(?, is_active),
        next_billing_date = COALESCE(?, next_billing_date), provider = COALESCE(?, provider),
        notes = COALESCE(?, notes), updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(name, amount, frequency, is_active, next_billing_date, provider, notes, req.params.id, req.user.id);
      const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
      res.json({ subscription: sub });
    } catch (err) { next(err); }
  });

  // DELETE /api/subscriptions/:id
  router.delete('/:id', (req, res, next) => {
    try {
      db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
      audit.log(req.user.id, 'subscription.delete', 'subscription', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
