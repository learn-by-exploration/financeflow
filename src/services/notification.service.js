const createNotificationRepository = require('../repositories/notification.repository');

module.exports = function createNotificationService({ db }) {
  const notifRepo = createNotificationRepository({ db });

  function checkBudgetOverspend(userId, budgetId, categoryId, spent, allocated) {
    if (spent > allocated) {
      const overspend = Math.round((spent - allocated) * 100) / 100;
      return notifRepo.create(userId, {
        type: 'budget_overspend',
        title: 'Budget Overspend',
        message: `You have overspent by ₹${overspend} in a budget category.`,
        link: `/budgets/${budgetId}`,
      });
    }
    return null;
  }

  function checkGoalCompleted(userId, goalId, goalName) {
    return notifRepo.create(userId, {
      type: 'goal_completed',
      title: 'Goal Completed!',
      message: `Congratulations! You have reached your goal "${goalName}".`,
      link: `/goals/${goalId}`,
    });
  }

  function checkLargeTransaction(userId, transactionId, amount, threshold) {
    if (amount >= threshold) {
      return notifRepo.create(userId, {
        type: 'large_transaction',
        title: 'Large Transaction',
        message: `A transaction of ₹${amount} was recorded, which exceeds your threshold of ₹${threshold}.`,
        link: `/transactions/${transactionId}`,
      });
    }
    return null;
  }

  return { checkBudgetOverspend, checkGoalCompleted, checkLargeTransaction };
};
