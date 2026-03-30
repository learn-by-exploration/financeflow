-- v0.3.37 Goal-Transaction Linking & Savings Automation
CREATE TABLE IF NOT EXISTS goal_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(goal_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_transactions_goal ON goal_transactions(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_transactions_transaction ON goal_transactions(transaction_id);

ALTER TABLE savings_goals ADD COLUMN auto_allocate_percent REAL DEFAULT 0;
