const express = require('express');
const crypto = require('crypto');
const router = express.Router();

function isDemoMode() {
  return process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';
}

module.exports = function createDemoRoutes({ db, audit }) {
  const seedDemoData = require('../db/seed');

  // GET /api/demo/session — returns auth token for demo user
  router.get('/session', (req, res, next) => {
    try {
      if (!isDemoMode()) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Demo mode is not enabled' } });
      }

      const user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
      if (!user) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Demo user not found. Run seed first.' } });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, tokenHash, expiresAt);

      res.json({ token, user: { id: user.id, username: 'demo', display_name: 'Demo User' } });
    } catch (err) { next(err); }
  });

  // POST /api/demo/reset — resets demo data to seed state
  router.post('/reset', (req, res, next) => {
    try {
      if (!isDemoMode()) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Demo mode is not enabled' } });
      }

      db.transaction(() => {
        seedDemoData(db);
      })();

      audit.log(0, 'demo.reset', 'system', null);
      res.json({ ok: true, message: 'Demo data reset successfully' });
    } catch (err) { next(err); }
  });

  // GET /api/demo/status — check if demo mode is active
  router.get('/status', (_req, res) => {
    res.json({ demoMode: isDemoMode() });
  });

  return router;
};
