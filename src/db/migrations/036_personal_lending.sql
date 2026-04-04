-- v8.0.0 Personal lending tracker (borrow/lend between people)
CREATE TABLE IF NOT EXISTS personal_lending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('lent', 'borrowed')),
  amount REAL NOT NULL,
  outstanding REAL NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  start_date TEXT,
  expected_end_date TEXT,
  purpose TEXT,
  mode TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  notes TEXT,
  is_settled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lending_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lending_id INTEGER NOT NULL REFERENCES personal_lending(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_personal_lending_user ON personal_lending(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_lending_user_settled ON personal_lending(user_id, is_settled);
CREATE INDEX IF NOT EXISTS idx_lending_payments_lending ON lending_payments(lending_id);
