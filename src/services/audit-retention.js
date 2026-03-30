function createAuditRetention(db) {
  return {
    purgeOldLogs(retentionDays = 90) {
      if (!Number.isInteger(retentionDays) || retentionDays < 1) {
        throw new Error('retentionDays must be a positive integer');
      }
      const result = db.prepare(
        `DELETE FROM audit_log WHERE created_at < datetime('now', '-' || ? || ' days')`
      ).run(retentionDays);
      return { deleted: result.changes };
    },

    getAuditStats() {
      const buckets = db.prepare(`
        SELECT
          SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS last_24h,
          SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last_7d,
          SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS last_30d,
          SUM(CASE WHEN created_at >= datetime('now', '-90 days') THEN 1 ELSE 0 END) AS last_90d,
          COUNT(*) AS total
        FROM audit_log
      `).get();
      return buckets;
    },
  };
}

module.exports = createAuditRetention;
