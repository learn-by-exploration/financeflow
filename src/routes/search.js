const express = require('express');
const router = express.Router();

module.exports = function createSearchRoutes({ db }) {
  const MAX_RESULTS = 10;

  // GET /api/search?q=...
  router.get('/', (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Search query is required' } });
      }
      const like = `%${q}%`;
      const userId = req.user.id;

      const transactions = db.prepare(
        `SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.user_id = ? AND (t.description LIKE ? OR t.payee LIKE ? OR t.note LIKE ?)
         ORDER BY t.date DESC LIMIT ?`
      ).all(userId, like, like, like, MAX_RESULTS);

      const accounts = db.prepare(
        'SELECT * FROM accounts WHERE user_id = ? AND name LIKE ? LIMIT ?'
      ).all(userId, like, MAX_RESULTS);

      const categories = db.prepare(
        'SELECT * FROM categories WHERE user_id = ? AND name LIKE ? LIMIT ?'
      ).all(userId, like, MAX_RESULTS);

      const subscriptions = db.prepare(
        'SELECT * FROM subscriptions WHERE user_id = ? AND (name LIKE ? OR provider LIKE ?) LIMIT ?'
      ).all(userId, like, like, MAX_RESULTS);

      res.json({ transactions, accounts, categories, subscriptions });
    } catch (err) { next(err); }
  });

  return router;
};
