// src/services/transaction-orchestrator.service.js
// Orchestrates post-transaction side effects:
// - Auto-categorization via category rules
// - Spending limit alerts
// - Budget threshold notifications  
// - Duplicate detection
// - Goal auto-allocation on income

const { safePatternTest } = require('../utils/safe-regex');
const config = require('../config');

module.exports = function createTransactionOrchestrator({ db }) {
  const createNotificationService = require('./notification.service');
  const createSpendingLimitRepository = require('../repositories/spending-limit.repository');
  const createGoalRepository = require('../repositories/goal.repository');
  const createDuplicateRepository = require('../repositories/duplicate.repository');
  const createTagRuleRepository = require('../repositories/tag-rule.repository');
  const createAutomationLogRepository = require('../repositories/automation-log.repository');
  const notifRepo = require('../repositories/notification.repository')({ db });
  const notifService = createNotificationService({ db });
  const spendingLimitRepo = createSpendingLimitRepository({ db });
  const goalRepo = createGoalRepository({ db });
  const dupRepo = createDuplicateRepository({ db });
  const tagRuleRepo = createTagRuleRepository({ db });
  const automationLog = createAutomationLogRepository({ db });

  /**
   * Resolve category from auto-categorization rules if no category was provided.
   */
  function resolveCategory(userId, categoryId, description) {
    if (categoryId) return categoryId;
    if (!description) return null;
    const rules = db.prepare(
      'SELECT * FROM category_rules WHERE user_id = ? ORDER BY position ASC, id ASC'
    ).all(userId);
    for (const rule of rules) {
      if (safePatternTest(rule.pattern, description)) {
        return rule.category_id;
      }
    }
    return null;
  }

  /**
   * Check large transaction threshold and create notification if exceeded.
   */
  function checkLargeTransaction(userId, transactionId, amount) {
    const setting = db.prepare(
      "SELECT value FROM settings WHERE user_id = ? AND key = 'large_transaction_threshold'"
    ).get(userId);
    const threshold = setting ? Number(setting.value) : 10000;
    notifService.checkLargeTransaction(userId, transactionId, amount, threshold);
  }

  /**
   * Check spending limits and create warnings/alerts.
   */
  function checkSpendingLimits(userId, categoryId, amount) {
    const limits = spendingLimitRepo.getLimitsForCheck(userId, categoryId);
    for (const limit of limits) {
      const spent = spendingLimitRepo.getCurrentSpending(userId, limit.category_id, limit.period);
      const pct = limit.amount > 0 ? spent / limit.amount : 0;
      const catLabel = limit.category_id ? 'category' : 'overall';
      if (pct >= 1) {
        notifRepo.create(userId, {
          type: 'spending_exceeded',
          title: 'Spending Limit Exceeded',
          message: `You have exceeded your ${limit.period} ${catLabel} spending limit of ₹${limit.amount}. Current: ₹${Math.round(spent * 100) / 100}.`,
          link: '/spending-limits',
        });
      } else if (pct >= 0.8) {
        notifRepo.create(userId, {
          type: 'spending_warning',
          title: 'Approaching Spending Limit',
          message: `You have reached ${Math.round(pct * 100)}% of your ${limit.period} ${catLabel} spending limit of ₹${limit.amount}.`,
          link: '/spending-limits',
        });
      }
    }

    // Unusual spending detection
    if (categoryId) {
      const { avg, count } = spendingLimitRepo.getAverageSpending(userId, categoryId);
      if (count >= 3 && amount > avg * 3) {
        notifRepo.create(userId, {
          type: 'unusual_spending',
          title: 'Unusual Spending Detected',
          message: `Transaction of ₹${amount} is significantly higher than your average of ₹${Math.round(avg * 100) / 100} for this category.`,
          link: '/transactions',
        });
      }
    }
  }

  /**
   * Check if budget thresholds are exceeded and create notifications.
   */
  function checkBudgetThresholds(userId, categoryId, txDate) {
    const dateStr = txDate || new Date().toISOString().slice(0, 10);
    // Single query: join budgets with spending totals to avoid N+1
    const budgets = db.prepare(`
      SELECT b.id, b.name, b.start_date, b.end_date, bi.amount as allocated, bi.category_id,
        COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.user_id = ? AND t.type = 'expense' AND t.category_id = bi.category_id
          AND t.date >= b.start_date AND t.date <= b.end_date), 0) as spent
      FROM budgets b
      JOIN budget_items bi ON bi.budget_id = b.id
      WHERE b.user_id = ? AND bi.category_id = ? AND b.is_active = 1
      AND b.start_date <= ? AND b.end_date >= ?
    `).all(userId, userId, categoryId, dateStr, dateStr);

    for (const budget of budgets) {
      const pct = budget.allocated > 0 ? budget.spent / budget.allocated : 0;

      if (pct >= config.thresholds.budgetExceededPct) {
        const existing = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'budget_exceeded' AND message LIKE ? AND created_at >= ?"
        ).get(userId, `%budget "${budget.name}"%category%${budget.category_id}%`, budget.start_date);
        if (!existing) {
          notifRepo.create(userId, {
            type: 'budget_exceeded',
            title: 'Budget Exceeded',
            message: `You have reached 100% of your budget "${budget.name}" for category ${budget.category_id}. Spent ₹${Math.round(budget.spent * 100) / 100} of ₹${budget.allocated}.`,
            link: `/budgets/${budget.id}`,
          });
        }
      } else if (pct >= config.thresholds.budgetWarningPct) {
        const existing = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'budget_warning' AND message LIKE ? AND created_at >= ?"
        ).get(userId, `%budget "${budget.name}"%category%${budget.category_id}%`, budget.start_date);
        if (!existing) {
          notifRepo.create(userId, {
            type: 'budget_warning',
            title: 'Budget Warning',
            message: `You have reached 80% of your budget "${budget.name}" for category ${budget.category_id}. Spent ₹${Math.round(budget.spent * 100) / 100} of ₹${budget.allocated}.`,
            link: `/budgets/${budget.id}`,
          });
        }
      }
    }
  }

  /**
   * Check for duplicate transactions.
   */
  function checkDuplicate(userId, transactionId, { account_id, date, amount, description }) {
    const match = dupRepo.isDuplicate(userId, { account_id, date, amount, description });
    if (match && match.id !== transactionId) {
      return { potential_duplicate: true, similar_transaction_id: match.id };
    }
    return { potential_duplicate: false, similar_transaction_id: null };
  }

  /**
   * Auto-allocate income to savings goals based on auto_allocate_percent.
   */
  function autoAllocateToGoals(userId, transactionId, amount) {
    const allocations = [];
    const goals = goalRepo.getAutoAllocateGoals(userId);
    for (const goal of goals) {
      const allocAmount = Math.round((amount * goal.auto_allocate_percent / 100) * 100) / 100;
      if (allocAmount > 0) {
        goalRepo.linkTransaction(goal.id, transactionId, allocAmount);
        goalRepo.recalculateCurrentAmount(goal.id, userId);
        allocations.push({ goal_id: goal.id, goal_name: goal.name, amount: allocAmount });
      }
    }
    return allocations;
  }

  /**
   * Generate contextual financialTip based on transaction context.
   * Rules: rent > 28% income → 28/36 tip, subscriptions > 5% → awareness,
   * vehicle purchase → 20/4/10 rule.
   */
  function financialTip(userId, { categoryId, amount, description }) {
    try {
      const incomeSetting = db.prepare(
        "SELECT value FROM settings WHERE user_id = ? AND key = 'monthly_income'"
      ).get(userId);
      const monthlyIncome = incomeSetting ? Number(incomeSetting.value) : 0;
      if (!monthlyIncome || monthlyIncome <= 0) return null;

      const cat = categoryId ? db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId) : null;
      const catName = cat ? cat.name.toLowerCase() : '';
      const desc = (description || '').toLowerCase();

      // Rent > 28% of income → 28/36 rule tip
      if ((catName.includes('rent') || catName.includes('housing') || desc.includes('rent')) && amount > monthlyIncome * 0.28) {
        return 'Your rent exceeds 28% of income. The 28/36 rule suggests keeping housing costs below 28% and total debt below 36%.';
      }

      // Vehicle purchase → 20/4/10 rule
      if (desc.includes('car') || desc.includes('vehicle') || desc.includes('auto loan')) {
        return 'Consider the 20/4/10 rule: 20% down payment, finance for no more than 4 years, total costs under 10% of gross income.';
      }

      // Subscription awareness
      if (catName.includes('subscription') || desc.includes('subscription') || desc.includes('netflix') || desc.includes('spotify')) {
        const subTotal = db.prepare(
          "SELECT COALESCE(SUM(amount), 0) as total FROM subscriptions WHERE user_id = ? AND is_active = 1"
        ).get(userId).total;
        if (subTotal > monthlyIncome * 0.05) {
          return `Your subscriptions total ₹${Math.round(subTotal)}/month (${Math.round(subTotal / monthlyIncome * 100)}% of income). Consider reviewing for unused services.`;
        }
      }

      return null;
    } catch { return null; }
  }

  /**
   * Auto-apply tag rules to a transaction based on description/amount matching.
   */
  function applyTagRules(userId, transactionId, { description, amount }) {
    const rules = tagRuleRepo.getEnabledRules(userId);
    const appliedTags = [];

    for (const rule of rules) {
      let matched = false;
      if (rule.match_type === 'description' && description) {
        matched = safePatternTest(rule.pattern, description);
      } else if (rule.match_type === 'amount_above' && rule.match_value != null) {
        matched = amount > rule.match_value;
      } else if (rule.match_type === 'amount_below' && rule.match_value != null) {
        matched = amount < rule.match_value;
      }

      if (matched) {
        appliedTags.push(rule.tag);
      }
    }

    if (appliedTags.length > 0) {
      // Merge with existing tags
      const txn = db.prepare('SELECT tags FROM transactions WHERE id = ? AND user_id = ?').get(transactionId, userId);
      let existingTags = [];
      try { existingTags = JSON.parse(txn?.tags || '[]'); } catch { /* empty */ }
      const merged = [...new Set([...existingTags, ...appliedTags])];
      db.prepare('UPDATE transactions SET tags = ? WHERE id = ? AND user_id = ?')
        .run(JSON.stringify(merged), transactionId, userId);

      try {
        automationLog.log(userId, 'auto_tag', `Auto-tagged transaction with: ${appliedTags.join(', ')}`, { transaction_id: transactionId, tags: appliedTags });
      } catch { /* non-critical */ }
    }

    return appliedTags;
  }

  /**
   * Check balance alerts after a transaction changes an account balance.
   */
  function checkBalanceAlerts(userId, accountId) {
    try {
      const alerts = db.prepare(
        'SELECT ba.*, a.balance as current_balance, a.name as account_name FROM balance_alerts ba JOIN accounts a ON ba.account_id = a.id WHERE ba.user_id = ? AND ba.account_id = ? AND ba.is_enabled = 1'
      ).all(userId, accountId);

      for (const alert of alerts) {
        const triggered = alert.direction === 'below'
          ? alert.current_balance < alert.threshold_amount
          : alert.current_balance > alert.threshold_amount;

        if (!triggered) continue;

        // Dedup: don't re-trigger within configured hours
        if (alert.last_triggered_at) {
          const lastTriggered = new Date(alert.last_triggered_at).getTime();
          if (Date.now() - lastTriggered < config.thresholds.balanceAlertDedupHours * 3600000) continue;
        }

        const dirLabel = alert.direction === 'below' ? 'dropped below' : 'exceeded';
        notifRepo.create(userId, {
          type: 'balance_alert',
          title: '💰 Balance Alert',
          message: `${alert.account_name} balance (₹${Math.round(alert.current_balance * 100) / 100}) has ${dirLabel} your threshold of ₹${alert.threshold_amount}.`,
          link: '/accounts',
        });

        db.prepare("UPDATE balance_alerts SET last_triggered_at = datetime('now') WHERE id = ?").run(alert.id);
      }
    } catch { /* non-critical */ }
  }

  /**
   * Log automation activity for any automated action on a transaction.
   */
  function logAutomation(userId, type, description, metadata) {
    try {
      automationLog.log(userId, type, description, metadata);
    } catch { /* non-critical */ }
  }

  /**
   * Run all post-creation side effects for a transaction.
   * Each effect is wrapped in try-catch so failures don't break the transaction.
   */
  function runPostCreationEffects(userId, transaction, { categoryId, type, amount, date, account_id, description }) {
    const effects = { potential_duplicate: false, similar_transaction_id: null, auto_allocations: [], tip: null, auto_tags: [] };

    // Contextual financial tip
    try { effects.tip = financialTip(userId, { categoryId, amount, description }); } catch (_e) { /* non-critical */ }

    // Large transaction notification
    try { checkLargeTransaction(userId, transaction.id, amount); } catch (_e) { /* non-critical */ }

    // Spending limit alerts (expense only)
    if (type === 'expense') {
      try { checkSpendingLimits(userId, categoryId, amount); } catch (_e) { /* non-critical */ }
    }

    // Budget threshold notifications (expense with category)
    if (type === 'expense' && categoryId) {
      try { checkBudgetThresholds(userId, categoryId, date); } catch (_e) { /* non-critical */ }
    }

    // Duplicate detection
    try {
      const dupResult = checkDuplicate(userId, transaction.id, { account_id, date, amount, description });
      effects.potential_duplicate = dupResult.potential_duplicate;
      effects.similar_transaction_id = dupResult.similar_transaction_id;
    } catch (_e) { /* non-critical */ }

    // Goal auto-allocation (income only)
    if (type === 'income') {
      try {
        effects.auto_allocations = autoAllocateToGoals(userId, transaction.id, amount);
      } catch (_e) { /* non-critical */ }
    }

    // Auto-tagging via tag rules
    try {
      effects.auto_tags = applyTagRules(userId, transaction.id, { description, amount });
    } catch (_e) { /* non-critical */ }

    // Balance alerts (check after balance update)
    try { checkBalanceAlerts(userId, account_id); } catch (_e) { /* non-critical */ }

    // Log the transaction creation in automation log
    try {
      if (categoryId) {
        logAutomation(userId, 'auto_categorize', `Auto-categorized transaction as category ${categoryId}`, { transaction_id: transaction.id });
      }
    } catch (_e) { /* non-critical */ }

    return effects;
  }

  return {
    resolveCategory,
    checkLargeTransaction,
    checkSpendingLimits,
    checkBudgetThresholds,
    checkDuplicate,
    autoAllocateToGoals,
    financialTip,
    applyTagRules,
    checkBalanceAlerts,
    logAutomation,
    runPostCreationEffects,
  };
};
