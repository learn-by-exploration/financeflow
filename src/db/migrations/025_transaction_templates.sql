CREATE TABLE IF NOT EXISTS transaction_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount REAL,
  type TEXT DEFAULT 'expense',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON transaction_templates(user_id);
