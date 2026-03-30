module.exports = function createApiTokenRepository({ db }) {

  function create(userId, data) {
    const { name, token_hash, scope } = data;
    const result = db.prepare(
      'INSERT INTO api_tokens (user_id, name, token_hash, scope) VALUES (?, ?, ?, ?)'
    ).run(userId, name, token_hash, scope || 'readwrite');
    return db.prepare('SELECT id, user_id, name, scope, last_used_at, created_at FROM api_tokens WHERE id = ?')
      .get(result.lastInsertRowid);
  }

  function findByHash(tokenHash) {
    return db.prepare(`
      SELECT t.*, u.id as uid, u.username, u.display_name, u.default_currency
      FROM api_tokens t JOIN users u ON t.user_id = u.id
      WHERE t.token_hash = ?
    `).get(tokenHash);
  }

  function findAllByUser(userId) {
    return db.prepare(
      'SELECT id, user_id, name, scope, last_used_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  }

  function findById(id, userId) {
    return db.prepare(
      'SELECT id, user_id, name, scope, last_used_at, created_at FROM api_tokens WHERE id = ? AND user_id = ?'
    ).get(id, userId);
  }

  function deleteToken(id, userId) {
    return db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function updateLastUsed(id) {
    db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(id);
  }

  return { create, findByHash, findAllByUser, findById, delete: deleteToken, updateLastUsed };
};
