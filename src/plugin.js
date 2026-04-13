'use strict';

/**
 * FinanceFlow Plugin Adapter for Synclyf Monolith.
 *
 * Wraps all FinanceFlow routes into a plugin interface.
 * Route style: RELATIVE paths (/, /:id) mounted with app.use('/accounts', ...)
 * The monolith mounts this at /api/fi/.
 */

const { Router } = require('express');

module.exports = function initPlugin(context) {
  if (!context?.authDb || !context?.config || !context?.logger) {
    throw new Error('FinanceFlow plugin context incomplete: missing authDb, config, or logger');
  }

  const { authDb, config, logger } = context;

  // ─── Initialize FinanceFlow's own database ───
  const initDatabase = require('./db');
  const { db } = initDatabase(config.dataDir);

  // ─── Create FinanceFlow dependencies ───
  const createAuditLogger = require('./services/audit');
  const audit = createAuditLogger(db);
  const { cacheMiddleware } = require('./middleware/cache');
  const createScheduler = require('./scheduler');

  const deps = { db, audit };

  // ─── Ensure user exists in FinanceFlow DB ───
  function ensureUser(req, _res, next) {
    if (!req.userId) return next();
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.userId);
    if (!existing) {
      const authUser = authDb.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(req.userId);
      if (authUser) {
        db.prepare(
          "INSERT OR IGNORE INTO users (id, username, password_hash, display_name, default_currency, role, created_at) VALUES (?, ?, ?, ?, 'INR', 'user', ?)"
        ).run(authUser.id, authUser.email, 'MONOLITH_MANAGED', authUser.display_name || '', authUser.created_at);
      }
    }
    // FinanceFlow expects req.user object — already set by monolith auth middleware
    next();
  }

  // ─── Build router with all FinanceFlow routes ───
  const router = Router();

  // Import route factories
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
  const createSpendingLimitRoutes = require('./routes/spending-limits');
  const createBrandingRoutes = require('./routes/branding');
  const createWhatsNewRoutes = require('./routes/whats-new');
  const createOnboardingRoutes = require('./routes/onboarding');
  const createGroupInviteRoutes = require('./routes/group-invites');
  const createExpenseCommentRoutes = require('./routes/expense-comments');
  const createTransactionTemplateRoutes = require('./routes/transaction-templates');
  const createFinancialTodoRoutes = require('./routes/financial-todos');
  const createPersonalLendingRoutes = require('./routes/personal-lending');
  const createBalanceAlertRoutes = require('./routes/balance-alerts');
  const createTagRuleRoutes = require('./routes/tag-rules');
  const createAutomationRoutes = require('./routes/automation');
  const createPlanRoutes = require('./routes/plans');

  // Mount routes with relative paths (FinanceFlow pattern)
  router.get('/version', (_req, res) => {
    res.json({ version: config.version, api_version: 'v1' });
  });

  // Public-ish routes (monolith auth already applied at mount)
  router.use('/health', createHealthRoutes(deps));
  router.use('/demo', createDemoRoutes(deps));
  router.use('/branding', createBrandingRoutes());
  router.use('/whats-new', createWhatsNewRoutes());

  // Protected routes
  router.use('/accounts', createAccountRoutes(deps));
  router.use('/transactions/duplicates', createDuplicateRoutes(deps));
  const templateRoutes = createTransactionTemplateRoutes(deps);
  router.use('/transaction-templates', templateRoutes);
  if (templateRoutes.fromTemplateRouter) {
    router.use('/transactions', templateRoutes.fromTemplateRouter);
  }
  router.use('/transactions', createTransactionRoutes(deps));
  router.use('/categories', createCategoryRoutes(deps));
  router.use('/budgets', createBudgetRoutes(deps));
  router.use('/groups', createGroupRoutes(deps));
  router.use('/groups', createGroupInviteRoutes(deps));
  router.use('/groups', createExpenseCommentRoutes(deps));
  router.use('/splits', createSplitRoutes(deps));
  router.use('/stats', cacheMiddleware(60, ['transactions', 'accounts', 'categories', 'budgets', 'goals']), createStatsRoutes(deps));
  router.use('/subscriptions', createSubscriptionRoutes(deps));
  router.use('/goals', createGoalRoutes(deps));
  router.use('/settings', createSettingsRoutes(deps));
  router.use('/rules', createRulesRoutes(deps));
  router.use('/data', createDataRoutes(deps));
  router.use('/recurring/suggestions', createRecurringSuggestionRoutes(deps));
  router.use('/recurring', createRecurringRoutes(deps));
  router.use('/tags', createTagRoutes(deps));
  router.use('/search', createSearchRoutes(deps));
  router.use('/net-worth', createNetWorthRoutes(deps));
  router.use('/audit', createAuditRoutes(deps));
  router.use('/reminders', createReminderRoutes(deps));
  router.use('/reports', cacheMiddleware(60, ['transactions', 'accounts', 'categories', 'budgets']), createReportRoutes(deps));
  router.use('/insights', cacheMiddleware(60, ['transactions', 'accounts', 'categories', 'budgets', 'goals']), createInsightRoutes(deps));
  router.use('/exchange-rates', createExchangeRateRoutes(deps));
  router.use('/tokens', createApiTokenRoutes(deps));
  router.use('/charts', cacheMiddleware(60, ['transactions', 'accounts', 'categories']), createChartRoutes(deps));
  router.use('/', createAttachmentRoutes(deps));
  router.use('/notifications', createNotificationRoutes(deps));
  router.use('/export', createExportRoutes(deps));
  router.use('/preferences', createPreferencesRoutes(deps));
  router.use('/calendar', createCalendarRoutes(deps));
  router.use('/spending-limits', createSpendingLimitRoutes(deps));
  router.use('/financial-todos', createFinancialTodoRoutes(deps));
  router.use('/lending', createPersonalLendingRoutes(deps));
  router.use('/balance-alerts', createBalanceAlertRoutes(deps));
  router.use('/tag-rules', createTagRuleRoutes(deps));
  router.use('/automation', createAutomationRoutes(deps));
  router.use('/plans', createPlanRoutes(deps));
  router.use('/users', createOnboardingRoutes(deps));
  router.use('/admin', createAdminRoutes(deps));

  // ─── Scheduler ───
  const scheduler = createScheduler(db, logger);
  scheduler.registerBuiltinJobs();

  return {
    name: 'financeflow',
    router,
    ensureUser,
    scheduler,

    healthCheck() {
      try {
        db.prepare('SELECT 1').get();
        return { status: 'ok' };
      } catch (err) {
        return { status: 'error', message: err.message };
      }
    },

    shutdown() {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch (err) {
        logger.error({ err, plugin: 'financeflow' }, 'DB close error');
        try { db.close(); } catch {}
      }
    },
  };
};
