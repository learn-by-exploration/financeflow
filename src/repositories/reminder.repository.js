module.exports = function createReminderRepository({ db }) {

  function findAllByUser(userId) {
    return db.prepare(`
      SELECT br.*,
        s.name as subscription_name, s.amount as subscription_amount, s.frequency as subscription_frequency, s.next_billing_date,
        r.description as recurring_description, r.amount as recurring_amount, r.frequency as recurring_frequency, r.next_date as recurring_next_date
      FROM bill_reminders br
      LEFT JOIN subscriptions s ON br.subscription_id = s.id
      LEFT JOIN recurring_rules r ON br.recurring_rule_id = r.id
      WHERE br.user_id = ?
      ORDER BY br.created_at DESC
    `).all(userId);
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM bill_reminders WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const { subscription_id, recurring_rule_id, days_before, is_enabled } = data;
    const result = db.prepare(`
      INSERT INTO bill_reminders (user_id, subscription_id, recurring_rule_id, days_before, is_enabled)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, subscription_id || null, recurring_rule_id || null, days_before ?? 3, is_enabled ?? 1);
    return db.prepare('SELECT * FROM bill_reminders WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, fields) {
    const allowed = ['days_before', 'is_enabled'];
    const updates = [];
    const values = [];
    for (const f of allowed) {
      if (fields[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(fields[f]);
      }
    }
    if (updates.length === 0) {
      return findById(id, userId);
    }
    updates.push("updated_at = datetime('now')");
    values.push(id, userId);
    db.prepare(`UPDATE bill_reminders SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    return findById(id, userId);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM bill_reminders WHERE id = ? AND user_id = ?').run(id, userId);
  }

  function getUpcoming(userId, days = 30) {
    const upcoming = [];

    // Upcoming subscriptions
    const subs = db.prepare(`
      SELECT s.id, s.name, s.amount, s.currency, s.frequency, s.next_billing_date as due_date, s.provider,
        'subscription' as source_type,
        br.days_before, br.is_enabled as reminder_enabled
      FROM subscriptions s
      LEFT JOIN bill_reminders br ON br.subscription_id = s.id AND br.user_id = s.user_id
      WHERE s.user_id = ? AND s.is_active = 1
        AND s.next_billing_date IS NOT NULL
        AND s.next_billing_date <= date('now', '+' || ? || ' days')
        AND s.next_billing_date >= date('now')
      ORDER BY s.next_billing_date ASC
    `).all(userId, days);

    // Upcoming recurring rules
    const rules = db.prepare(`
      SELECT r.id, r.description as name, r.amount, r.currency, r.frequency, r.next_date as due_date, r.payee as provider,
        r.type,
        'recurring' as source_type,
        br.days_before, br.is_enabled as reminder_enabled
      FROM recurring_rules r
      LEFT JOIN bill_reminders br ON br.recurring_rule_id = r.id AND br.user_id = r.user_id
      WHERE r.user_id = ? AND r.is_active = 1
        AND r.next_date <= date('now', '+' || ? || ' days')
        AND r.next_date >= date('now')
      ORDER BY r.next_date ASC
    `).all(userId, days);

    upcoming.push(...subs, ...rules);
    upcoming.sort((a, b) => a.due_date.localeCompare(b.due_date));

    return upcoming;
  }

  return { findAllByUser, findById, create, update, delete: deleteById, getUpcoming };
};
