-- v0.3.18 Duplicate Transaction Detection
CREATE TABLE IF NOT EXISTS duplicate_dismissals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id_1 INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  transaction_id_2 INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(transaction_id_1, transaction_id_2)
);

CREATE INDEX IF NOT EXISTS idx_duplicate_dismissals_user ON duplicate_dismissals(user_id);
