const crypto = require('crypto');
const config = require('../config');

function createCsrfMiddleware() {
  return function csrfProtection(req, res, next) {
    // Read-only methods are exempt
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      ensureTokenCookie(req, res);
      return next();
    }

    // Auth endpoints exempt — login/register use password as proof
    const p = req.path;
    if (p === '/register' || p === '/login' || p === '/logout') {
      ensureTokenCookie(req, res);
      return next();
    }

    // Validate CSRF token
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = parseCsrfCookie(req.headers.cookie);

    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      return res.status(403).json({ error: { code: 'CSRF_FAILED', message: 'Invalid or missing CSRF token' } });
    }

    next();
  };
}

function ensureTokenCookie(req, res) {
  const existing = parseCsrfCookie(req.headers.cookie);
  if (!existing) {
    const token = crypto.randomBytes(32).toString('hex');
    const parts = [
      `csrf_token=${token}`,
      'SameSite=Strict',
      'Path=/',
      'Max-Age=86400'
    ];
    if (config.isProd) parts.push('Secure');
    const prev = res.getHeader('Set-Cookie');
    const cookies = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
    cookies.push(parts.join('; '));
    res.setHeader('Set-Cookie', cookies);
  }
}

function parseCsrfCookie(header) {
  if (!header) return null;
  const match = header.match(/csrf_token=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

module.exports = createCsrfMiddleware;
