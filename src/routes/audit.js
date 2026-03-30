const express = require('express');
const router = express.Router();

module.exports = function createAuditRoutes({ db }) {

  // GET /api/audit — paginated audit log viewer
  router.get('/', (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = parseInt(req.query.offset) || 0;
      const { entity_type, action, from, to } = req.query;

      let where = 'WHERE user_id = ?';
      const params = [req.user.id];

      if (entity_type) {
        where += ' AND entity_type = ?';
        params.push(entity_type);
      }
      if (action) {
        where += ' AND action LIKE ?';
        params.push(action + '%');
      }
      if (from) {
        where += ' AND created_at >= ?';
        params.push(from);
      }
      if (to) {
        where += ' AND created_at <= ?';
        params.push(to + 'T23:59:59.999Z');
      }

      const total = db.prepare(`SELECT COUNT(*) as count FROM audit_log ${where}`).get(...params).count;
      const entries = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

      res.json({ entries, total, limit, offset });
    } catch (err) { next(err); }
  });

  return router;
};
