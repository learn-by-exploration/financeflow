-- v0.3.7 Bill Reminders & Upcoming Expenses
CREATE TABLE IF NOT EXISTS bill_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  recurring_rule_id INTEGER REFERENCES recurring_rules(id) ON DELETE CASCADE,
  days_before INTEGER NOT NULL DEFAULT 3,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (subscription_id IS NOT NULL AND recurring_rule_id IS NULL) OR
    (subscription_id IS NULL AND recurring_rule_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_bill_reminders_user ON bill_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_reminders_subscription ON bill_reminders(subscription_id);
CREATE INDEX IF NOT EXISTS idx_bill_reminders_recurring ON bill_reminders(recurring_rule_id);
