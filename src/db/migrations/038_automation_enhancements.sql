-- 038_automation_enhancements.sql
-- Advanced automation: balance alerts, tag rules, automation log, streak tracking

-- Balance threshold alerts (A3)
CREATE TABLE IF NOT EXISTS balance_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  threshold_amount REAL NOT NULL,
  direction TEXT NOT NULL DEFAULT 'below' CHECK(direction IN ('below', 'above')),
  is_enabled INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_balance_alerts_user ON balance_alerts(user_id, is_enabled);

-- Auto-tagging rules (A4)
CREATE TABLE IF NOT EXISTS tag_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  tag TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'description' CHECK(match_type IN ('description', 'amount_above', 'amount_below')),
  match_value REAL,
  position INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tag_rules_user ON tag_rules(user_id, is_enabled);

-- Automation activity log (U4)
CREATE TABLE IF NOT EXISTS automation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_log_user ON automation_log(user_id, created_at);

-- Streak tracking data stored in settings as JSON, but we add a helper table for daily check-ins
CREATE TABLE IF NOT EXISTS streak_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_streak_tracking_user ON streak_tracking(user_id);
