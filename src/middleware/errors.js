const { AppError } = require('../errors');
const logger = require('../logger');

function errorHandler(err, req, res, _next) {
  const requestId = req.id || undefined;

  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    if (requestId) body.error.requestId = requestId;
    return res.status(err.status).json(body);
  }

  logger.error({ err, method: req.method, url: req.originalUrl, requestId }, 'Unhandled error');
  const body = { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
  if (requestId) body.error.requestId = requestId;
  res.status(500).json(body);
}

module.exports = errorHandler;
