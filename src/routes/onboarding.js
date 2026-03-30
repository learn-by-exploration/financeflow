const express = require('express');
const router = express.Router();

module.exports = function createOnboardingRoutes({ db }) {

  // GET /api/users/onboarding — check onboarding progress
  router.get('/onboarding', (req, res, next) => {
    try {
      const userId = req.user.id;

      const hasAccounts = db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE user_id = ?').get(userId).cnt > 0;
      const hasTransactions = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?').get(userId).cnt > 0;
      const hasBudgets = db.prepare('SELECT COUNT(*) as cnt FROM budgets WHERE user_id = ?').get(userId).cnt > 0;

      const user = db.prepare('SELECT onboarding_completed FROM users WHERE id = ?').get(userId);
      const dismissed = user && user.onboarding_completed === 1;

      res.json({
        steps: [
          { name: 'account', completed: hasAccounts },
          { name: 'transaction', completed: hasTransactions },
          { name: 'budget', completed: hasBudgets },
        ],
        dismissed,
      });
    } catch (err) { next(err); }
  });

  // PUT /api/users/onboarding/dismiss — dismiss onboarding
  router.put('/onboarding/dismiss', (req, res, next) => {
    try {
      const userId = req.user.id;
      db.prepare('UPDATE users SET onboarding_completed = 1 WHERE id = ?').run(userId);
      res.json({ dismissed: true });
    } catch (err) { next(err); }
  });

  return router;
};
