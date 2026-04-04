// src/routes/automation.js
// Automation hub: activity log, suggestions, presets, and overview
const express = require('express');
const router = express.Router();
const { automationPresetSchema } = require('../schemas/automation.schema');
const createAutomationLogRepository = require('../repositories/automation-log.repository');

module.exports = function createAutomationRoutes({ db }) {
  const logRepo = createAutomationLogRepository({ db });

  // GET /api/automation/hub — overview of all automations
  router.get('/hub', (req, res, next) => {
    try {
      const userId = req.user.id;

      const categoryRules = db.prepare('SELECT COUNT(*) as count FROM category_rules WHERE user_id = ?').get(userId).count;
      const recurringRules = db.prepare('SELECT COUNT(*) as count FROM recurring_rules WHERE user_id = ? AND is_active = 1').get(userId).count;
      const billReminders = db.prepare(`
        SELECT COUNT(*) as count FROM bill_reminders WHERE user_id = ? AND is_enabled = 1
      `).get(userId).count;
      const spendingLimits = db.prepare('SELECT COUNT(*) as count FROM spending_limits WHERE user_id = ?').get(userId).count;
      const balanceAlerts = db.prepare('SELECT COUNT(*) as count FROM balance_alerts WHERE user_id = ? AND is_enabled = 1').get(userId).count;
      const tagRules = db.prepare('SELECT COUNT(*) as count FROM tag_rules WHERE user_id = ? AND is_enabled = 1').get(userId).count;
      const activeChallenges = db.prepare('SELECT COUNT(*) as count FROM savings_challenges WHERE user_id = ? AND is_active = 1 AND is_completed = 0').get(userId).count;

      const goalsWithAutoAllocate = db.prepare(
        'SELECT COUNT(*) as count FROM savings_goals WHERE user_id = ? AND auto_allocate_percent > 0 AND is_completed = 0'
      ).get(userId).count;

      // Streak info
      const streak = db.prepare('SELECT * FROM streak_tracking WHERE user_id = ?').get(userId);

      // Recent automation activity
      const recentActivity = logRepo.findByUser(userId, { limit: 10 });

      // Automation summary counts
      const logSummary = logRepo.getSummary(userId);

      res.json({
        hub: {
          category_rules: categoryRules,
          recurring_rules: recurringRules,
          bill_reminders: billReminders,
          spending_limits: spendingLimits,
          balance_alerts: balanceAlerts,
          tag_rules: tagRules,
          active_challenges: activeChallenges,
          goals_with_auto_allocate: goalsWithAutoAllocate,
          streak: streak || { current_streak: 0, longest_streak: 0, last_activity_date: null },
        },
        recent_activity: recentActivity,
        activity_summary: logSummary,
      });
    } catch (err) { next(err); }
  });

  // GET /api/automation/log — activity log with pagination
  router.get('/log', (req, res, next) => {
    try {
      const { limit, offset, type } = req.query;
      const opts = { limit: limit || 50, offset: offset || 0, type };
      const entries = logRepo.findByUser(req.user.id, opts);
      const total = logRepo.countByUser(req.user.id, opts);
      res.json({ entries, total, limit: Number(opts.limit), offset: Number(opts.offset) });
    } catch (err) { next(err); }
  });

  // GET /api/automation/suggestions — smart suggestions based on transaction patterns
  router.get('/suggestions', (req, res, next) => {
    try {
      const userId = req.user.id;
      const suggestions = [];

      // 1. Suggest category rules for frequent uncategorized payees
      const uncategorized = db.prepare(`
        SELECT description, COUNT(*) as cnt FROM transactions
        WHERE user_id = ? AND category_id IS NULL AND description IS NOT NULL AND description != ''
        GROUP BY LOWER(description)
        HAVING cnt >= 3
        ORDER BY cnt DESC LIMIT 5
      `).all(userId);
      for (const row of uncategorized) {
        suggestions.push({
          type: 'category_rule',
          title: `Auto-categorize "${row.description}"`,
          message: `You have ${row.cnt} uncategorized transactions with "${row.description}". Create a category rule?`,
          action: { pattern: row.description.toLowerCase() },
        });
      }

      // 2. Suggest recurring rules for repeated monthly transactions
      const repeatedMonthly = db.prepare(`
        SELECT description, amount, COUNT(DISTINCT strftime('%Y-%m', date)) as months, COUNT(*) as cnt
        FROM transactions
        WHERE user_id = ? AND type = 'expense' AND description IS NOT NULL AND description != ''
          AND date >= date('now', '-6 months')
        GROUP BY LOWER(description), amount
        HAVING months >= 3 AND cnt >= 3
        ORDER BY amount DESC LIMIT 5
      `).all(userId);
      // Filter out those already covered by recurring rules
      const existingRecurring = db.prepare(
        'SELECT LOWER(description) as desc FROM recurring_rules WHERE user_id = ?'
      ).all(userId).map(r => r.desc);
      for (const row of repeatedMonthly) {
        if (existingRecurring.includes(row.description.toLowerCase())) continue;
        suggestions.push({
          type: 'recurring_rule',
          title: `Set up recurring: ${row.description}`,
          message: `₹${row.amount} for "${row.description}" appears ${row.months} months in a row. Make it recurring?`,
          action: { description: row.description, amount: row.amount },
        });
      }

      // 3. Suggest savings goal if no goals exist
      const goalCount = db.prepare('SELECT COUNT(*) as count FROM savings_goals WHERE user_id = ? AND is_completed = 0').get(userId).count;
      if (goalCount === 0) {
        const avgExpense = db.prepare(`
          SELECT COALESCE(AVG(monthly_total), 0) as avg FROM (
            SELECT SUM(amount) as monthly_total FROM transactions
            WHERE user_id = ? AND type = 'expense' AND date >= date('now', '-6 months')
            GROUP BY strftime('%Y-%m', date)
          )
        `).get(userId).avg;
        if (avgExpense > 0) {
          suggestions.push({
            type: 'savings_goal',
            title: 'Start an emergency fund',
            message: `Your average monthly spending is ₹${Math.round(avgExpense)}. Consider saving 3-6 months (₹${Math.round(avgExpense * 3)} - ₹${Math.round(avgExpense * 6)}) as an emergency fund.`,
            action: { target_amount: Math.round(avgExpense * 3) },
          });
        }
      }

      // 4. Suggest budget if none active
      const budgetCount = db.prepare('SELECT COUNT(*) as count FROM budgets WHERE user_id = ? AND is_active = 1').get(userId).count;
      if (budgetCount === 0) {
        suggestions.push({
          type: 'budget',
          title: 'Create a budget',
          message: 'No active budget found. A budget helps you track spending against your plan.',
          action: {},
        });
      }

      // 5. Suggest spending limit for top spending categories without limits
      const topCatsNoLimit = db.prepare(`
        SELECT c.id, c.name, SUM(t.amount) as total FROM transactions t
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN spending_limits sl ON sl.category_id = c.id AND sl.user_id = t.user_id
        WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= date('now', '-30 days')
          AND sl.id IS NULL
        GROUP BY c.id ORDER BY total DESC LIMIT 3
      `).all(userId);
      for (const cat of topCatsNoLimit) {
        suggestions.push({
          type: 'spending_limit',
          title: `Set spending limit for ${cat.name}`,
          message: `You spent ₹${Math.round(cat.total)} on ${cat.name} this month. Set a limit to stay on track?`,
          action: { category_id: cat.id, suggested_amount: Math.round(cat.total * 1.1) },
        });
      }

      res.json({ suggestions });
    } catch (err) { next(err); }
  });

  // POST /api/automation/presets — apply an automation preset
  router.post('/presets', (req, res, next) => {
    try {
      const parsed = automationPresetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { preset } = parsed.data;
      const userId = req.user.id;

      const presets = {
        cautious: {
          inactivity_nudge_days: 1,
          large_transaction_threshold: 2000,
          notify_spending_warning: '1',
          notify_spending_exceeded: '1',
          notify_budget_warning: '1',
          notify_budget_exceeded: '1',
          notify_unusual_spending: '1',
          notify_bill_upcoming: '1',
          notify_inactivity_nudge: '1',
          notify_milestone: '1',
          notify_monthly_digest: '1',
          notify_weekly_digest: '1',
          notify_goal_pace: '1',
        },
        balanced: {
          inactivity_nudge_days: 3,
          large_transaction_threshold: 5000,
          notify_spending_warning: '1',
          notify_spending_exceeded: '1',
          notify_budget_warning: '1',
          notify_budget_exceeded: '1',
          notify_unusual_spending: '1',
          notify_bill_upcoming: '1',
          notify_inactivity_nudge: '1',
          notify_milestone: '1',
          notify_monthly_digest: '1',
          notify_weekly_digest: '1',
          notify_goal_pace: '1',
        },
        hands_off: {
          inactivity_nudge_days: 7,
          large_transaction_threshold: 20000,
          notify_spending_warning: '0',
          notify_spending_exceeded: '1',
          notify_budget_warning: '0',
          notify_budget_exceeded: '1',
          notify_unusual_spending: '0',
          notify_bill_upcoming: '1',
          notify_inactivity_nudge: '0',
          notify_milestone: '1',
          notify_monthly_digest: '1',
          notify_weekly_digest: '0',
          notify_goal_pace: '0',
        },
      };

      const settings = presets[preset];
      const upsert = db.prepare(
        'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value'
      );

      db.transaction(() => {
        for (const [key, value] of Object.entries(settings)) {
          upsert.run(userId, key, String(value));
        }
      })();

      res.json({ ok: true, preset, settings_applied: Object.keys(settings).length });
    } catch (err) { next(err); }
  });

  return router;
};
