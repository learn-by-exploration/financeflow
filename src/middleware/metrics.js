const metrics = {
  requestCount: 0,
  totalResponseTime: 0,
};

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    metrics.requestCount++;
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms
    metrics.totalResponseTime += elapsed;
  });
  next();
}

function getMetrics() {
  return {
    requestCount: metrics.requestCount,
    averageResponseTimeMs: metrics.requestCount > 0
      ? Math.round((metrics.totalResponseTime / metrics.requestCount) * 100) / 100
      : 0,
  };
}

function resetMetrics() {
  metrics.requestCount = 0;
  metrics.totalResponseTime = 0;
}

module.exports = { metricsMiddleware, getMetrics, resetMetrics };
