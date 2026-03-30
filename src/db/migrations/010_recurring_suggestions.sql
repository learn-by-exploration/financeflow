-- v0.3.19 Recurring Transaction Auto-Detection
CREATE TABLE IF NOT EXISTS recurring_suggestion_dismissals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, pattern_hash)
);

CREATE INDEX IF NOT EXISTS idx_recurring_suggestion_dismissals_user ON recurring_suggestion_dismissals(user_id);
