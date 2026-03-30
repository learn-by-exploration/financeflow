const express = require('express');
const router = express.Router();
const createTransactionService = require('../services/transaction.service');
const { safePatternTest } = require('../utils/safe-regex');
const { createTransactionSchema, bulkDeleteSchema, bulkCategorizeSchema, bulkTagSchema, bulkUntagSchema } = require('../schemas/transaction.schema');
const createTransactionRepository = require('../repositories/transaction.repository');
const createAccountRepository = require('../repositories/account.repository');
const createExchangeRateRepository = require('../repositories/exchange-rate.repository');
const createDuplicateRepository = require('../repositories/duplicate.repository');
const createGoalRepository = require('../repositories/goal.repository');
const { convert, buildRateMap } = require('../utils/currency-converter');
const { ValidationError, NotFoundError } = require('../errors');
const createNotificationService = require('../services/notification.service');
const createSpendingLimitRepository = require('../repositories/spending-limit.repository');
const { invalidateCache } = require('../middleware/cache');

const CACHE_PATTERNS = ['/api/reports', '/api/charts', '/api/insights', '/api/stats', '/api/net-worth'];

module.exports = function createTransactionRoutes({ db, audit }) {

  const txService = createTransactionService({ db });
  const txRepo = createTransactionRepository({ db });
  const accountRepo = createAccountRepository({ db });
  const rateRepo = createExchangeRateRepository({ db });
  const notifService = createNotificationService({ db });
  const dupRepo = createDuplicateRepository({ db });
  const goalRepo = createGoalRepository({ db });
  const spendingLimitRepo = createSpendingLimitRepository({ db });
  const notifRepo = require('../repositories/notification.repository')({ db });

  // GET /api/transactions
  router.get('/', (req, res, next) => {
    try {
      const defaultCurrency = req.user.defaultCurrency || 'INR';
      const transactions = txRepo.findAllByUser(req.user.id, req.query);

      // Attach tags to each transaction
      for (const txn of transactions) {
        txn.tags = txRepo.getTagsForTransaction(txn.id);
      }

      // Add converted_amount for transactions in non-default currency
      const hasForeign = transactions.some(t => t.currency && t.currency !== defaultCurrency);
      if (hasForeign) {
        const allRates = db.prepare('SELECT * FROM exchange_rates ORDER BY date DESC').all();
        const rateMap = buildRateMap(allRates);
        for (const txn of transactions) {
          if (txn.currency && txn.currency !== defaultCurrency) {
            const result = convert(txn.amount, txn.currency, defaultCurrency, rateMap);
            txn.converted_amount = result ? result.converted : null;
            txn.converted_currency = defaultCurrency;
          }
        }
      }

      const { limit = 50, offset = 0 } = req.query;
      const total = txRepo.countByUser(req.user.id, req.query);
      res.json({ transactions, total, limit: Number(limit), offset: Number(offset) });
    } catch (err) { next(err); }
  });

  // POST /api/transactions
  router.post('/', (req, res, next) => {
    try {
      const parsed = createTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const { account_id, category_id, type, amount, currency, description, note, date, payee, transfer_to_account_id, tag_ids, reference_id } = parsed.data;

      // Transfer handling
      if (type === 'transfer') {
        if (!transfer_to_account_id) {
          throw new ValidationError('transfer_to_account_id is required for transfers');
        }
        if (transfer_to_account_id === account_id) {
          throw new ValidationError('Cannot transfer to the same account');
        }

        const transaction = txService.createTransfer({
          userId: req.user.id, accountId: account_id, transferToAccountId: transfer_to_account_id,
          categoryId: category_id, amount, currency: currency || req.user.defaultCurrency,
          description, note, date, payee, tags: tag_ids
        });
        audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);
        invalidateCache(req.user.id, CACHE_PATTERNS);
        return res.status(201).json({ transaction });
      }

      // Auto-categorize if no category_id provided
      let resolvedCategoryId = category_id || null;
      if (!resolvedCategoryId && description) {
        const rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ? ORDER BY position ASC, id ASC').all(req.user.id);
        for (const rule of rules) {
          if (safePatternTest(rule.pattern, description)) {
            resolvedCategoryId = rule.category_id;
            break;
          }
        }
      }

      // Regular income/expense
      const transaction = txRepo.create(req.user.id, {
        account_id, category_id: resolvedCategoryId, type, amount,
        currency: currency || req.user.defaultCurrency, description, note, date, payee, tag_ids, reference_id
      });

      // Update account balance
      const balanceChange = type === 'income' ? amount : -amount;
      accountRepo.updateBalance(account_id, req.user.id, balanceChange);  // roundCurrency applied inside updateBalance

      // Link tags if provided
      if (Array.isArray(tag_ids) && tag_ids.length > 0) {
        txRepo.linkTags(transaction.id, tag_ids);
      }
      // Attach tags to response
      transaction.tags = txRepo.getTagsForTransaction(transaction.id);

      audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);

      // Auto-notification: large transaction
      try {
        const setting = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'large_transaction_threshold'").get(req.user.id);
        const threshold = setting ? Number(setting.value) : 10000;
        notifService.checkLargeTransaction(req.user.id, transaction.id, amount, threshold);
      } catch (_) { /* notification failure should not break transaction */ }

      // Spending limit alerts
      if (type === 'expense') {
        try {
          const limits = spendingLimitRepo.getLimitsForCheck(req.user.id, resolvedCategoryId);
          for (const limit of limits) {
            const spent = spendingLimitRepo.getCurrentSpending(req.user.id, limit.category_id, limit.period);
            const pct = limit.amount > 0 ? spent / limit.amount : 0;
            const catLabel = limit.category_id ? `category` : 'overall';
            if (pct >= 1) {
              notifRepo.create(req.user.id, {
                type: 'spending_exceeded',
                title: 'Spending Limit Exceeded',
                message: `You have exceeded your ${limit.period} ${catLabel} spending limit of ₹${limit.amount}. Current: ₹${Math.round(spent * 100) / 100}.`,
                link: '/spending-limits',
              });
            } else if (pct >= 0.8) {
              notifRepo.create(req.user.id, {
                type: 'spending_warning',
                title: 'Approaching Spending Limit',
                message: `You have reached ${Math.round(pct * 100)}% of your ${limit.period} ${catLabel} spending limit of ₹${limit.amount}.`,
                link: '/spending-limits',
              });
            }
          }

          // Unusual spending detection
          if (resolvedCategoryId) {
            const { avg, count } = spendingLimitRepo.getAverageSpending(req.user.id, resolvedCategoryId);
            if (count >= 3 && amount > avg * 3) {
              notifRepo.create(req.user.id, {
                type: 'unusual_spending',
                title: 'Unusual Spending Detected',
                message: `Transaction of ₹${amount} is significantly higher than your average of ₹${Math.round(avg * 100) / 100} for this category.`,
                link: `/transactions/${transaction.id}`,
              });
            }
          }
        } catch (_) { /* spending limit check failure should not break transaction */ }
      }

      // Budget threshold notifications
      if (type === 'expense' && resolvedCategoryId) {
        try {
          const now = new Date();
          const budgets = db.prepare(`
            SELECT b.id, b.name, b.start_date, b.end_date, bi.amount as allocated, bi.category_id
            FROM budgets b
            JOIN budget_items bi ON bi.budget_id = b.id
            WHERE b.user_id = ? AND bi.category_id = ? AND b.is_active = 1
            AND b.start_date <= ? AND b.end_date >= ?
          `).all(req.user.id, resolvedCategoryId, parsed.data.date || now.toISOString().slice(0, 10), parsed.data.date || now.toISOString().slice(0, 10));

          for (const budget of budgets) {
            const spent = db.prepare(`
              SELECT COALESCE(SUM(amount), 0) as total FROM transactions
              WHERE user_id = ? AND type = 'expense' AND category_id = ?
              AND date >= ? AND date <= ?
            `).get(req.user.id, budget.category_id, budget.start_date, budget.end_date).total;

            const pct = budget.allocated > 0 ? spent / budget.allocated : 0;

            if (pct >= 1) {
              // Check for duplicate notification
              const existing = db.prepare(
                "SELECT id FROM notifications WHERE user_id = ? AND type = 'budget_exceeded' AND message LIKE ? AND created_at >= ?"
              ).get(req.user.id, `%budget "${budget.name}"%category%${budget.category_id}%`, budget.start_date);
              if (!existing) {
                notifRepo.create(req.user.id, {
                  type: 'budget_exceeded',
                  title: 'Budget Exceeded',
                  message: `You have reached 100% of your budget "${budget.name}" for category ${budget.category_id}. Spent ₹${Math.round(spent * 100) / 100} of ₹${budget.allocated}.`,
                  link: `/budgets/${budget.id}`,
                });
              }
            } else if (pct >= 0.8) {
              const existing = db.prepare(
                "SELECT id FROM notifications WHERE user_id = ? AND type = 'budget_warning' AND message LIKE ? AND created_at >= ?"
              ).get(req.user.id, `%budget "${budget.name}"%category%${budget.category_id}%`, budget.start_date);
              if (!existing) {
                notifRepo.create(req.user.id, {
                  type: 'budget_warning',
                  title: 'Budget Warning',
                  message: `You have reached 80% of your budget "${budget.name}" for category ${budget.category_id}. Spent ₹${Math.round(spent * 100) / 100} of ₹${budget.allocated}.`,
                  link: `/budgets/${budget.id}`,
                });
              }
            }
          }
        } catch (_) { /* budget threshold check failure should not break transaction */ }
      }

      // Duplicate detection
      let potential_duplicate = false;
      let similar_transaction_id = null;
      try {
        const match = dupRepo.isDuplicate(req.user.id, {
          account_id, date, amount, description,
        });
        if (match && match.id !== transaction.id) {
          potential_duplicate = true;
          similar_transaction_id = match.id;
        }
      } catch (_) { /* duplicate check failure should not break transaction */ }

      // Auto-allocate to savings goals on income
      let auto_allocations = [];
      if (type === 'income') {
        try {
          const goals = goalRepo.getAutoAllocateGoals(req.user.id);
          for (const goal of goals) {
            const allocAmount = Math.round((amount * goal.auto_allocate_percent / 100) * 100) / 100;
            if (allocAmount > 0) {
              goalRepo.linkTransaction(goal.id, transaction.id, allocAmount);
              goalRepo.recalculateCurrentAmount(goal.id, req.user.id);
              auto_allocations.push({ goal_id: goal.id, goal_name: goal.name, amount: allocAmount });
            }
          }
        } catch (_) { /* auto-allocation failure should not break transaction */ }
      }

      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.status(201).json({ transaction, potential_duplicate, similar_transaction_id, auto_allocations: auto_allocations.length > 0 ? auto_allocations : undefined });
    } catch (err) { next(err); }
  });

  // POST /api/transactions/bulk-delete
  router.post('/bulk-delete', (req, res, next) => {
    try {
      const parsed = bulkDeleteSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const deleted = txRepo.bulkDelete(req.user.id, parsed.data.ids);
      audit.log(req.user.id, 'transaction.bulk-delete', 'transaction', null);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ deleted });
    } catch (err) {
      if (err.message && (err.message.includes('not found') || err.message.includes('transfer'))) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  // POST /api/transactions/bulk-categorize
  router.post('/bulk-categorize', (req, res, next) => {
    try {
      const parsed = bulkCategorizeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const updated = txRepo.bulkCategorize(req.user.id, parsed.data.ids, parsed.data.category_id);
      audit.log(req.user.id, 'transaction.bulk-categorize', 'transaction', null);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ updated });
    } catch (err) { next(err); }
  });

  // POST /api/transactions/bulk-tag
  router.post('/bulk-tag', (req, res, next) => {
    try {
      const parsed = bulkTagSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const tagged = txRepo.bulkTag(req.user.id, parsed.data.ids, parsed.data.tag_ids);
      audit.log(req.user.id, 'transaction.bulk-tag', 'transaction', null);
      res.json({ tagged });
    } catch (err) { next(err); }
  });

  // POST /api/transactions/bulk-untag
  router.post('/bulk-untag', (req, res, next) => {
    try {
      const parsed = bulkUntagSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const untagged = txRepo.bulkUntag(req.user.id, parsed.data.ids, parsed.data.tag_ids);
      audit.log(req.user.id, 'transaction.bulk-untag', 'transaction', null);
      res.json({ untagged });
    } catch (err) { next(err); }
  });

  // PUT /api/transactions/:id
  router.put('/:id', (req, res, next) => {
    try {
      const old = txRepo.findById(req.params.id, req.user.id);
      if (!old) throw new NotFoundError('Transaction');

      // Handle amount update with delta-based balance recalculation
      txService.applyAmountDelta(old, req.body.amount);

      const transaction = txRepo.update(req.params.id, req.user.id, req.body);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ transaction });
    } catch (err) { next(err); }
  });

  // DELETE /api/transactions/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const tx = txRepo.findById(req.params.id, req.user.id);
      if (!tx) throw new NotFoundError('Transaction');

      if (tx.transfer_transaction_id) {
        txService.deleteTransfer(tx);
      } else {
        // Regular: reverse balance change
        const balanceChange = tx.type === 'income' ? -tx.amount : tx.amount;
        db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ?').run(Math.round((balanceChange + Number.EPSILON) * 100) / 100, tx.account_id);
        txRepo.delete(tx.id, req.user.id);
      }

      audit.log(req.user.id, 'transaction.delete', 'transaction', req.params.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
