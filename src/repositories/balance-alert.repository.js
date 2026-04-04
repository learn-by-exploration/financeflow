// src/repositories/balance-alert.repository.js
module.exports = function createBalanceAlertRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare(`
      SELECT ba.*, a.name as account_name, a.balance as current_balance
      FROM balance_alerts ba
      JOIN accounts a ON ba.account_id = a.id
      WHERE ba.user_id = ?
      ORDER BY ba.created_at DESC
    `).all(userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM balance_alerts WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { account_id, threshold_amount, direction, is_enabled } = data;
    const result = db.prepare(
      'INSERT INTO balance_alerts (user_id, account_id, threshold_amount, direction, is_enabled) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, account_id, threshold_amount, direction || 'below', is_enabled !== undefined ? is_enabled : 1);
    return db.prepare('SELECT * FROM balance_alerts WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const fields = [];
    const params = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && ['threshold_amount', 'direction', 'is_enabled'].includes(key)) {
        fields.push(`${key} = ?`);
        params.push(val);
      }
    }
    if (fields.length === 0) return findById(id, userId);
    fields.push("updated_at = datetime('now')");
    params.push(id, userId);
    db.prepare(`UPDATE balance_alerts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    return findById(id, userId);
  }

  function remove(id, userId) {
    return db.prepare('DELETE FROM balance_alerts WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function getEnabledAlerts() {
    return db.prepare(`
      SELECT ba.*, a.balance as current_balance, a.name as account_name
      FROM balance_alerts ba
      JOIN accounts a ON ba.account_id = a.id
      WHERE ba.is_enabled = 1
      LIMIT 1000
    `).all();
  }

  function markTriggered(id) {
    db.prepare("UPDATE balance_alerts SET last_triggered_at = datetime('now') WHERE id = ?").run(id);
  }

  return { findAllByUser, findById, create, update, remove, getEnabledAlerts, markTriggered };
};
