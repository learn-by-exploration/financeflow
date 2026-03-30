module.exports = function createExchangeRateRepository({ db }) {

  function findAll(options = {}) {
    const { base_currency, target_currency, limit = 100, offset = 0 } = options;
    let sql = 'SELECT * FROM exchange_rates WHERE 1=1';
    const params = [];
    if (base_currency) { sql += ' AND base_currency = ?'; params.push(base_currency); }
    if (target_currency) { sql += ' AND target_currency = ?'; params.push(target_currency); }
    sql += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function count(options = {}) {
    const { base_currency, target_currency } = options;
    let sql = 'SELECT COUNT(*) as count FROM exchange_rates WHERE 1=1';
    const params = [];
    if (base_currency) { sql += ' AND base_currency = ?'; params.push(base_currency); }
    if (target_currency) { sql += ' AND target_currency = ?'; params.push(target_currency); }
    return db.prepare(sql).get(...params).count;
  }

  function findById(id) {
    return db.prepare('SELECT * FROM exchange_rates WHERE id = ?').get(id);
  }

  function create(data) {
    const { base_currency, target_currency, rate, date } = data;
    const result = db.prepare(
      'INSERT INTO exchange_rates (base_currency, target_currency, rate, date) VALUES (?, ?, ?, ?)'
    ).run(base_currency, target_currency, rate, date);
    return db.prepare('SELECT * FROM exchange_rates WHERE id = ?').get(result.lastInsertRowid);
  }

  function deleteById(id) {
    return db.prepare('DELETE FROM exchange_rates WHERE id = ?').run(id);
  }

  function getRate(baseCurrency, targetCurrency, date) {
    // Exact match for the date
    const direct = db.prepare(
      'SELECT * FROM exchange_rates WHERE base_currency = ? AND target_currency = ? AND date = ?'
    ).get(baseCurrency, targetCurrency, date);
    if (direct) return direct;

    // Try reverse rate
    const reverse = db.prepare(
      'SELECT * FROM exchange_rates WHERE base_currency = ? AND target_currency = ? AND date = ?'
    ).get(targetCurrency, baseCurrency, date);
    if (reverse) return { ...reverse, rate: 1 / reverse.rate, base_currency: baseCurrency, target_currency: targetCurrency, _reversed: true };

    return null;
  }

  function getLatestRate(baseCurrency, targetCurrency) {
    // Direct rate — most recent date
    const direct = db.prepare(
      'SELECT * FROM exchange_rates WHERE base_currency = ? AND target_currency = ? ORDER BY date DESC LIMIT 1'
    ).get(baseCurrency, targetCurrency);
    if (direct) return direct;

    // Reverse rate
    const reverse = db.prepare(
      'SELECT * FROM exchange_rates WHERE base_currency = ? AND target_currency = ? ORDER BY date DESC LIMIT 1'
    ).get(targetCurrency, baseCurrency);
    if (reverse) return { ...reverse, rate: 1 / reverse.rate, base_currency: baseCurrency, target_currency: targetCurrency, _reversed: true };

    return null;
  }

  return { findAll, count, findById, create, delete: deleteById, getRate, getLatestRate };
};
