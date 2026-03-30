const config = require('../config');

function createCorsMiddleware() {
  const originsRaw = config.cors.origins;
  const methods = config.cors.methods;
  const headers = config.cors.headers;
  const credentials = config.cors.credentials;

  const allowAll = originsRaw === '*';
  const allowedOrigins = allowAll ? null : originsRaw.split(',').map(s => s.trim()).filter(Boolean);

  return function corsMiddleware(req, res, next) {
    const requestOrigin = req.headers.origin;

    if (allowAll) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    } else if (requestOrigin && allowedOrigins.length > 0) {
      // Origin not allowed — still set Vary but don't set Allow-Origin
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);

    if (credentials && !allowAll) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }

    next();
  };
}

module.exports = createCorsMiddleware;
