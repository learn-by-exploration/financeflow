module.exports = function createSubscriptionRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare('SELECT s.*, c.name as category_name FROM subscriptions s LEFT JOIN categories c ON s.category_id = c.id WHERE s.user_id = ? ORDER BY s.is_active DESC, s.next_billing_date').all(userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { name, amount, currency, frequency, category_id, next_billing_date, provider, notes } = data;
    const result = db.prepare(`
      INSERT INTO subscriptions (user_id, name, amount, currency, frequency, category_id, next_billing_date, provider, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name, amount, currency || 'INR', frequency, category_id || null, next_billing_date || null, provider || null, notes || null);
    return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const { name, amount, frequency, is_active, next_billing_date, provider, notes } = data;
    db.prepare(`
      UPDATE subscriptions SET name = COALESCE(?, name), amount = COALESCE(?, amount),
      frequency = COALESCE(?, frequency), is_active = COALESCE(?, is_active),
      next_billing_date = COALESCE(?, next_billing_date), provider = COALESCE(?, provider),
      notes = COALESCE(?, notes), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(name, amount, frequency, is_active, next_billing_date, provider, notes, id, userId);
    return db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(id, userId);
  }

  return { findAllByUser, findById, create, update, delete: deleteById };
};
