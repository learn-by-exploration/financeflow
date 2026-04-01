module.exports = function createRecurringRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0, frequency, is_active, type } = options;
    let sql = `SELECT r.*, a.name as account_name, a.icon as account_icon,
             c.name as category_name, c.icon as category_icon
      FROM recurring_rules r
      LEFT JOIN accounts a ON r.account_id = a.id
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.user_id = ?`;
    const params = [userId];
    if (frequency !== undefined) { sql += ' AND r.frequency = ?'; params.push(frequency); }
    if (is_active !== undefined) { sql += ' AND r.is_active = ?'; params.push(Number(is_active)); }
    if (type !== undefined) { sql += ' AND r.type = ?'; params.push(type); }
    sql += ' ORDER BY r.next_date ASC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    const { frequency, is_active, type } = options;
    let sql = 'SELECT COUNT(*) as count FROM recurring_rules WHERE user_id = ?';
    const params = [userId];
    if (frequency !== undefined) { sql += ' AND frequency = ?'; params.push(frequency); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(Number(is_active)); }
    if (type !== undefined) { sql += ' AND type = ?'; params.push(type); }
    return db.prepare(sql).get(...params).count;
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { account_id, category_id, type, amount, currency, description, payee, frequency, next_date, end_date } = data;
    const result = db.prepare(
      'INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, currency, description, payee, frequency, next_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(userId, account_id, category_id || null, type, amount, currency || 'INR', description, payee || null, frequency, next_date, end_date || null);
    return db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, fields) {
    const allowed = ['description', 'amount', 'frequency', 'next_date', 'end_date', 'payee', 'category_id', 'is_active', 'type', 'account_id'];
    const updates = [];
    const values = [];
    for (const f of allowed) {
      if (fields[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(fields[f]);
      }
    }
    if (updates.length === 0) {
      return db.prepare('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?').get(id, userId);
    }
    updates.push("updated_at = datetime('now')");
    values.push(id, userId);
    db.prepare(`UPDATE recurring_rules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    return db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM recurring_rules WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function advanceNextDate(id, userId) {
    const rule = db.prepare('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?').get(id, userId);
    if (!rule) return undefined;
    const nextDate = advanceDate(rule.next_date, rule.frequency);
    db.prepare('UPDATE recurring_rules SET next_date = ? WHERE id = ?').run(nextDate, id);
    return db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(id);
  }

  return { findAllByUser, findById, create, update, delete: deleteById, advanceNextDate, countByUser };
};

function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr + 'T00:00:00Z');
  switch (frequency) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}
