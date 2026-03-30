const config = require('../config');

// In-memory sliding window rate limiter per user
const userWindows = new Map();

const DEFAULT_MAX = parseInt(process.env.PER_USER_RATE_LIMIT_MAX, 10) || 100;
const DEFAULT_WINDOW_MS = parseInt(process.env.PER_USER_RATE_LIMIT_WINDOW_MS, 10) || 60000;

function createPerUserRateLimit({ max = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS, skipInTest = true } = {}) {
  return function perUserRateLimit(req, res, next) {
    // Skip if no authenticated user or in test environment
    if (!req.user || (skipInTest && config.isTest)) return next();

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = userWindows.get(userId);
    if (!timestamps) {
      timestamps = [];
      userWindows.set(userId, timestamps);
    }

    // Remove timestamps outside the window
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    const remaining = Math.max(0, max - timestamps.length);
    const resetTime = Math.ceil((now + windowMs) / 1000);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, remaining - 1)));
    res.set('X-RateLimit-Reset', String(resetTime));

    if (timestamps.length >= max) {
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' }
      });
    }

    timestamps.push(now);
    next();
  };
}

// For testing: reset all windows
createPerUserRateLimit._resetAll = function () {
  userWindows.clear();
};

// For testing: get internal map
createPerUserRateLimit._getWindows = function () {
  return userWindows;
};

module.exports = createPerUserRateLimit;
