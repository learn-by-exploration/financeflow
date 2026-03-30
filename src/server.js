const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const initDatabase = require('./db');
const createAuthMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errors');
const createCsrfMiddleware = require('./middleware/csrf');
const createAuditLogger = require('./services/audit');
const createRequestLogger = require('./middleware/request-logger');
const createScheduler = require('./scheduler');
const logger = require('./logger');

const app = express();
const PORT = config.port;

// ─── Trust proxy when behind reverse proxy ───
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

const { db } = initDatabase(config.dbDir);
const audit = createAuditLogger(db);
const deps = { db, audit };

const { requireAuth, optionalAuth } = createAuthMiddleware(db);

// ─── Security headers ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: 'same-origin' }
}));

// ─── Middleware ───
app.use(express.json({ limit: '1mb' }));
app.use(cors());
if (!config.isTest) {
  app.use(rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }));
}
app.use(createRequestLogger());
if (!config.isTest) {
  app.use(createCsrfMiddleware());
}
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Routes ───
const createAuthRoutes = require('./routes/auth');
const createAccountRoutes = require('./routes/accounts');
const createTransactionRoutes = require('./routes/transactions');
const createCategoryRoutes = require('./routes/categories');
const createBudgetRoutes = require('./routes/budgets');
const createGroupRoutes = require('./routes/groups');
const createSplitRoutes = require('./routes/splits');
const createStatsRoutes = require('./routes/stats');
const createSubscriptionRoutes = require('./routes/subscriptions');
const createGoalRoutes = require('./routes/goals');
const createSettingsRoutes = require('./routes/settings');
const createRulesRoutes = require('./routes/rules');
const createDataRoutes = require('./routes/data');
const createRecurringRoutes = require('./routes/recurring');
const createTagRoutes = require('./routes/tags');
const createSearchRoutes = require('./routes/search');

// Public routes
app.use('/api/auth', createAuthRoutes(deps));

// Protected routes
app.use('/api/accounts', requireAuth, createAccountRoutes(deps));
app.use('/api/transactions', requireAuth, createTransactionRoutes(deps));
app.use('/api/categories', requireAuth, createCategoryRoutes(deps));
app.use('/api/budgets', requireAuth, createBudgetRoutes(deps));
app.use('/api/groups', requireAuth, createGroupRoutes(deps));
app.use('/api/splits', requireAuth, createSplitRoutes(deps));
app.use('/api/stats', requireAuth, createStatsRoutes(deps));
app.use('/api/subscriptions', requireAuth, createSubscriptionRoutes(deps));
app.use('/api/goals', requireAuth, createGoalRoutes(deps));
app.use('/api/settings', requireAuth, createSettingsRoutes(deps));
app.use('/api/rules', requireAuth, createRulesRoutes(deps));
app.use('/api/data', requireAuth, createDataRoutes(deps));
app.use('/api/recurring', requireAuth, createRecurringRoutes(deps));
app.use('/api/tags', requireAuth, createTagRoutes(deps));
app.use('/api/search', requireAuth, createSearchRoutes(deps));

// SPA fallback (Express 5 wildcard syntax)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Error handler ───
app.use(errorHandler);

// ─── Start ───
if (!config.isTest) {
  const scheduler = createScheduler(db, logger);
  scheduler.registerBuiltinJobs();
  scheduler.start();

  const server = app.listen(PORT, () => {
    logger.info(`PersonalFi v${config.version} running on http://localhost:${PORT}`);
  });

  // ─── Graceful shutdown ───
  function shutdown(signal) {
    logger.info(`${signal} received, shutting down...`);
    scheduler.stop();
    server.close(() => {
      db.close();
      logger.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown');
      process.exit(1);
    }, config.shutdownTimeoutMs);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, db };
