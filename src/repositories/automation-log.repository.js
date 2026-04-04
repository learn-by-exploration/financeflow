// src/repositories/automation-log.repository.js
module.exports = function createAutomationLogRepository({ db }) {

  function log(userId, automationType, description, metadata) {
    db.prepare(
      'INSERT INTO automation_log (user_id, automation_type, description, metadata) VALUES (?, ?, ?, ?)'
    ).run(userId, automationType, description, metadata ? JSON.stringify(metadata) : null);
  }

  function findByUser(userId, options = {}) {
    const { limit = 50, offset = 0, type } = options;
    let sql = 'SELECT * FROM automation_log WHERE user_id = ?';
    const params = [userId];
    if (type) {
      sql += ' AND automation_type = ?';
      params.push(type);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    let sql = 'SELECT COUNT(*) as count FROM automation_log WHERE user_id = ?';
    const params = [userId];
    if (options.type) {
      sql += ' AND automation_type = ?';
      params.push(options.type);
    }
    return db.prepare(sql).get(...params).count;
  }

  function getSummary(userId) {
    return db.prepare(`
      SELECT automation_type, COUNT(*) as count, MAX(created_at) as last_run
      FROM automation_log WHERE user_id = ?
      GROUP BY automation_type
      ORDER BY count DESC
    `).all(userId);
  }

  function cleanup(daysOld) {
    return db.prepare(
      `DELETE FROM automation_log WHERE created_at < datetime('now', '-${Math.floor(daysOld)} days')`
    ).run();
  }

  return { log, findByUser, countByUser, getSummary, cleanup };
};
