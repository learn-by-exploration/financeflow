const logger = require('../logger');

function createAuditLogger(db) {
  const insert = db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)');

  return {
    log(userId, action, entityType, entityId, details, meta) {
      try {
        const { ip, userAgent } = meta || {};
        insert.run(userId, action, entityType || null, entityId || null, JSON.stringify(details || {}), ip || null, userAgent || null);
      } catch (_e) { logger.warn({ err: _e, userId, action }, 'Audit log write failed'); }
    },
    purge(daysOld = 90) {
      if (!Number.isInteger(daysOld) || daysOld < 1) return;
      try {
        db.prepare(`DELETE FROM audit_log WHERE created_at < datetime('now', '-' || ? || ' days')`).run(daysOld);
      } catch (_e) { logger.warn({ err: _e, daysOld }, 'Audit purge failed'); }
    },
  };
}

module.exports = createAuditLogger;
