const express = require('express');
const router = express.Router();

module.exports = function createSettingsRoutes({ db }) {

  const ALLOWED_KEYS = ['default_currency', 'date_format', 'dashboard_layout'];

  // GET /api/settings
  router.get('/', (req, res, next) => {
    try {
      const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(req.user.id);
      const settings = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      // Apply defaults
      if (!settings.default_currency) settings.default_currency = 'INR';
      if (!settings.date_format) settings.date_format = 'YYYY-MM-DD';
      res.json({ settings });
    } catch (err) { next(err); }
  });

  // PUT /api/settings
  router.put('/', (req, res, next) => {
    try {
      const { key, value } = req.body;
      if (!key || !ALLOWED_KEYS.includes(key)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Key must be one of: ${ALLOWED_KEYS.join(', ')}` } });
      }
      db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?')
        .run(req.user.id, key, value, value);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  const DEFAULT_DASHBOARD_LAYOUT = ['net_worth', 'spending_trend', 'budget_progress', 'recent_transactions', 'upcoming_recurring', 'savings_goals'];

  // GET /api/settings/dashboard — dashboard card layout
  router.get('/dashboard', (req, res, next) => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(req.user.id, 'dashboard_layout');
      const layout = row ? JSON.parse(row.value) : DEFAULT_DASHBOARD_LAYOUT;
      res.json({ layout });
    } catch (err) { next(err); }
  });

  return router;
};
