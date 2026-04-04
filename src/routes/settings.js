const express = require('express');
const router = express.Router();

module.exports = function createSettingsRoutes({ db, audit }) {

  const ALLOWED_KEYS = [
    // Core
    'default_currency', 'date_format', 'dashboard_layout', 'monthly_income', 'budget_methodology', 'fiscal_year_start', 'inactivity_nudge_days',
    // Financial ratio thresholds
    'max_needs_ratio', 'max_emi_ratio', 'min_savings_ratio', 'min_investment_ratio', 'max_wants_ratio',
    'emergency_fund_months_target', 'saving_fund_months_target', 'sip_months_target',
    // Alert thresholds
    'large_transaction_threshold', 'unusual_spending_multiplier',
    // Notification preferences (per-type on/off)
    'notify_budget_overspend', 'notify_goal_completed', 'notify_bill_upcoming', 'notify_large_transaction',
    'notify_spending_warning', 'notify_unusual_spending', 'notify_inactivity_nudge', 'notify_monthly_digest',
    'notify_milestone', 'notify_new_ip_login', 'notify_financial_tip', 'notify_split_reminder',
    // AI planner settings
    'ai_provider', 'ai_endpoint', 'ai_model', 'ai_api_key',
  ];

  // GET /api/settings
  router.get('/', (req, res, next) => {
    try {
      const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(req.user.id);
      const settings = {};
      for (const row of rows) {
        // Mask sensitive keys — never return raw API keys
        if (row.key === 'ai_api_key' && row.value) {
          settings[row.key] = row.value.length > 8 ? row.value.slice(0, 4) + '••••' + row.value.slice(-4) : '••••••••';
        } else {
          settings[row.key] = row.value;
        }
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
      if (value === undefined || value === null || (typeof value === 'string' && !value.trim()) || typeof value !== 'string' || value.length > 1000) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Value must be a non-empty string (max 1000 chars)' } });
      }
      db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?')
        .run(req.user.id, key, value, value);
      audit.log(req.user.id, 'setting.update', 'setting', key);
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
