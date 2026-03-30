const express = require('express');
const router = express.Router();
const createRecurringRepository = require('../repositories/recurring.repository');

module.exports = function createCalendarRoutes({ db }) {
  const recurringRepo = createRecurringRepository({ db });

  // GET /api/calendar?month=YYYY-MM — transactions + upcoming recurring for a month
  router.get('/', (req, res, next) => {
    try {
      const userId = req.user.id;
      const monthParam = req.query.month;

      let year, month;
      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        [year, month] = monthParam.split('-').map(Number);
      } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      }

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Fetch transactions in the month
      const transactions = db.prepare(
        `SELECT t.*, a.name as account_name, a.icon as account_icon,
                c.name as category_name, c.icon as category_icon
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = ? AND t.date >= ? AND t.date <= ?
         ORDER BY t.date ASC`
      ).all(userId, startDate, endDate);

      // Fetch active recurring rules
      const rules = recurringRepo.findAllByUser(userId, { is_active: 1, limit: 200 });

      // Generate recurring events that fall within this month
      const recurringEvents = [];
      for (const rule of rules) {
        const dates = getRecurringDatesInRange(rule.next_date, rule.frequency, rule.end_date, startDate, endDate);
        for (const date of dates) {
          recurringEvents.push({
            id: rule.id,
            type: rule.type,
            amount: rule.amount,
            currency: rule.currency,
            description: rule.description,
            date,
            frequency: rule.frequency,
            is_recurring: true,
            account_name: rule.account_name,
            account_icon: rule.account_icon,
          });
        }
      }

      // Group by day
      const days = {};
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days[dateStr] = { transactions: [], recurring: [] };
      }

      for (const tx of transactions) {
        if (days[tx.date]) {
          days[tx.date].transactions.push(tx);
        }
      }

      for (const evt of recurringEvents) {
        if (days[evt.date]) {
          days[evt.date].recurring.push(evt);
        }
      }

      res.json({
        month: `${year}-${String(month).padStart(2, '0')}`,
        start_date: startDate,
        end_date: endDate,
        days,
        transaction_count: transactions.length,
        recurring_event_count: recurringEvents.length,
      });
    } catch (err) { next(err); }
  });

  return router;
};

/**
 * Generate all dates a recurring rule would fire within [rangeStart, rangeEnd].
 * Walks forward from the rule's next_date by frequency increments.
 */
function getRecurringDatesInRange(nextDate, frequency, endDate, rangeStart, rangeEnd) {
  const dates = [];
  if (!nextDate) return dates;

  let current = new Date(nextDate + 'T00:00:00Z');
  const start = new Date(rangeStart + 'T00:00:00Z');
  const end = new Date(rangeEnd + 'T00:00:00Z');
  const ruleEnd = endDate ? new Date(endDate + 'T00:00:00Z') : null;

  // Walk backwards if current is after rangeEnd (no results)
  // Walk forwards from nextDate to find dates in range
  // To handle cases where nextDate is before rangeStart, advance until in range
  let iterations = 0;
  const maxIterations = 1000;

  // If nextDate is far before rangeStart, advance to near the range
  while (current < start && iterations < maxIterations) {
    advanceDateInPlace(current, frequency);
    iterations++;
  }

  // Now collect dates within range
  while (current <= end && iterations < maxIterations) {
    if (ruleEnd && current > ruleEnd) break;
    const dateStr = current.toISOString().slice(0, 10);
    if (dateStr >= rangeStart && dateStr <= rangeEnd) {
      dates.push(dateStr);
    }
    advanceDateInPlace(current, frequency);
    iterations++;
  }

  return dates;
}

function advanceDateInPlace(d, frequency) {
  switch (frequency) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
}
