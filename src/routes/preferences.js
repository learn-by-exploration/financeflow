const express = require('express');
const router = express.Router();
const { preferencesSchema, PREFERENCE_KEYS, PREFERENCE_DEFAULTS } = require('../schemas/preferences.schema');

module.exports = function createPreferencesRoutes({ db }) {

  // GET /api/preferences
  router.get('/', (req, res, next) => {
    try {
      const rows = db.prepare(
        'SELECT key, value FROM settings WHERE user_id = ? AND key IN (' +
        PREFERENCE_KEYS.map(() => '?').join(',') + ')'
      ).all(req.user.id, ...PREFERENCE_KEYS);

      const preferences = { ...PREFERENCE_DEFAULTS };
      for (const row of rows) {
        preferences[row.key] = (row.key === 'items_per_page' || row.key === 'financial_year_start') ? Number(row.value) : row.value;
      }
      res.json({ preferences });
    } catch (err) { next(err); }
  });

  // PUT /api/preferences
  router.put('/', (req, res, next) => {
    try {
      const parsed = preferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message }
        });
      }

      const upsert = db.prepare(
        'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?'
      );

      const updates = db.transaction(() => {
        for (const [key, value] of Object.entries(parsed.data)) {
          if (value !== undefined) {
            const strValue = String(value);
            upsert.run(req.user.id, key, strValue, strValue);
          }
        }
      });
      updates();

      // Return updated preferences
      const rows = db.prepare(
        'SELECT key, value FROM settings WHERE user_id = ? AND key IN (' +
        PREFERENCE_KEYS.map(() => '?').join(',') + ')'
      ).all(req.user.id, ...PREFERENCE_KEYS);

      const preferences = { ...PREFERENCE_DEFAULTS };
      for (const row of rows) {
        preferences[row.key] = (row.key === 'items_per_page' || row.key === 'financial_year_start') ? Number(row.value) : row.value;
      }
      res.json({ preferences });
    } catch (err) { next(err); }
  });

  return router;
};
