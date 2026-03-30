module.exports = function createDuplicateRepository({ db }) {

  function findDuplicates(userId, filters = {}) {
    const { account_id } = filters;
    // Find groups of transactions with same account_id, date, amount, description
    let sql = `
      SELECT t1.id AS id1, t2.id AS id2,
             t1.amount, t1.date, t1.description, t1.account_id,
             a.name AS account_name
      FROM transactions t1
      JOIN transactions t2 ON t1.id < t2.id
        AND t1.account_id = t2.account_id
        AND t1.date = t2.date
        AND t1.amount = t2.amount
        AND t1.description = t2.description
      LEFT JOIN accounts a ON t1.account_id = a.id
      WHERE t1.user_id = ? AND t2.user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM duplicate_dismissals dd
          WHERE dd.user_id = ?
            AND ((dd.transaction_id_1 = t1.id AND dd.transaction_id_2 = t2.id)
              OR (dd.transaction_id_1 = t2.id AND dd.transaction_id_2 = t1.id))
        )
    `;
    const params = [userId, userId, userId];
    if (account_id) {
      sql += ' AND t1.account_id = ?';
      params.push(account_id);
    }
    sql += ' ORDER BY t1.date DESC, t1.id DESC';
    return db.prepare(sql).all(...params);
  }

  function isDuplicate(userId, data) {
    const { account_id, date, amount, description } = data;
    const match = db.prepare(`
      SELECT id FROM transactions
      WHERE user_id = ? AND account_id = ? AND date = ? AND amount = ? AND description = ?
      LIMIT 1
    `).get(userId, account_id, date, amount, description);
    return match || null;
  }

  function dismiss(userId, transactionId1, transactionId2) {
    // Always store with smaller id first for consistency
    const id1 = Math.min(transactionId1, transactionId2);
    const id2 = Math.max(transactionId1, transactionId2);
    const result = db.prepare(`
      INSERT OR IGNORE INTO duplicate_dismissals (user_id, transaction_id_1, transaction_id_2)
      VALUES (?, ?, ?)
    `).run(userId, id1, id2);
    return { dismissed: result.changes > 0 };
  }

  function getDismissals(userId) {
    return db.prepare(
      'SELECT * FROM duplicate_dismissals WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  }

  return { findDuplicates, isDuplicate, dismiss, getDismissals };
};
