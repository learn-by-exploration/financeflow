const crypto = require('crypto');

function createCsrfMiddleware(db) {
  return function csrf(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    const token = req.headers['x-csrf-token'];
    if (!token || !req.user) {
      return res.status(403).json({ error: { code: 'CSRF_FAILED', message: 'CSRF token required' } });
    }
    next();
  };
}

module.exports = createCsrfMiddleware;
