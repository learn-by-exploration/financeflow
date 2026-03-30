const { roundCurrency } = require('../utils/currency');

module.exports = function createTransactionService({ db }) {

  function createTransfer({ userId, accountId, transferToAccountId, categoryId, amount, currency, description, note, date, payee, tags }) {
    const doTransfer = db.transaction(() => {
      const srcResult = db.prepare(`
        INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags, transfer_to_account_id)
        VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, accountId, categoryId || null, amount, currency, description, note || null, date, payee || null, JSON.stringify(tags || []), transferToAccountId);

      const dstResult = db.prepare(`
        INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags, transfer_to_account_id)
        VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, transferToAccountId, categoryId || null, amount, currency, description, note || null, date, payee || null, JSON.stringify(tags || []), accountId);

      db.prepare('UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?').run(dstResult.lastInsertRowid, srcResult.lastInsertRowid);
      db.prepare('UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?').run(srcResult.lastInsertRowid, dstResult.lastInsertRowid);

      db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
        .run(roundCurrency(amount), accountId, userId);
      db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
        .run(roundCurrency(amount), transferToAccountId, userId);

      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(srcResult.lastInsertRowid);
    });
    return doTransfer();
  }

  function applyAmountDelta(oldTx, newAmount) {
    if (newAmount === undefined || newAmount === oldTx.amount) return;
    const delta = newAmount - oldTx.amount;
    if (oldTx.type === 'expense') {
      db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2), updated_at = datetime(\'now\') WHERE id = ?').run(roundCurrency(delta), oldTx.account_id);
    } else if (oldTx.type === 'income') {
      db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ?').run(roundCurrency(delta), oldTx.account_id);
    }
  }

  function deleteTransfer(tx) {
    const paired = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx.transfer_transaction_id);
    const doDelete = db.transaction(() => {
      db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ?').run(roundCurrency(tx.amount), tx.account_id);
      if (paired) {
        db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2), updated_at = datetime(\'now\') WHERE id = ?').run(roundCurrency(paired.amount), paired.account_id);
        db.prepare('DELETE FROM transactions WHERE id = ?').run(paired.id);
      }
      db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);
    });
    doDelete();
  }

  return { createTransfer, applyAmountDelta, deleteTransfer };
};
