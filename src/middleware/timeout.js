const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Request timeout middleware.
 * Returns 503 Service Unavailable if the request takes too long.
 * Configurable via TIMEOUT_MS environment variable.
 */
function timeoutMiddleware(ms) {
  const timeout = ms || parseInt(process.env.TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;

  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: 'Request timeout' });
      }
    }, timeout);

    // Clear timeout when response finishes
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

module.exports = { timeoutMiddleware };
