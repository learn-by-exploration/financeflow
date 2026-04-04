const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OTPAuth = require('otpauth');
const router = express.Router();
const { registerSchema, loginSchema, passwordChangeSchema, accountDeleteSchema, totpVerifySchema, totpDisableSchema } = require('../schemas/auth.schema');

module.exports = function createAuthRoutes({ db, audit }) {
  const config = require('../config');

  // POST /api/auth/register
  router.post('/register', (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      const { username, password, email, display_name } = parsed.data;
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
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + config.session.maxAgeDays * 86400000).toISOString();
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;
        const now = new Date().toISOString();
        db.prepare('INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, tokenHash, expiresAt, ip, userAgent, now);

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
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { username, password, totp_code } = parsed.data;
      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

      // Check account lockout
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      if (user && user.locked_until && user.locked_until > nowUtc) {
        audit.log(user.id, 'user.login_failed', 'user', user.id, { username, reason: 'account_locked' }, { ip, userAgent });
        return res.status(423).json({ error: { code: 'ACCOUNT_LOCKED', message: 'Account is locked due to too many failed login attempts. Try again later.' } });
      }

      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        // Increment failed attempts
        if (user) {
          const newAttempts = (user.failed_login_attempts || 0) + 1;
          if (newAttempts >= config.auth.lockoutThreshold) {
            const lockedUntil = new Date(Date.now() + config.auth.lockoutDurationMs).toISOString().slice(0, 19).replace('T', ' ');
            db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(newAttempts, lockedUntil, user.id);
          } else {
            db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(newAttempts, user.id);
          }
        }
        audit.log(user?.id || null, 'user.login_failed', 'user', user?.id || null, { username, reason: 'invalid_credentials' }, { ip, userAgent });
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      }

      // TOTP 2FA check (before resetting lockout)
      if (user.totp_enabled) {
        if (!totp_code) {
          return res.status(403).json({ requires_2fa: true, message: 'TOTP code required' });
        }
        const totp = new OTPAuth.TOTP({
          issuer: 'PersonalFi',
          label: user.username,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(user.totp_secret),
        });
        const delta = totp.validate({ token: totp_code, window: 1 });
        if (delta === null) {
          const newAttempts = (user.failed_login_attempts || 0) + 1;
          db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(newAttempts, user.id);
          audit.log(user.id, 'user.login_failed', 'user', user.id, { username, reason: 'invalid_totp' }, { ip, userAgent });
          return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid TOTP code' } });
        }
      }

      // Successful login — reset lockout state
      db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + config.session.maxAgeDays * 86400000).toISOString();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, tokenHash, expiresAt, ip, userAgent, now);

      // New-IP login notification: check if this IP was seen in last 30 days
      if (ip) {
        const recentIp = db.prepare(
          "SELECT id FROM sessions WHERE user_id = ? AND ip_address = ? AND id != last_insert_rowid() AND created_at >= datetime('now', '-30 days') LIMIT 1"
        ).get(user.id, ip);
        if (!recentIp) {
          try {
            db.prepare(
              'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
            ).run(user.id, 'new_ip_login', 'New login location',
              `New login from IP ${ip} on ${now.slice(0, 10)}. If this wasn't you, change your password immediately.`);
          } catch { /* non-critical */ }
        }
      }

      audit.log(user.id, 'user.login', 'user', user.id, null, { ip, userAgent });
      res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
    } catch (err) { next(err); }
  });

  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    const token = req.headers['x-session-token'];
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash);
    }
    res.json({ ok: true });
  });

  // GET /api/auth/me
  router.get('/me', (req, res) => {
    const token = req.headers['x-session-token'];
    if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.email, u.default_currency
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(tokenHash);
    if (!session) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });
    res.json({ user: session });
  });

  // ─── Helper: resolve user from session token ───
  function getUserFromToken(req) {
    const token = req.headers['x-session-token'];
    if (!token) return null;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = db.prepare(`
      SELECT s.user_id, u.password_hash
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(tokenHash);
    return session || null;
  }

  // ─── TOTP 2FA ───

  // POST /api/auth/totp/setup — Generate TOTP secret
  router.post('/totp/setup', (req, res, next) => {
    try {
      const session = getUserFromToken(req);
      if (!session) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const user = db.prepare('SELECT id, username, totp_enabled FROM users WHERE id = ?').get(session.user_id);
      if (user.totp_enabled) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'TOTP is already enabled' } });
      }
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: 'PersonalFi',
        label: user.username,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });
      const uri = totp.toString();
      // Store secret temporarily (not enabled until verified)
      db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret.base32, user.id);
      res.json({ secret: secret.base32, uri });
    } catch (err) { next(err); }
  });

  // POST /api/auth/totp/verify — Verify TOTP code and enable 2FA
  router.post('/totp/verify', (req, res, next) => {
    try {
      const session = getUserFromToken(req);
      if (!session) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const user = db.prepare('SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = ?').get(session.user_id);
      if (user.totp_enabled) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'TOTP is already enabled' } });
      }
      if (!user.totp_secret) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Run TOTP setup first' } });
      }
      const { code } = req.body || {};
      const parsed = totpVerifySchema.safeParse({ code });
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const totp = new OTPAuth.TOTP({
        issuer: 'PersonalFi',
        label: user.username,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
      });
      const delta = totp.validate({ token: code, window: 1 });
      if (delta === null) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid TOTP code' } });
      }
      db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
      res.json({ ok: true, message: 'TOTP 2FA enabled' });
    } catch (err) { next(err); }
  });

  // POST /api/auth/totp/disable — Disable 2FA (requires password)
  router.post('/totp/disable', (req, res, next) => {
    try {
      const session = getUserFromToken(req);
      if (!session) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const parsed = totpDisableSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { password } = parsed.data;
      if (!bcrypt.compareSync(password, session.password_hash)) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Password is incorrect' } });
      }
      db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(session.user_id);
      res.json({ ok: true, message: 'TOTP 2FA disabled' });
    } catch (err) { next(err); }
  });

  // PUT /api/auth/password — change password (requires current password)
  router.put('/password', (req, res, next) => {
    try {
      const session = getUserFromToken(req);
      if (!session) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const parsed = passwordChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { current_password, new_password } = parsed.data;

      if (!bcrypt.compareSync(current_password, session.password_hash)) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Current password is incorrect' } });
      }

      const hash = bcrypt.hashSync(new_password, config.auth.saltRounds);

      // Atomic: update password + rotate sessions
      const changePwTx = db.transaction(() => {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, session.user_id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(session.user_id);
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + config.session.maxAgeDays * 86400000).toISOString();
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;
        const now = new Date().toISOString();
        db.prepare('INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').run(session.user_id, tokenHash, expiresAt, ip, userAgent, now);
        return token;
      });

      const newToken = changePwTx();
      audit.log(session.user_id, 'user.password_change', 'user', session.user_id);
      res.json({ ok: true, token: newToken });
    } catch (err) { next(err); }
  });

  // DELETE /api/auth/account — delete account and all data (requires password)
  router.delete('/account', (req, res, next) => {
    try {
      const session = getUserFromToken(req);
      if (!session) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const parsed = accountDeleteSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { password } = parsed.data;

      if (!bcrypt.compareSync(password, session.password_hash)) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Password is incorrect' } });
      }

      const userId = session.user_id;

      // Cascade delete — FK constraints handle child tables.
      // Explicitly delete non-cascaded tables first, then the user.
      const deleteTx = db.transaction(() => {
        // Tables without direct user FK cascade
        db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM category_rules WHERE user_id = ?').run(userId);
        // Delete user — cascades to accounts, transactions, categories, sessions,
        // settings, budgets, goals, subscriptions, recurring_rules, tags,
        // groups (via created_by), group_members (via user_id),
        // and all their FK-cascaded children
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      });

      deleteTx();
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ─── Session Management ───

  // GET /api/auth/sessions — list all active sessions for current user
  router.get('/sessions', (req, res, next) => {
    try {
      const token = req.headers['x-session-token'];
      if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const currentSession = db.prepare(
        `SELECT s.user_id, s.id as session_id FROM sessions s WHERE s.token = ? AND s.expires_at > datetime('now')`
      ).get(tokenHash);
      if (!currentSession) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });

      const sessions = db.prepare(`
        SELECT id, ip_address, user_agent, device_name, created_at, last_used_at, expires_at
        FROM sessions
        WHERE user_id = ? AND expires_at > datetime('now')
        ORDER BY last_used_at DESC
      `).all(currentSession.user_id);

      const result = sessions.map(s => ({
        ...s,
        is_current: s.id === currentSession.session_id,
      }));

      res.json({ sessions: result });
    } catch (err) { next(err); }
  });

  // DELETE /api/auth/sessions/:id — revoke a specific session
  router.delete('/sessions/:id', (req, res, next) => {
    try {
      const token = req.headers['x-session-token'];
      if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const currentSession = db.prepare(
        `SELECT s.user_id, s.id as session_id FROM sessions s WHERE s.token = ? AND s.expires_at > datetime('now')`
      ).get(tokenHash);
      if (!currentSession) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });

      const targetId = parseInt(req.params.id, 10);
      if (isNaN(targetId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid session ID' } });

      // Prevent revoking current session
      if (targetId === currentSession.session_id) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot revoke your current session' } });
      }

      // Check the target session exists and belongs to current user
      const target = db.prepare('SELECT id, user_id FROM sessions WHERE id = ?').get(targetId);
      if (!target || target.user_id !== currentSession.user_id) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }

      db.prepare('DELETE FROM sessions WHERE id = ?').run(targetId);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // GET /api/auth/security-status — security checkup widget
  router.get('/security-status', (req, res, next) => {
    try {
      const token = req.headers['x-session-token'];
      if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const currentSession = db.prepare(
        `SELECT s.user_id FROM sessions s WHERE s.token = ? AND s.expires_at > datetime('now')`
      ).get(tokenHash);
      if (!currentSession) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });

      const user = db.prepare('SELECT totp_enabled, updated_at FROM users WHERE id = ?').get(currentSession.user_id);
      const sessionCount = db.prepare(
        `SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ? AND expires_at > datetime('now')`
      ).get(currentSession.user_id).cnt;

      res.json({
        security: {
          has_2fa: !!user.totp_enabled,
          session_count: sessionCount,
          last_password_change: user.updated_at || null,
        },
      });
    } catch (err) { next(err); }
  });

  // POST /api/auth/sessions/revoke-others — revoke all sessions except current
  router.post('/sessions/revoke-others', (req, res, next) => {
    try {
      const token = req.headers['x-session-token'];
      if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const currentSession = db.prepare(
        `SELECT s.user_id, s.id as session_id FROM sessions s WHERE s.token = ? AND s.expires_at > datetime('now')`
      ).get(tokenHash);
      if (!currentSession) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } });

      const result = db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(currentSession.user_id, currentSession.session_id);
      res.json({ ok: true, revoked: result.changes });
    } catch (err) { next(err); }
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
