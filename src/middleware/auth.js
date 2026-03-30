const crypto = require('crypto');
const { AppError } = require('../errors');
const createApiTokenRepository = require('../repositories/api-token.repository');

function createAuthMiddleware(db) {
  const getSession = db.prepare(`
    SELECT s.*, u.id as uid, u.username, u.display_name, u.default_currency
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `);

  const tokenRepo = createApiTokenRepository({ db });

  const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

  function _tryBearerToken(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const rawToken = authHeader.slice(7);
    if (!rawToken.startsWith('pfi_')) return null;
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return tokenRepo.findByHash(hash);
  }

  function requireAuth(req, res, next) {
    const sessionToken = req.headers['x-session-token'] || req.cookies?.session;
    if (sessionToken) {
      const session = getSession.get(sessionToken);
      if (session) {
        req.user = {
          id: session.uid,
          username: session.username,
          displayName: session.display_name,
          defaultCurrency: session.default_currency,
        };
        return next();
      }
    }

    // Try Bearer API token
    const apiToken = _tryBearerToken(req);
    if (apiToken) {
      // Enforce read-only scope: reject write methods except on /api/tokens itself
      if (apiToken.scope === 'read' && WRITE_METHODS.has(req.method)) {
        const isTokenRoute = req.baseUrl === '/api/tokens' || req.originalUrl.startsWith('/api/tokens');
        if (!isTokenRoute) {
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Read-only token cannot perform write operations' } });
        }
      }
      tokenRepo.updateLastUsed(apiToken.id);
      req.user = {
        id: apiToken.uid,
        username: apiToken.username,
        displayName: apiToken.display_name,
        defaultCurrency: apiToken.default_currency,
      };
      req.apiToken = { id: apiToken.id, scope: apiToken.scope };
      return next();
    }

    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  function optionalAuth(req, _res, next) {
    const sessionToken = req.headers['x-session-token'] || req.cookies?.session;
    if (sessionToken) {
      const session = getSession.get(sessionToken);
      if (session) {
        req.user = {
          id: session.uid,
          username: session.username,
          displayName: session.display_name,
          defaultCurrency: session.default_currency,
        };
        return next();
      }
    }

    const apiToken = _tryBearerToken(req);
    if (apiToken) {
      tokenRepo.updateLastUsed(apiToken.id);
      req.user = {
        id: apiToken.uid,
        username: apiToken.username,
        displayName: apiToken.display_name,
        defaultCurrency: apiToken.default_currency,
      };
      req.apiToken = { id: apiToken.id, scope: apiToken.scope };
    }
    next();
  }

  return { requireAuth, optionalAuth };
}

module.exports = createAuthMiddleware;
