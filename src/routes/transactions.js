const express = require('express');
const router = express.Router();
const createTransactionService = require('../services/transaction.service');
const { createTransactionSchema, updateTransactionSchema, bulkDeleteSchema, bulkCategorizeSchema, bulkTagSchema, bulkUntagSchema } = require('../schemas/transaction.schema');
const createTransactionRepository = require('../repositories/transaction.repository');
const createAccountRepository = require('../repositories/account.repository');
const { convert, buildRateMap } = require('../utils/currency-converter');
const { ValidationError, NotFoundError } = require('../errors');
const { invalidateCache } = require('../middleware/cache');
const createTransactionOrchestrator = require('../services/transaction-orchestrator.service');

const CACHE_PATTERNS = ['/api/reports', '/api/charts', '/api/insights', '/api/stats', '/api/net-worth'];

module.exports = function createTransactionRoutes({ db, audit }) {

  const txService = createTransactionService({ db });
  const txRepo = createTransactionRepository({ db });
  const accountRepo = createAccountRepository({ db });
  const orchestrator = createTransactionOrchestrator({ db });

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
      const { account_id, category_id, type, amount, currency, description, note, date, payee, transfer_to_account_id, tag_ids, reference_id, exchange_rate } = parsed.data;

      // Transfer handling
      if (type === 'transfer') {
        if (!transfer_to_account_id) {
          throw new ValidationError('transfer_to_account_id is required for transfers');
        }
        if (transfer_to_account_id === account_id) {
          throw new ValidationError('Cannot transfer to the same account');
        }

        // Verify destination account belongs to user
        const destAcct = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(transfer_to_account_id, req.user.id);
        if (!destAcct) {
          throw new ValidationError('Destination account not found');
        }

        try {
          const transaction = txService.createTransfer({
            userId: req.user.id, accountId: account_id, transferToAccountId: transfer_to_account_id,
            categoryId: category_id, amount, currency: currency || req.user.defaultCurrency,
            description, note, date, payee, tags: tag_ids, exchangeRate: exchange_rate
          });
          audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);
          invalidateCache(req.user.id, CACHE_PATTERNS);
          return res.status(201).json({ transaction });
        } catch (err) {
          if (err.message && err.message.includes('No exchange rate found')) {
            throw new ValidationError(err.message);
          }
          throw err;
        }
      }

      // Determine account currency for foreign-currency conversion
      const account = db.prepare('SELECT currency FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
      const accountCurrency = account ? account.currency : (currency || req.user.defaultCurrency);
      // Default transaction currency to account currency (not user default) for UX consistency
      const txCurrency = currency || accountCurrency;

      let finalAmount = amount;
      let originalAmount = null;
      let originalCurrency = null;
      let exchangeRateUsed = null;

      if (txCurrency !== accountCurrency) {
        // Foreign currency transaction — convert to account currency
        const createExchangeRateRepository = require('../repositories/exchange-rate.repository');
        const rateRepo = createExchangeRateRepository({ db });

        if (exchange_rate) {
          exchangeRateUsed = exchange_rate;
          finalAmount = Math.round((amount * exchange_rate + Number.EPSILON) * 100) / 100;
        } else {
          const rateRecord = rateRepo.getLatestRate(txCurrency, accountCurrency);
          if (!rateRecord) {
            throw new ValidationError(`No exchange rate found for ${txCurrency} to ${accountCurrency}. Please provide an exchange_rate.`);
          }
          exchangeRateUsed = rateRecord.rate;
          finalAmount = Math.round((amount * exchangeRateUsed + Number.EPSILON) * 100) / 100;
        }
        originalAmount = amount;
        originalCurrency = txCurrency;
      }

      // Auto-categorize if no category_id provided
      const resolvedCategoryId = orchestrator.resolveCategory(req.user.id, category_id, description);

      // Regular income/expense — use converted amount in account currency
      const transaction = txRepo.create(req.user.id, {
        account_id, category_id: resolvedCategoryId, type, amount: finalAmount,
        currency: accountCurrency, description, note, date, payee, tag_ids, reference_id,
        original_amount: originalAmount, original_currency: originalCurrency, exchange_rate_used: exchangeRateUsed,
        payment_mode: parsed.data.payment_mode,
      });

      // Update account balance (in account currency)
      const balanceChange = type === 'income' ? finalAmount : -finalAmount;
      accountRepo.updateBalance(account_id, req.user.id, balanceChange);

      // Link tags if provided
      if (Array.isArray(tag_ids) && tag_ids.length > 0) {
        txRepo.linkTags(transaction.id, tag_ids);
      }
      // Attach tags to response
      transaction.tags = txRepo.getTagsForTransaction(transaction.id);

      audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);

      // Run all post-creation side effects (notifications, spending limits, budget checks, duplicate detection, goal allocation)
      const effects = orchestrator.runPostCreationEffects(req.user.id, transaction, {
        categoryId: resolvedCategoryId, type, amount: finalAmount, date: parsed.data.date, account_id, description
      });

      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.status(201).json({
        transaction,
        potential_duplicate: effects.potential_duplicate,
        similar_transaction_id: effects.similar_transaction_id,
        auto_allocations: effects.auto_allocations.length > 0 ? effects.auto_allocations : undefined,
        tip: effects.tip || undefined,
      });
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
      const parsed = updateTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message, parsed.error.issues);
      }
      const old = txRepo.findById(req.params.id, req.user.id);
      if (!old) throw new NotFoundError('Transaction');

      // Handle amount update with delta-based balance recalculation
      txService.applyAmountDelta(old, parsed.data.amount);

      const transaction = txRepo.update(req.params.id, req.user.id, parsed.data);
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
        db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(Math.round((balanceChange + Number.EPSILON) * 100) / 100, tx.account_id, req.user.id);
        txRepo.delete(tx.id, req.user.id);
      }

      audit.log(req.user.id, 'transaction.delete', 'transaction', req.params.id);
      invalidateCache(req.user.id, CACHE_PATTERNS);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
