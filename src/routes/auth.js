const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = function createAuthRoutes({ db, audit }) {
  const config = require('../config');

  // POST /api/auth/register
  router.post('/register', (req, res, next) => {
    try {
      const { username, password, email, display_name } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Username and password required' } });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } });
      }
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Username already taken' } });
      }
      const hash = bcrypt.hashSync(password, config.auth.saltRounds);

      // Atomic registration: user + categories + rules + session
      const registerTx = db.transaction(() => {
        const result = db.prepare(
          'INSERT INTO users (username, password_hash, email, display_name, default_currency) VALUES (?, ?, ?, ?, ?)'
        ).run(username, hash, email || null, display_name || username, config.defaultCurrency);
        const userId = result.lastInsertRowid;

        seedDefaultCategories(db, userId);
        seedSystemRules(db, userId);

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + config.session.maxAgeDays * 86400000).toISOString();
        db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt);

        return { userId, token };
      });

      const { userId, token } = registerTx();

      audit.log(userId, 'user.register', 'user', userId);
      res.status(201).json({ token, user: { id: userId, username, display_name: display_name || username } });
    } catch (err) { next(err); }
  });

  // POST /api/auth/login
  router.post('/login', (req, res, next) => {
    try {
      const { username, password } = req.body;
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + config.session.maxAgeDays * 86400000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

      audit.log(user.id, 'user.login', 'user', user.id);
      res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
    } catch (err) { next(err); }
  });

  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    const token = req.headers['x-session-token'];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ ok: true });
  });

  // GET /api/auth/me
  router.get('/me', (req, res) => {
    const token = req.headers['x-session-token'];
    if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    const session = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.email, u.default_currency
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);
    if (!session) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });
    res.json({ user: session });
  });

  return router;
};

function seedDefaultCategories(db, userId) {
  const categories = [
    // Income
    { name: 'Salary', icon: '💰', type: 'income' },
    { name: 'Freelance', icon: '💻', type: 'income' },
    { name: 'Investments', icon: '📈', type: 'income' },
    { name: 'Other Income', icon: '💵', type: 'income' },
    // Expense
    { name: 'Food & Dining', icon: '🍕', type: 'expense' },
    { name: 'Groceries', icon: '🛒', type: 'expense' },
    { name: 'Transport', icon: '🚗', type: 'expense' },
    { name: 'Housing', icon: '🏠', type: 'expense' },
    { name: 'Utilities', icon: '💡', type: 'expense' },
    { name: 'Entertainment', icon: '🎬', type: 'expense' },
    { name: 'Shopping', icon: '🛍️', type: 'expense' },
    { name: 'Healthcare', icon: '🏥', type: 'expense' },
    { name: 'Education', icon: '📚', type: 'expense' },
    { name: 'Subscriptions', icon: '🔄', type: 'expense' },
    { name: 'Personal Care', icon: '💇', type: 'expense' },
    { name: 'Travel', icon: '✈️', type: 'expense' },
    { name: 'Gifts & Donations', icon: '🎁', type: 'expense' },
    { name: 'Insurance', icon: '🛡️', type: 'expense' },
    { name: 'EMI & Loans', icon: '🏦', type: 'expense' },
    { name: 'Other Expense', icon: '📦', type: 'expense' },
    // Transfer
    { name: 'Transfer', icon: '🔄', type: 'transfer' },
  ];
  const insert = db.prepare('INSERT INTO categories (user_id, name, icon, type, is_system, position) VALUES (?, ?, ?, ?, 1, ?)');
  categories.forEach((c, i) => insert.run(userId, c.name, c.icon, c.type, i));
}

function seedSystemRules(db, userId) {
  const rules = [
    { pattern: 'swiggy|zomato|uber eats', categoryName: 'Food & Dining' },
    { pattern: 'uber|ola|rapido', categoryName: 'Transport' },
    { pattern: 'amazon|flipkart|myntra', categoryName: 'Shopping' },
    { pattern: 'netflix|spotify|hotstar|prime', categoryName: 'Subscriptions' },
    { pattern: 'electricity|water|gas|broadband', categoryName: 'Utilities' },
  ];
  const catLookup = db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(userId);
  const catMap = {};
  for (const c of catLookup) catMap[c.name] = c.id;

  const insert = db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, 1, ?)');
  rules.forEach((r, i) => {
    const catId = catMap[r.categoryName];
    if (catId) insert.run(userId, r.pattern, catId, i);
  });
}
