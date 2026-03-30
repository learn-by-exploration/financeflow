module.exports = function createAccountRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0, type, is_active } = options;
    let sql = 'SELECT * FROM accounts WHERE user_id = ?';
    const params = [userId];
    if (type !== undefined) { sql += ' AND type = ?'; params.push(type); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(Number(is_active)); }
    sql += ' ORDER BY position LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    const { type, is_active } = options;
    let sql = 'SELECT COUNT(*) as count FROM accounts WHERE user_id = ?';
    const params = [userId];
    if (type !== undefined) { sql += ' AND type = ?'; params.push(type); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(Number(is_active)); }
    return db.prepare(sql).get(...params).count;
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { name, type, currency, balance, icon, color, institution, account_number_last4 } = data;
    const result = db.prepare(`
      INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, institution, account_number_last4, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM accounts WHERE user_id = ?))
    `).run(userId, name, type, currency, balance || 0, icon || '🏦', color || '#6366f1', institution || null, account_number_last4 || null, userId);
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { name, type, currency, balance, icon, color, institution, account_number_last4, is_active, include_in_net_worth } = data;
    db.prepare(`
      UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), currency = COALESCE(?, currency),
      balance = COALESCE(?, balance), icon = COALESCE(?, icon), color = COALESCE(?, color),
      institution = COALESCE(?, institution), account_number_last4 = COALESCE(?, account_number_last4),
      is_active = COALESCE(?, is_active), include_in_net_worth = COALESCE(?, include_in_net_worth),
      updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(name, type, currency, balance, icon, color, institution, account_number_last4, is_active, include_in_net_worth, id, userId);
    return db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function updateBalance(id, userId, delta) {
    return db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(delta, id, userId);
  }

  return { findAllByUser, findById, create, update, delete: deleteById, updateBalance, countByUser };
};
