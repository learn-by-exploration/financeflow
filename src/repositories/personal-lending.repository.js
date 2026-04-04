// src/repositories/personal-lending.repository.js
module.exports = function createPersonalLendingRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0, type, is_settled, priority } = options;
    let sql = 'SELECT * FROM personal_lending WHERE user_id = ?';
    const params = [userId];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (is_settled !== undefined) { sql += ' AND is_settled = ?'; params.push(Number(is_settled)); }
    if (priority) { sql += ' AND priority = ?'; params.push(priority); }
    sql += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    const { type, is_settled, priority } = options;
    let sql = 'SELECT COUNT(*) as count FROM personal_lending WHERE user_id = ?';
    const params = [userId];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (is_settled !== undefined) { sql += ' AND is_settled = ?'; params.push(Number(is_settled)); }
    if (priority) { sql += ' AND priority = ?'; params.push(priority); }
    return db.prepare(sql).get(...params).count;
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM personal_lending WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { person_name, type, amount, outstanding, interest_rate, currency, start_date, expected_end_date, purpose, mode, priority, notes } = data;
    const result = db.prepare(
      'INSERT INTO personal_lending (user_id, person_name, type, amount, outstanding, interest_rate, currency, start_date, expected_end_date, purpose, mode, priority, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, person_name, type, amount, outstanding !== undefined ? outstanding : amount, interest_rate || 0, currency || 'INR', start_date || null, expected_end_date || null, purpose || null, mode || null, priority || 'medium', notes || null);
    return db.prepare('SELECT * FROM personal_lending WHERE id = ?').get(result.lastInsertRowid);
  }

  const UPDATE_ALLOWED = ['person_name', 'outstanding', 'interest_rate', 'expected_end_date', 'purpose', 'mode', 'priority', 'notes', 'is_settled'];

  function update(id, userId, data) {
    const sets = [];
    const vals = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && UPDATE_ALLOWED.includes(key)) { sets.push(`${key} = ?`); vals.push(val); }
    }
    if (sets.length === 0) return findById(id, userId);
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE personal_lending SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals, id, userId);
    return findById(id, userId);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM personal_lending WHERE id = ? AND user_id = ?').run(id, userId);
  }

  // Payments
  function findPayments(lendingId) {
    return db.prepare('SELECT * FROM lending_payments WHERE lending_id = ? ORDER BY date DESC').all(lendingId);
  }

  function addPayment(lendingId, userId, data) {
    const lending = findById(lendingId, userId);
    if (!lending) return null;
    const { amount, date, notes } = data;
    const result = db.prepare('INSERT INTO lending_payments (lending_id, amount, date, notes) VALUES (?, ?, ?, ?)').run(lendingId, amount, date, notes || null);
    // Update outstanding
    const newOutstanding = Math.max(0, lending.outstanding - amount);
    db.prepare("UPDATE personal_lending SET outstanding = ?, is_settled = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newOutstanding, newOutstanding === 0 ? 1 : 0, lendingId);
    return db.prepare('SELECT * FROM lending_payments WHERE id = ?').get(result.lastInsertRowid);
  }

  function summary(userId) {
    const totalLent = db.prepare('SELECT COALESCE(SUM(outstanding), 0) as total FROM personal_lending WHERE user_id = ? AND type = ? AND is_settled = 0').get(userId, 'lent').total;
    const totalBorrowed = db.prepare('SELECT COALESCE(SUM(outstanding), 0) as total FROM personal_lending WHERE user_id = ? AND type = ? AND is_settled = 0').get(userId, 'borrowed').total;
    const activeCount = db.prepare('SELECT COUNT(*) as count FROM personal_lending WHERE user_id = ? AND is_settled = 0').get(userId).count;
    return { total_lent_outstanding: totalLent, total_borrowed_outstanding: totalBorrowed, net: totalLent - totalBorrowed, active_count: activeCount };
  }

  return { findAllByUser, countByUser, findById, create, update, delete: deleteById, findPayments, addPayment, summary };
};
