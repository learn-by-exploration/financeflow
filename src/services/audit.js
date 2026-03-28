function createAuditLogger(db) {
  const insert = db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)');

  return {
    log(userId, action, entityType, entityId, details) {
      try {
        insert.run(userId, action, entityType || null, entityId || null, JSON.stringify(details || {}));
      } catch { /* audit should never crash the app */ }
    },
    purge(daysOld = 90) {
      try {
        db.prepare(`DELETE FROM audit_log WHERE created_at < datetime('now', '-' || ? || ' days')`).run(daysOld);
      } catch { /* silent */ }
    },
  };
}

module.exports = createAuditLogger;
