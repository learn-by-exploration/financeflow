const crypto = require('crypto');

// In-memory cache store: key -> { data, statusCode, headers, expiresAt, tags }
const cache = new Map();

/**
 * Cache middleware for GET responses keyed by URL + userId.
 * @param {number} ttlSeconds - Time-to-live in seconds (default 60)
 * @param {string[]} tags - Entity-type tags for tag-based invalidation (e.g. ['transactions', 'accounts'])
 */
function cacheMiddleware(ttlSeconds = 60, tags = []) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const userId = req.user?.id;
    if (!userId) return next();

    const key = `${userId}:${req.originalUrl}`;
    const entry = cache.get(key);

    if (entry && entry.expiresAt > Date.now()) {
      // Check If-None-Match for conditional requests even on cache hits
      if (entry.etag) {
        const ifNoneMatch = req.get('If-None-Match');
        if (ifNoneMatch === entry.etag) {
          return res.status(304).end();
        }
        res.set('ETag', entry.etag);
      }
      res.set('X-Cache', 'HIT');
      // Restore cached content-type
      if (entry.contentType) {
        res.set('Content-Type', entry.contentType);
      }
      return res.status(entry.statusCode).send(entry.data);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (!res.statusCode || res.statusCode === 200) {
        const bodyStr = JSON.stringify(body);
        const hash = crypto.createHash('md5').update(bodyStr).digest('hex');
        const etag = `"${hash}"`;
        cache.set(key, {
          data: body,
          statusCode: res.statusCode || 200,
          contentType: 'application/json; charset=utf-8',
          etag,
          tags: tags.length > 0 ? tags : [],
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Clear cache entries for a user matching any of the given URL patterns.
 * @param {number} userId
 * @param {string[]} patterns - URL path prefixes to match (e.g. ['/api/reports', '/api/charts'])
 */
function invalidateCache(userId, patterns) {
  if (!userId || !patterns || patterns.length === 0) return;

  for (const [key] of cache) {
    const prefix = `${userId}:`;
    if (!key.startsWith(prefix)) continue;
    const url = key.slice(prefix.length);
    for (const pattern of patterns) {
      if (url.startsWith(pattern)) {
        cache.delete(key);
        break;
      }
    }
  }
}

/**
 * Clear cache entries for a user that have any of the given tags.
 * @param {number} userId
 * @param {string[]} tags - Entity-type tags to match (e.g. ['transactions', 'accounts'])
 */
function invalidateCacheByTags(userId, tags) {
  if (!userId || !tags || tags.length === 0) return;

  for (const [key, entry] of cache) {
    const prefix = `${userId}:`;
    if (!key.startsWith(prefix)) continue;
    if (entry.tags && entry.tags.some(t => tags.includes(t))) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cache entries (useful for tests).
 */
function clearAllCache() {
  cache.clear();
}

/**
 * Get the underlying cache Map (for testing).
 */
function getCacheStore() {
  return cache;
}

module.exports = { cacheMiddleware, invalidateCache, invalidateCacheByTags, clearAllCache, getCacheStore };
