module.exports = function createTransactionRepository({ db }) {

  function findAllByUser(userId, filters = {}) {
    const { account_id, category_id, type, from, to, limit = 50, offset = 0, search, tag_id, currency } = filters;
    let sql = 'SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id WHERE t.user_id = ?';
    const params = [userId];
    if (account_id) { sql += ' AND t.account_id = ?'; params.push(account_id); }
    if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
    if (type) { sql += ' AND t.type = ?'; params.push(type); }
    if (currency) { sql += ' AND t.currency = ?'; params.push(currency); }
    if (from) { sql += ' AND t.date >= ?'; params.push(from); }
    if (to) { sql += ' AND t.date <= ?'; params.push(to); }
    if (search) { sql += ' AND (t.description LIKE ? OR t.payee LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (tag_id) { sql += ' AND t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id = ?)'; params.push(tag_id); }
    sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    return db.prepare(sql).all(...params);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { account_id, category_id, type, amount, currency, description, note, date, time, payee, tag_ids, reference_id, original_amount, original_currency, exchange_rate_used, payment_mode } = data;
    const result = db.prepare(`
      INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, time, payee, tags, reference_id, original_amount, original_currency, exchange_rate_used, payment_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, account_id, category_id || null, type, amount, currency, description, note || null, date, time || null, payee || null, JSON.stringify(tag_ids || []), reference_id || null, original_amount || null, original_currency || null, exchange_rate_used || null, payment_mode || null);
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { category_id, description, note, date, time, payee, tags, amount, reference_id, payment_mode } = data;
    db.prepare(`
      UPDATE transactions SET category_id = COALESCE(?, category_id), description = COALESCE(?, description),
      note = COALESCE(?, note), date = COALESCE(?, date), time = COALESCE(?, time), payee = COALESCE(?, payee),
      tags = COALESCE(?, tags), amount = COALESCE(?, amount), reference_id = COALESCE(?, reference_id),
      payment_mode = COALESCE(?, payment_mode), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(category_id, description, note, date, time !== undefined ? time : null, payee, tags ? JSON.stringify(tags) : null, amount, reference_id !== undefined ? reference_id : null, payment_mode !== undefined ? payment_mode : null, id, userId);
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function countByUser(userId, filters = {}) {
    const { account_id, category_id, type, from, to, search, tag_id, currency } = filters;
    let sql = 'SELECT COUNT(*) as count FROM transactions t WHERE t.user_id = ?';
    const params = [userId];
    if (account_id) { sql += ' AND t.account_id = ?'; params.push(account_id); }
    if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
    if (type) { sql += ' AND t.type = ?'; params.push(type); }
    if (currency) { sql += ' AND t.currency = ?'; params.push(currency); }
    if (from) { sql += ' AND t.date >= ?'; params.push(from); }
    if (to) { sql += ' AND t.date <= ?'; params.push(to); }
    if (search) { sql += ' AND (t.description LIKE ? OR t.payee LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (tag_id) { sql += ' AND t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id = ?)'; params.push(tag_id); }
    return db.prepare(sql).get(...params).count;
  }

  function getTagsForTransaction(transactionId) {
    return db.prepare('SELECT tg.id, tg.name, tg.color FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id WHERE tt.transaction_id = ?').all(transactionId);
  }

  function linkTags(transactionId, tagIds) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');
    const doLink = db.transaction(() => {
      for (const tid of tagIds) {
        insertTag.run(transactionId, tid);
      }
    });
    doLink();
  }

  function bulkDelete(userId, ids) {
    const placeholders = ids.map(() => '?').join(',');
    const txns = db.prepare(`SELECT * FROM transactions WHERE id IN (${placeholders}) AND user_id = ?`).all(...ids, userId);

    if (txns.length !== ids.length) {
      throw new Error('Some transaction IDs were not found or do not belong to this user');
    }

    // Check for transfers
    for (const tx of txns) {
      if (tx.type === 'transfer' || tx.transfer_transaction_id) {
        throw new Error('Cannot bulk delete transfer transactions. Delete transfers individually.');
      }
    }

    const doDelete = db.transaction(() => {
      for (const tx of txns) {
        const balanceChange = tx.type === 'income' ? -tx.amount : tx.amount;
        db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(Math.round((balanceChange + Number.EPSILON) * 100) / 100, tx.account_id, userId);
        db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').run(tx.id);
        db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);
      }
      return txns.length;
    });

    return doDelete();
  }

  function bulkCategorize(userId, ids, categoryId) {
    const placeholders = ids.map(() => '?').join(',');
    const doBulk = db.transaction(() => {
      const result = db.prepare(
        `UPDATE transactions SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`
      ).run(categoryId, ...ids, userId);
      return result.changes;
    });
    return doBulk();
  }

  function bulkTag(userId, ids, tagIds) {
    const placeholders = ids.map(() => '?').join(',');
    const txns = db.prepare(`SELECT id FROM transactions WHERE id IN (${placeholders}) AND user_id = ?`).all(...ids, userId);
    const insertTag = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');

    const doBulk = db.transaction(() => {
      for (const tx of txns) {
        for (const tagId of tagIds) {
          insertTag.run(tx.id, tagId);
        }
      }
      return txns.length;
    });
    return doBulk();
  }

  function bulkUntag(userId, ids, tagIds) {
    const placeholders = ids.map(() => '?').join(',');
    const txns = db.prepare(`SELECT id FROM transactions WHERE id IN (${placeholders}) AND user_id = ?`).all(...ids, userId);
    const tagPlaceholders = tagIds.map(() => '?').join(',');

    const doBulk = db.transaction(() => {
      for (const tx of txns) {
        db.prepare(`DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id IN (${tagPlaceholders})`).run(tx.id, ...tagIds);
      }
      return txns.length;
    });
    return doBulk();
  }

  return {
    findAllByUser, findById, create, update, delete: deleteById,
    countByUser, getTagsForTransaction, linkTags,
    bulkDelete, bulkCategorize, bulkTag, bulkUntag,
  };
};
