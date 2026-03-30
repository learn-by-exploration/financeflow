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
    const mem = process.memoryUsage();

    // Disk space for data directory
    let diskSpace = null;
    try {
      const dbFile = path.join(config.dbDir, 'personalfi.db');
      const stats = fs.statSync(dbFile);
      diskSpace = { dbFileSize: stats.size };
    } catch {}

    // Active session count
    let activeSessions = 0;
    try {
      const row = db.prepare(
        "SELECT COUNT(*) as cnt FROM sessions WHERE expires_at > datetime('now')"
      ).get();
      activeSessions = row.cnt;
    } catch {}

    // Last backup timestamp
    let lastBackup = null;
    try {
      const backupDir = path.join(config.dbDir, 'backups');
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir)
          .filter(f => f.endsWith('.db'))
          .sort()
          .reverse();
        if (files.length > 0) {
          const stat = fs.statSync(path.join(backupDir, files[0]));
          lastBackup = stat.mtime.toISOString();
        }
      }
    } catch {}

    res.json({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: config.version,
      uptime: process.uptime(),
      db: dbStatus,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      diskSpace,
      activeSessions,
      lastBackup,
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
