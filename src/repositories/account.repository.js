module.exports = function createAccountRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY position').all(userId);
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

  return { findAllByUser, findById, create, update, delete: deleteById, updateBalance };
};
