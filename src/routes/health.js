const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const config = require('../config');
const { getMetrics } = require('../middleware/metrics');

module.exports = function createHealthRoutes({ db }) {

  function checkDb() {
    try {
      db.prepare('SELECT 1').get();
      return 'ok';
    } catch {
      return 'error';
    }
  }

  // ─── Enhanced health endpoint ───
  router.get('/', (_req, res) => {
    const dbStatus = checkDb();

    res.json({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: config.version,
      uptime: process.uptime(),
      db: dbStatus,
    });
  });

  // ─── Readiness probe ───
  router.get('/ready', (_req, res) => {
    const dbStatus = checkDb();
    if (dbStatus === 'ok') {
      return res.status(200).json({ status: 'ready' });
    }
    res.status(503).json({ status: 'not ready', reason: 'database unavailable' });
  });

  // ─── Liveness probe ───
  router.get('/live', (_req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  // ─── Metrics endpoint ───
  router.get('/metrics', (_req, res) => {
    const reqMetrics = getMetrics();

    // Counts from database
    let totalUsers = 0;
    let totalTransactions = 0;
    let totalAccounts = 0;
    try {
      totalUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
      totalTransactions = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get().cnt;
      totalAccounts = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get().cnt;
    } catch {}

    // Database file size
    let dbFileSize = 0;
    try {
      const dbFile = path.join(config.dbDir, 'personalfi.db');
      dbFileSize = fs.statSync(dbFile).size;
    } catch {}

    res.json({
      totalUsers,
      totalTransactions,
      totalAccounts,
      dbFileSize,
      requestCount: reqMetrics.requestCount,
      averageResponseTimeMs: reqMetrics.averageResponseTimeMs,
    });
  });

  return router;
};
