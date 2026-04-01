const { roundCurrency } = require('../utils/currency');
const createExchangeRateRepository = require('../repositories/exchange-rate.repository');

module.exports = function createTransactionService({ db }) {

  const rateRepo = createExchangeRateRepository({ db });

  function createTransfer({ userId, accountId, transferToAccountId, categoryId, amount, currency, description, note, date, payee, tags, exchangeRate }) {
    const doTransfer = db.transaction(() => {
      // Determine source and destination account currencies
      const srcAccount = db.prepare('SELECT currency FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
      const dstAccount = db.prepare('SELECT currency FROM accounts WHERE id = ? AND user_id = ?').get(transferToAccountId, userId);
      const srcCurrency = srcAccount ? srcAccount.currency : currency;
      const dstCurrency = dstAccount ? dstAccount.currency : currency;

      let dstAmount = amount;
      let rateUsed = null;
      let originalAmount = null;
      let originalCurrency = null;

      if (srcCurrency !== dstCurrency) {
        // Cross-currency transfer — compute converted amount
        if (exchangeRate) {
          // User-provided rate
          rateUsed = exchangeRate;
          dstAmount = roundCurrency(amount * exchangeRate);
        } else {
          // Look up exchange rate from src → dst
          const rateRecord = rateRepo.getLatestRate(srcCurrency, dstCurrency);
          if (!rateRecord) {
            throw new Error(`No exchange rate found for ${srcCurrency} to ${dstCurrency}. Please provide an exchange_rate.`);
          }
          rateUsed = rateRecord.rate;
          dstAmount = roundCurrency(amount * rateUsed);
        }
        originalAmount = amount;
        originalCurrency = srcCurrency;
      }

      // Source transaction: debit in source currency
      const srcResult = db.prepare(`
        INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags, transfer_to_account_id)
        VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, accountId, categoryId || null, amount, srcCurrency, description, note || null, date, payee || null, JSON.stringify(tags || []), transferToAccountId);

      // Destination transaction: credit in destination currency with conversion data
      const dstResult = db.prepare(`
        INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags, transfer_to_account_id, original_amount, original_currency, exchange_rate_used)
        VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, transferToAccountId, categoryId || null, dstAmount, dstCurrency, description, note || null, date, payee || null, JSON.stringify(tags || []), accountId, originalAmount, originalCurrency, rateUsed);

      db.prepare('UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?').run(dstResult.lastInsertRowid, srcResult.lastInsertRowid);
      db.prepare('UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?').run(srcResult.lastInsertRowid, dstResult.lastInsertRowid);

      // Update balances in respective currencies
      db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
        .run(roundCurrency(amount), accountId, userId);
      db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
        .run(roundCurrency(dstAmount), transferToAccountId, userId);

      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(srcResult.lastInsertRowid);
    });
    return doTransfer();
  }

  function applyAmountDelta(oldTx, newAmount) {
    if (newAmount === undefined || newAmount === oldTx.amount) return;
    const delta = newAmount - oldTx.amount;
    if (oldTx.type === 'expense') {
      db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(roundCurrency(delta), oldTx.account_id, oldTx.user_id);
    } else if (oldTx.type === 'income') {
      db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(roundCurrency(delta), oldTx.account_id, oldTx.user_id);
    }
  }

  function deleteTransfer(tx) {
    const paired = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(tx.transfer_transaction_id, tx.user_id);
    const doDelete = db.transaction(() => {
      db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(roundCurrency(tx.amount), tx.account_id, tx.user_id);
      if (paired) {
        db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(roundCurrency(paired.amount), paired.account_id, paired.user_id);
        db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(paired.id, paired.user_id);
      }
      db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(tx.id, tx.user_id);
    });
    doDelete();
  }

  return { createTransfer, applyAmountDelta, deleteTransfer };
};
