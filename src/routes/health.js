const express = require('express');
const router = express.Router();
const config = require('../config');

const startTime = Date.now();

module.exports = function createHealthRoutes({ db }) {

  router.get('/', (_req, res) => {
    let dbStatus = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }

    res.json({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      version: config.version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: dbStatus,
    });
  });

  return router;
};
