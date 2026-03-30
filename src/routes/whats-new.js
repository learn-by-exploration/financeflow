const express = require('express');
const router = express.Router();
const config = require('../config');

const changelog = [
  {
    version: '0.3.47',
    date: '2026-03-30',
    changes: [
      'Instance branding — configurable app name, logo, and accent color',
      'PWA support — install to home screen with offline caching',
      'What\'s New page — view changelog and release notes',
    ],
  },
  {
    version: '0.3.46',
    date: '2026-03-28',
    changes: [
      'Bug fixes and performance improvements',
    ],
  },
];

module.exports = function createWhatsNewRoutes() {
  router.get('/', (_req, res) => {
    res.json({ entries: changelog, currentVersion: config.version });
  });

  return router;
};
