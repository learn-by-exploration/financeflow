function requireJsonContentType(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    // Skip for endpoints that accept non-JSON content (e.g. CSV import, file uploads)
    if (req.path.endsWith('/csv-import')) return next();
    if (req.path.endsWith('/attachments')) return next();
    const cl = req.headers['content-length'];
    const hasBody = (cl && cl !== '0') || req.headers['transfer-encoding'];
    if (hasBody) {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        return res.status(415).json({
          error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' }
        });
      }
    }
  }
  next();
}

module.exports = requireJsonContentType;
