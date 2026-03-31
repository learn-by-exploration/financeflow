const express = require('express');
const router = express.Router();
const { detectRecurringPatterns, computePatternHash } = require('../services/recurring-detector');
const createRecurringRepository = require('../repositories/recurring.repository');

module.exports = function createRecurringSuggestionRoutes({ db, audit }) {
  const recurringRepo = createRecurringRepository({ db });

  // GET /api/recurring/suggestions — detect recurring patterns
  router.get('/', (req, res, next) => {
    try {
      const userId = req.user.id;

      // Fetch all user transactions
      const transactions = db.prepare(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 5000'
      ).all(userId);

      // Fetch dismissed pattern hashes
      const dismissals = db.prepare(
        'SELECT pattern_hash FROM recurring_suggestion_dismissals WHERE user_id = ?'
      ).all(userId);
      const dismissedHashes = dismissals.map(d => d.pattern_hash);

      const suggestions = detectRecurringPatterns(transactions, dismissedHashes);

      res.json({ suggestions });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/suggestions/accept — create rule from a detected pattern
  router.post('/accept', (req, res, next) => {
    try {
      const userId = req.user.id;
      const { pattern_hash, description, amount, account_id, frequency, type, next_date } = req.body;

      if (!pattern_hash || !description || !amount || !account_id || !frequency || !type || !next_date) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } });
      }

      // Validate type and frequency
      const VALID_TYPES = ['income', 'expense'];
      const VALID_FREQS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
      if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid type' } });
      if (!VALID_FREQS.includes(frequency)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid frequency' } });
      if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Amount must be positive' } });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next_date)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'next_date must be YYYY-MM-DD' } });

      // Verify account belongs to user
      const acct = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(account_id, userId);
      if (!acct) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account not found' } });
      }

      const currency = req.user.defaultCurrency || 'INR';
      const rule = recurringRepo.create(userId, {
        account_id,
        type,
        amount,
        currency,
        description,
        frequency,
        next_date,
      });

      audit.log(userId, 'recurring.create_from_suggestion', 'recurring_rule', rule.id);

      res.status(201).json({ rule });
    } catch (err) { next(err); }
  });

  // POST /api/recurring/suggestions/dismiss — dismiss a detected pattern
  router.post('/dismiss', (req, res, next) => {
    try {
      const userId = req.user.id;
      const { pattern_hash } = req.body;

      if (!pattern_hash) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pattern_hash is required' } });
      }

      db.prepare(
        'INSERT OR IGNORE INTO recurring_suggestion_dismissals (user_id, pattern_hash) VALUES (?, ?)'
      ).run(userId, pattern_hash);

      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
