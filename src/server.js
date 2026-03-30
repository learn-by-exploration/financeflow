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
const createRequestIdMiddleware = require('./middleware/request-id');
const requireJsonContentType = require('./middleware/content-type');
const createScheduler = require('./scheduler');
const logger = require('./logger');
const { cacheMiddleware, invalidateCache, invalidateCacheByTags, clearAllCache } = require('./middleware/cache');
const { timeoutMiddleware } = require('./middleware/timeout');
const { etagMiddleware } = require('./middleware/etag');
const { metricsMiddleware } = require('./middleware/metrics');
const createPerUserRateLimit = require('./middleware/per-user-rate-limit');

const app = express();
const PORT = config.port;

// ─── Trust proxy when behind reverse proxy ───
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

const { db } = initDatabase(config.dbDir);
const audit = createAuditLogger(db);
const deps = { db, audit };

const { requireAuth, optionalAuth, requireAdmin } = createAuthMiddleware(db);

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
app.use(metricsMiddleware);
app.use(timeoutMiddleware());
app.use(express.json({ limit: '1mb' }));
const corsOrigins = config.corsOrigin
  ? config.corsOrigin.split(',').map(s => s.trim())
  : false;
app.use(cors({ origin: corsOrigins }));
app.use('/api', requireJsonContentType);
app.use('/api', etagMiddleware());
app.use(createRequestIdMiddleware());
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
const createRecurringSuggestionRoutes = require('./routes/recurring-suggestions');
const createTagRoutes = require('./routes/tags');
const createSearchRoutes = require('./routes/search');
const createNetWorthRoutes = require('./routes/net-worth');
const createAuditRoutes = require('./routes/audit');
const createReminderRoutes = require('./routes/reminders');
const createHealthRoutes = require('./routes/health');
const createReportRoutes = require('./routes/reports');
const createInsightRoutes = require('./routes/insights');
const createExchangeRateRoutes = require('./routes/exchange-rates');
const createApiTokenRoutes = require('./routes/api-tokens');
const createChartRoutes = require('./routes/charts');
const createAttachmentRoutes = require('./routes/attachments');
const createNotificationRoutes = require('./routes/notifications');
const createExportRoutes = require('./routes/export');
const createDuplicateRoutes = require('./routes/duplicates');
const createPreferencesRoutes = require('./routes/preferences');
const createAdminRoutes = require('./routes/admin');
const createCalendarRoutes = require('./routes/calendar');
const createDemoRoutes = require('./routes/demo');

// Public routes
app.use('/api/auth', createAuthRoutes(deps));
app.use('/api/health', createHealthRoutes(deps));
app.use('/api/demo', createDemoRoutes(deps));

// Per-user rate limiting (optionalAuth populates req.user if authenticated)
app.use('/api', optionalAuth, createPerUserRateLimit());

// Protected routes
app.use('/api/accounts', requireAuth, createAccountRoutes(deps));
app.use('/api/transactions/duplicates', requireAuth, createDuplicateRoutes(deps));
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
app.use('/api/recurring/suggestions', requireAuth, createRecurringSuggestionRoutes(deps));
app.use('/api/recurring', requireAuth, createRecurringRoutes(deps));
app.use('/api/tags', requireAuth, createTagRoutes(deps));
app.use('/api/search', requireAuth, createSearchRoutes(deps));
app.use('/api/net-worth', requireAuth, createNetWorthRoutes(deps));
app.use('/api/audit', requireAuth, createAuditRoutes(deps));
app.use('/api/reminders', requireAuth, createReminderRoutes(deps));
app.use('/api/reports', requireAuth, cacheMiddleware(60, ['transactions', 'accounts', 'categories', 'budgets']), createReportRoutes(deps));
app.use('/api/insights', requireAuth, cacheMiddleware(60, ['transactions', 'accounts', 'categories', 'budgets', 'goals']), createInsightRoutes(deps));
app.use('/api/exchange-rates', requireAuth, createExchangeRateRoutes(deps));
app.use('/api/tokens', requireAuth, createApiTokenRoutes(deps));
app.use('/api/charts', requireAuth, cacheMiddleware(60, ['transactions', 'accounts', 'categories']), createChartRoutes(deps));
app.use('/api', requireAuth, createAttachmentRoutes(deps));
app.use('/api/notifications', requireAuth, createNotificationRoutes(deps));
app.use('/api/export', requireAuth, createExportRoutes(deps));
app.use('/api/preferences', requireAuth, createPreferencesRoutes(deps));
app.use('/api/calendar', requireAuth, createCalendarRoutes(deps));
app.use('/api/admin', requireAuth, requireAdmin, createAdminRoutes(deps));

// GET /api/upcoming — shortcut for upcoming bills
app.get('/api/upcoming', requireAuth, (req, res, next) => {
  try {
    const createReminderRepository = require('./repositories/reminder.repository');
    const reminderRepo = createReminderRepository({ db });
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const upcoming = reminderRepo.getUpcoming(req.user.id, days);
    res.json({ upcoming, days });
  } catch (err) { next(err); }
});

// SPA fallback (Express 5 wildcard syntax)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Error handler ───
app.use(errorHandler);

// ─── Startup validation ───
function validateStartup(cfg) {
  const fs = require('fs');

  // Ensure data directory exists
  const dataDir = cfg.dbDir;
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    }
  } catch (err) {
    logger.error(`Cannot create data directory ${dataDir}: ${err.message}`);
    process.exit(1);
  }

  // Ensure data directory is writable
  try {
    const testFile = path.join(dataDir, '.write-test-' + Date.now());
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (err) {
    logger.error(`Data directory ${dataDir} is not writable: ${err.message}`);
    process.exit(1);
  }

  // Validate port
  if (cfg.port < 1 || cfg.port > 65535 || !Number.isInteger(cfg.port)) {
    logger.error(`Invalid port: ${cfg.port}`);
    process.exit(1);
  }

  logger.info('Startup validation passed');
}

// ─── Start ───
if (!config.isTest) {
  // ─── Startup validation ───
  validateStartup(config);

  const scheduler = createScheduler(db, logger);
  scheduler.registerBuiltinJobs();
  scheduler.start();

  // Auto-backup on start
  if (config.backup.autoBackupOnStart) {
    const backupPath = path.join(config.dbDir, 'backups');
    const { createBackup, rotateBackups } = require('./services/backup');
    createBackup(db, backupPath)
      .then(() => { rotateBackups(backupPath, config.backup.maxBackups); logger.info('Auto-backup completed'); })
      .catch(err => logger.error('Auto-backup failed:', err.message));
  }

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

module.exports = { app, db, invalidateCache, invalidateCacheByTags, clearAllCache, validateStartup };
