const crypto = require('crypto');

/**
 * ETag middleware for GET responses.
 * Generates an ETag from the response body using MD5 hash.
 * Returns 304 Not Modified if the client sends a matching If-None-Match header.
 */
function etagMiddleware() {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const bodyStr = JSON.stringify(body);
      const hash = crypto.createHash('md5').update(bodyStr).digest('hex');
      const etag = `"${hash}"`;

      res.set('ETag', etag);

      const ifNoneMatch = req.get('If-None-Match');
      if (ifNoneMatch === etag) {
        return res.status(304).end();
      }

      return originalJson(body);
    };

    next();
  };
}

module.exports = { etagMiddleware };
