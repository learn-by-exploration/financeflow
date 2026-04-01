const express = require('express');
const router = express.Router();
const { convert, buildRateMap } = require('../utils/currency-converter');

module.exports = function createNetWorthRoutes({ db, audit }) {

  // GET /api/net-worth — current net worth calculated from accounts
  router.get('/', (req, res, next) => {
    try {
      const userId = req.user.id;
      const defaultCurrency = req.user.defaultCurrency || 'INR';
      const accounts = db.prepare(
        'SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 AND include_in_net_worth = 1'
      ).all(userId);

      // Gather all latest exchange rates for conversion
      const allRates = db.prepare('SELECT * FROM exchange_rates ORDER BY date DESC').all();
      const rateMap = buildRateMap(allRates);

      let totalAssets = 0;
      let totalLiabilities = 0;
      const unconvertible = [];

      for (const a of accounts) {
        const balance = a.balance;
        let convertedBalance = balance;

        if (a.currency !== defaultCurrency) {
          const result = convert(Math.abs(balance), a.currency, defaultCurrency, rateMap);
          if (result) {
            convertedBalance = balance >= 0 ? result.converted : -result.converted;
          } else {
            unconvertible.push({ id: a.id, name: a.name, currency: a.currency });
            convertedBalance = 0; // Exclude unconvertible accounts from totals
          }
        }

        if (a.type === 'credit_card' || a.type === 'loan') {
          totalLiabilities += Math.abs(convertedBalance);
        } else {
          totalAssets += convertedBalance;
        }
      }

      const response = {
        net_worth: totalAssets - totalLiabilities,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        currency: defaultCurrency,
        accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: a.balance, currency: a.currency, icon: a.icon })),
      };
      if (unconvertible.length > 0) {
        response.unconvertible = unconvertible;
      }
      res.json(response);
    } catch (err) { next(err); }
  });

  // GET /api/net-worth/history — historical snapshots
  router.get('/history', (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit || '365', 10);
      const snapshots = db.prepare(
        'SELECT date, total_assets, total_liabilities, net_worth FROM net_worth_snapshots WHERE user_id = ? ORDER BY date ASC LIMIT ?'
      ).all(req.user.id, limit);
      res.json({ snapshots });
    } catch (err) { next(err); }
  });

  // POST /api/net-worth/snapshot — manually take snapshot
  router.post('/snapshot', (req, res, next) => {
    try {
      const userId = req.user.id;
      const today = new Date().toISOString().slice(0, 10);

      const accounts = db.prepare(
        'SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 AND include_in_net_worth = 1'
      ).all(userId);

      let totalAssets = 0;
      let totalLiabilities = 0;
      for (const a of accounts) {
        if (a.type === 'credit_card' || a.type === 'loan') {
          totalLiabilities += Math.abs(a.balance);
        } else {
          totalAssets += a.balance;
        }
      }
      const netWorth = totalAssets - totalLiabilities;
      const breakdown = JSON.stringify(accounts.map(a => ({ id: a.id, name: a.name, balance: a.balance })));

      // Upsert: replace if same user+date
      db.prepare(
        'DELETE FROM net_worth_snapshots WHERE user_id = ? AND date = ?'
      ).run(userId, today);
      db.prepare(
        'INSERT INTO net_worth_snapshots (user_id, date, total_assets, total_liabilities, net_worth, breakdown) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userId, today, totalAssets, totalLiabilities, netWorth, breakdown);

      const snapshot = db.prepare(
        'SELECT * FROM net_worth_snapshots WHERE user_id = ? AND date = ?'
      ).get(userId, today);

      audit.log(userId, 'networth.snapshot', 'net_worth_snapshot', snapshot.id);
      res.status(201).json({ snapshot });
    } catch (err) { next(err); }
  });

  return router;
};
