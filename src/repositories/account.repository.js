const { roundCurrency } = require('../utils/currency');

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

  const ENRICHMENT_COLS = ['interest_rate', 'credit_limit', 'loan_amount', 'tenure_months', 'emi_amount', 'emi_day', 'start_date', 'maturity_date', 'closure_amount', 'repayment_account_id', 'priority', 'account_notes', 'expected_return', 'investment_type'];

  function create(userId, data) {
    const { name, type, currency, balance, icon, color, institution, account_number_last4 } = data;
    const result = db.prepare(`
      INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, institution, account_number_last4, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM accounts WHERE user_id = ?))
    `).run(userId, name, type, currency, balance || 0, icon || '🏦', color || '#6366f1', institution || null, account_number_last4 || null, userId);
    const id = result.lastInsertRowid;
    // Apply enrichment fields if provided
    const sets = [];
    const vals = [];
    for (const col of ENRICHMENT_COLS) {
      if (data[col] !== undefined) { sets.push(`${col} = ?`); vals.push(data[col]); }
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE accounts SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
    }
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  }

  function update(id, userId, data) {
    const { name, type, currency, balance, icon, color, institution, account_number_last4, is_active, include_in_net_worth } = data;
    const sets = ['name = COALESCE(?, name)', 'type = COALESCE(?, type)', 'currency = COALESCE(?, currency)',
      'balance = COALESCE(?, balance)', 'icon = COALESCE(?, icon)', 'color = COALESCE(?, color)',
      'institution = COALESCE(?, institution)', 'account_number_last4 = COALESCE(?, account_number_last4)',
      'is_active = COALESCE(?, is_active)', 'include_in_net_worth = COALESCE(?, include_in_net_worth)'];
    const vals = [name, type, currency, balance, icon, color, institution, account_number_last4, is_active, include_in_net_worth];
    // Enrichment fields — use explicit null set (not COALESCE) so they can be cleared
    for (const col of ENRICHMENT_COLS) {
      if (data[col] !== undefined) { sets.push(`${col} = ?`); vals.push(data[col]); }
    }
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals, id, userId);
    return db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function updateBalance(id, userId, delta) {
    return db.prepare("UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(roundCurrency(delta), id, userId);
  }

  function archive(id, userId) {
    return db.prepare("UPDATE accounts SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(id, userId);
  }

  function reconcileTransactions(userId, accountId, transactionIds, reconciledAt) {
    const stmt = db.prepare('UPDATE transactions SET reconciled_at = ? WHERE id = ? AND user_id = ? AND account_id = ?');
    const reconcileAll = db.transaction(() => {
      for (const txId of transactionIds) {
        stmt.run(reconciledAt, txId, userId, Number(accountId));
      }
    });
    reconcileAll();
    return transactionIds.length;
  }

  function getReconciledTotal(userId, accountId) {
    return db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END), 0) as total
      FROM transactions WHERE user_id = ? AND account_id = ? AND reconciled_at IS NOT NULL
    `).get(userId, Number(accountId)).total;
  }

  function findTransactions(userId, accountId, { limit = 50, offset = 0 } = {}) {
    const total = db.prepare(
      'SELECT COUNT(*) as count FROM transactions WHERE account_id = ? AND user_id = ?'
    ).get(accountId, userId).count;

    const transactions = db.prepare(`
      SELECT *, running_balance FROM (
        SELECT t.*,
          SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END)
            OVER (ORDER BY t.date ASC, t.id ASC) as running_balance
        FROM transactions t
        WHERE t.account_id = ? AND t.user_id = ?
      ) sub
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(accountId, userId, limit, offset);

    for (const tx of transactions) {
      tx.running_balance = Math.round(tx.running_balance * 100) / 100;
    }

    return { transactions, total };
  }

  return { findAllByUser, findById, create, update, delete: deleteById, updateBalance, countByUser, archive, reconcileTransactions, getReconciledTotal, findTransactions };
};
