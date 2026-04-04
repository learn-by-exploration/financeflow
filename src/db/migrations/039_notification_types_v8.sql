-- 039_notification_types_v8.sql
-- Add new notification types for automation enhancements:
-- challenge_completed, todo_reminder, weekly_digest, streak_milestone,
-- goal_pace_warning, positive_reinforcement, subscription_audit,
-- spending_trend, balance_alert

CREATE TABLE IF NOT EXISTS notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN (
    'budget_overspend', 'goal_completed', 'bill_upcoming', 'large_transaction', 'system',
    'spending_warning', 'spending_exceeded', 'unusual_spending', 'split_reminder',
    'budget_warning', 'budget_exceeded', 'inactivity_nudge', 'monthly_digest',
    'milestone', 'new_ip_login', 'financial_tip',
    'challenge_completed', 'todo_reminder', 'weekly_digest', 'streak_milestone',
    'goal_pace_warning', 'positive_reinforcement', 'subscription_audit',
    'spending_trend', 'balance_alert'
  )),
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
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);
