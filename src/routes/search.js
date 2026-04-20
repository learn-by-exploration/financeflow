const express = require('express');
const router = express.Router();
const { searchQuerySchema } = require('../schemas/search.schema');

module.exports = function createSearchRoutes({ db }) {
  const MAX_RESULTS = 10;

  // GET /api/search?q=...
  router.get('/', (req, res, next) => {
    try {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const q = parsed.data.q.trim();
      if (!q) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Search query is required' } });
      }
      const userId = req.user.id;

      // Sanitize search term for FTS5: remove special operators, hyphens (column filter), and wrap in quotes
      // eslint-disable-next-line no-control-regex
      const sanitized = q.replace(/["*{}():\x00-]/g, ' ').replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ').trim();
      const like = `%${q}%`;

      let transactions;
      if (sanitized) {
        // Use prefix matching so "UniqueSearch" matches "UniqueSearchTransaction"
        const ftsQuery = sanitized.split(/\s+/).filter(Boolean).map(w => w + '*').join(' ');
        // FTS5 for description/payee/note, plus LIKE fallback for reference_id
        transactions = db.prepare(
          `SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id
           LEFT JOIN accounts a ON t.account_id = a.id
           WHERE t.user_id = ? AND (
             t.id IN (SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ?)
             OR t.reference_id LIKE ?
           )
           ORDER BY t.date DESC LIMIT ?`
        ).all(userId, ftsQuery, like, MAX_RESULTS);
      } else {
        // Fallback to LIKE if sanitization removed everything
        transactions = db.prepare(
          `SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id
           LEFT JOIN accounts a ON t.account_id = a.id
           WHERE t.user_id = ? AND (t.description LIKE ? OR t.payee LIKE ? OR t.note LIKE ? OR t.reference_id LIKE ?)
           ORDER BY t.date DESC LIMIT ?`
        ).all(userId, like, like, like, like, MAX_RESULTS);
      }

      const accounts = db.prepare(
        'SELECT * FROM accounts WHERE user_id = ? AND name LIKE ? LIMIT ?'
      ).all(userId, like, MAX_RESULTS);

      const categories = db.prepare(
        'SELECT * FROM categories WHERE user_id = ? AND name LIKE ? LIMIT ?'
      ).all(userId, like, MAX_RESULTS);

      const subscriptions = db.prepare(
        'SELECT * FROM subscriptions WHERE user_id = ? AND (name LIKE ? OR provider LIKE ?) LIMIT ?'
      ).all(userId, like, like, MAX_RESULTS);

      const tags = db.prepare(
        'SELECT * FROM tags WHERE user_id = ? AND name LIKE ? LIMIT ?'
      ).all(userId, like, MAX_RESULTS);

      res.json({ transactions, accounts, categories, subscriptions, tags });
    } catch (err) { next(err); }
  });

  return router;
};
