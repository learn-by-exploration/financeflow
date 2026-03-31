module.exports = function createAttachmentRepository({ db }) {

  function create(data) {
    const { transaction_id, user_id, filename, original_name, mime_type, size, file_path } = data;
    const result = db.prepare(`
      INSERT INTO attachments (transaction_id, user_id, filename, original_name, mime_type, size, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transaction_id, user_id, filename, original_name, mime_type, size, file_path);
    return db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid);
  }

  function findById(id, userId) {
    if (userId !== undefined) {
      return db.prepare('SELECT * FROM attachments WHERE id = ? AND user_id = ?').get(id, userId);
    }
    return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  }

  function findByTransaction(transactionId, userId) {
    return db.prepare(
      'SELECT * FROM attachments WHERE transaction_id = ? AND user_id = ? ORDER BY created_at DESC'
    ).all(transactionId, userId);
  }

  function deleteById(id, userId) {
    if (userId !== undefined) {
      return db.prepare('DELETE FROM attachments WHERE id = ? AND user_id = ?').run(id, userId);
    }
    return db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  }

  function countByTransaction(transactionId) {
    return db.prepare('SELECT COUNT(*) as count FROM attachments WHERE transaction_id = ?').get(transactionId).count;
  }

  return { create, findById, findByTransaction, deleteById, countByTransaction };
};
