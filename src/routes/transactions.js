const express = require('express');
const router = express.Router();
const createTransactionService = require('../services/transaction.service');
const { safePatternTest } = require('../utils/safe-regex');
const { createTransactionSchema } = require('../schemas/transaction.schema');
const createTransactionRepository = require('../repositories/transaction.repository');
const createAccountRepository = require('../repositories/account.repository');

module.exports = function createTransactionRoutes({ db, audit }) {

  const txService = createTransactionService({ db });
  const txRepo = createTransactionRepository({ db });
  const accountRepo = createAccountRepository({ db });

  // GET /api/transactions
  router.get('/', (req, res, next) => {
    try {
      const transactions = txRepo.findAllByUser(req.user.id, req.query);

      // Attach tags to each transaction
      for (const txn of transactions) {
        txn.tags = txRepo.getTagsForTransaction(txn.id);
      }

      const total = txRepo.countByUser(req.user.id);
      res.json({ transactions, total });
    } catch (err) { next(err); }
  });

  // POST /api/transactions
  router.post('/', (req, res, next) => {
    try {
      const parsed = createTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { account_id, category_id, type, amount, currency, description, note, date, payee, transfer_to_account_id, tag_ids } = parsed.data;

      // Transfer handling
      if (type === 'transfer') {
        if (!transfer_to_account_id) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'transfer_to_account_id is required for transfers' } });
        }
        if (transfer_to_account_id === account_id) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot transfer to the same account' } });
        }

        const transaction = txService.createTransfer({
          userId: req.user.id, accountId: account_id, transferToAccountId: transfer_to_account_id,
          categoryId: category_id, amount, currency: currency || req.user.defaultCurrency,
          description, note, date, payee, tags: tag_ids
        });
        audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);
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
        currency: currency || req.user.defaultCurrency, description, note, date, payee, tag_ids
      });

      // Update account balance
      const balanceChange = type === 'income' ? amount : -amount;
      accountRepo.updateBalance(account_id, req.user.id, balanceChange);

      // Link tags if provided
      if (Array.isArray(tag_ids) && tag_ids.length > 0) {
        txRepo.linkTags(transaction.id, tag_ids);
      }
      // Attach tags to response
      transaction.tags = txRepo.getTagsForTransaction(transaction.id);

      audit.log(req.user.id, 'transaction.create', 'transaction', transaction.id);
      res.status(201).json({ transaction });
    } catch (err) { next(err); }
  });

  // PUT /api/transactions/:id
  router.put('/:id', (req, res, next) => {
    try {
      const old = txRepo.findById(req.params.id, req.user.id);
      if (!old) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });

      // Handle amount update with delta-based balance recalculation
      txService.applyAmountDelta(old, req.body.amount);

      const transaction = txRepo.update(req.params.id, req.user.id, req.body);
      res.json({ transaction });
    } catch (err) { next(err); }
  });

  // DELETE /api/transactions/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const tx = txRepo.findById(req.params.id, req.user.id);
      if (!tx) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });

      if (tx.transfer_transaction_id) {
        txService.deleteTransfer(tx);
      } else {
        // Regular: reverse balance change
        const balanceChange = tx.type === 'income' ? -tx.amount : tx.amount;
        db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = datetime(\'now\') WHERE id = ?').run(balanceChange, tx.account_id);
        txRepo.delete(tx.id, req.user.id);
      }

      audit.log(req.user.id, 'transaction.delete', 'transaction', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
