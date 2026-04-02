const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../logger');

function initDatabase(dbDir) {
  const dbPath = path.join(dbDir, 'personalfi.db');
  const db = new Database(dbPath);

  // Performance & safety
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Layer 2: WAL checkpoint on startup — recover any orphaned WAL data from crashes
  db.pragma('wal_checkpoint(TRUNCATE)');

  // ─── Schema ───

  db.exec(`
    -- ═══════════════════════════════════════════
    -- USERS & AUTH
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      default_currency TEXT NOT NULL DEFAULT 'INR',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    );

    -- ═══════════════════════════════════════════
    -- ACCOUNTS (bank accounts, wallets, credit cards)
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'wallet', 'other')),
      currency TEXT NOT NULL DEFAULT 'INR',
      balance REAL NOT NULL DEFAULT 0,
      icon TEXT DEFAULT '🏦',
      color TEXT DEFAULT '#6366f1',
      institution TEXT,
      account_number_last4 TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      include_in_net_worth INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════
    -- CATEGORIES
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📁',
      color TEXT DEFAULT '#8b5cf6',
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════
    -- TRANSACTIONS
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      description TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      payee TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurring_rule_id INTEGER REFERENCES recurring_rules(id) ON DELETE SET NULL,
      transfer_to_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      transfer_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      tags TEXT DEFAULT '[]',
      receipt_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

    -- ═══════════════════════════════════════════
    -- RECURRING RULES
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      description TEXT NOT NULL,
      payee TEXT,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
      next_date TEXT NOT NULL,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════
    -- BUDGETS
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      rollover INTEGER NOT NULL DEFAULT 0
    );

    -- ═══════════════════════════════════════════
    -- SAVINGS GOALS
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      icon TEXT DEFAULT '🎯',
      color TEXT DEFAULT '#10b981',
      deadline TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════
    -- SUBSCRIPTIONS
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      next_billing_date TEXT,
      provider TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════
    -- COLLABORATION: GROUPS & SPLITTING
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '👥',
      color TEXT DEFAULT '#f59e0b',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS shared_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      paid_by INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      description TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      note TEXT,
      split_method TEXT NOT NULL DEFAULT 'equal' CHECK(split_method IN ('equal', 'exact', 'percentage', 'shares')),
      is_settled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      is_settled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      from_member INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
      to_member INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      note TEXT,
      settled_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════
    -- SHARED BUDGETS (household / couple)
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS shared_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shared_budget_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shared_budget_id INTEGER NOT NULL REFERENCES shared_budgets(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      amount REAL NOT NULL
    );

    -- ═══════════════════════════════════════════
    -- FINANCIAL HEALTH & SNAPSHOTS
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      total_assets REAL NOT NULL DEFAULT 0,
      total_liabilities REAL NOT NULL DEFAULT 0,
      net_worth REAL NOT NULL DEFAULT 0,
      breakdown TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS financial_health_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      overall_score INTEGER,
      savings_rate REAL,
      debt_to_income REAL,
      emergency_fund_months REAL,
      budget_adherence REAL,
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );

    -- ═══════════════════════════════════════════
    -- TAGS
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      UNIQUE(user_id, name)
    );

    -- ═══════════════════════════════════════════
    -- AUDIT LOG
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);

    -- ═══════════════════════════════════════════
    -- DATA WATERMARK (data loss detection)
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS _data_watermark (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      peak_users INTEGER NOT NULL DEFAULT 0,
      peak_transactions INTEGER NOT NULL DEFAULT 0,
      peak_accounts INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO _data_watermark (id, peak_users, peak_transactions, peak_accounts) VALUES (1, 0, 0, 0);

    -- ═══════════════════════════════════════════
    -- SYSTEM METADATA (seed markers, etc.)
    -- ═══════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS _system_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  logger.info(`Database initialized at ${dbPath}`);

  // Run migrations
  const runMigrations = require('./migrate');
  runMigrations(db, logger);

  return { db };
}

module.exports = initDatabase;
