-- v0.3.41 Spending Limits & Smart Alerts
CREATE TABLE IF NOT EXISTS spending_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK(period IN ('daily', 'weekly', 'monthly')),
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spending_limits_user ON spending_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_spending_limits_user_category ON spending_limits(user_id, category_id);

-- Expand notification types to include spending limit alerts
-- SQLite doesn't support ALTER CHECK, so we recreate the table
CREATE TABLE IF NOT EXISTS notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('budget_overspend', 'goal_completed', 'bill_upcoming', 'large_transaction', 'system', 'spending_warning', 'spending_exceeded', 'unusual_spending')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO notifications_new SELECT * FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
