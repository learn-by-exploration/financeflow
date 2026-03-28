const { AppError } = require('../errors');

function createAuthMiddleware(db) {
  const getSession = db.prepare(`
    SELECT s.*, u.id as uid, u.username, u.display_name, u.default_currency
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `);

  function requireAuth(req, res, next) {
    const token = req.headers['x-session-token'] || req.cookies?.session;
    if (!token) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const session = getSession.get(token);
    if (!session) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' } });
    }
    req.user = {
      id: session.uid,
      username: session.username,
      displayName: session.display_name,
      defaultCurrency: session.default_currency,
    };
    next();
  }

  function optionalAuth(req, _res, next) {
    const token = req.headers['x-session-token'] || req.cookies?.session;
    if (token) {
      const session = getSession.get(token);
      if (session) {
        req.user = {
          id: session.uid,
          username: session.username,
          displayName: session.display_name,
          defaultCurrency: session.default_currency,
        };
      }
    }
    next();
  }

  return { requireAuth, optionalAuth };
}

module.exports = createAuthMiddleware;
