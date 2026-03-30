const express = require('express');
const router = express.Router();
const config = require('../config');

module.exports = function createBrandingRoutes() {
  router.get('/', (_req, res) => {
    res.json({
      name: config.brand.name,
      logoUrl: config.brand.logoUrl,
      color: config.brand.color,
      version: config.version,
    });
  });

  return router;
};
