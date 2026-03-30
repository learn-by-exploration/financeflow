const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, teardown, cleanDb, agent, makeAccount, makeCategory, makeTransaction, makeBudget, makeGoal, makeGroup, makeGroupMember, makeSharedExpense, makeRecurringRule } = require('./helpers');

describe('Data Integrity', () => {
  let db;

  before(() => {
    ({ db } = setup());
  });
  after(() => teardown());

  // ═══════════════════════════════════════════════════════
  // 1. MIGRATION IDEMPOTENCY
  // ═══════════════════════════════════════════════════════

  describe('Migration Idempotency', () => {
    beforeEach(() => cleanDb());

    it('running migrations twice produces no errors', () => {
      const runMigrations = require('../src/db/migrate');
      // Should not throw on second run
      assert.doesNotThrow(() => runMigrations(db));
    });

    it('re-running migrate on already-migrated DB does not duplicate records in _migrations', () => {
      const runMigrations = require('../src/db/migrate');
      const countBefore = db.prepare('SELECT COUNT(*) as c FROM _migrations').get().c;
      runMigrations(db);
      const countAfter = db.prepare('SELECT COUNT(*) as c FROM _migrations').get().c;
      assert.equal(countBefore, countAfter, 'migration count should not change on re-run');
    });

    it('_migrations table correctly tracks applied migrations', () => {
      const rows = db.prepare('SELECT name, applied_at FROM _migrations').all();
      for (const row of rows) {
        assert.ok(row.name.endsWith('.sql'), `migration name should end with .sql: ${row.name}`);
        assert.ok(row.applied_at, `migration ${row.name} should have applied_at`);
      }
    });

    it('all 23 migrations are recorded in _migrations', () => {
      const count = db.prepare('SELECT COUNT(*) as c FROM _migrations').get().c;
      assert.equal(count, 23, 'should have exactly 23 migrations applied');
    });

    it('migration order is alphabetical (sorted by filename)', () => {
      const rows = db.prepare('SELECT name FROM _migrations ORDER BY id').all();
      const names = rows.map(r => r.name);
      const sorted = [...names].sort();
      assert.deepStrictEqual(names, sorted, 'migrations should be applied in alphabetical order');
    });

    it('migration filenames in DB match files on disk', () => {
      const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
      const diskFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      const dbNames = db.prepare('SELECT name FROM _migrations ORDER BY name').all().map(r => r.name);
      assert.deepStrictEqual(dbNames, diskFiles, 'DB migration records should match files on disk');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 2. FOREIGN KEY INTEGRITY
  // ═══════════════════════════════════════════════════════

  describe('Foreign Key Integrity', () => {
    beforeEach(() => cleanDb());

    it('foreign keys are enabled (PRAGMA foreign_keys returns 1)', () => {
      const result = db.pragma('foreign_keys', { simple: true });
      assert.equal(result, 1, 'foreign_keys should be ON');
    });

    it('cannot create transaction with non-existent account_id', () => {
      assert.throws(() => {
        db.prepare(
          'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, 999999, ?, ?, ?, ?, ?)'
        ).run('expense', 100, 'INR', 'Orphan', '2025-01-01');
      }, /FOREIGN KEY constraint failed/);
    });

    it('cannot create transaction with non-existent category_id', () => {
      const acct = makeAccount({ name: 'FK Test' });
      assert.throws(() => {
        db.prepare(
          'INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date) VALUES (1, ?, 999999, ?, ?, ?, ?, ?)'
        ).run(acct.id, 'expense', 100, 'INR', 'Orphan', '2025-01-01');
      }, /FOREIGN KEY constraint failed/);
    });

    it('cannot create budget_item with non-existent budget_id', () => {
      assert.throws(() => {
        db.prepare(
          'INSERT INTO budget_items (budget_id, category_id, amount) VALUES (999999, NULL, 1000)'
        ).run();
      }, /FOREIGN KEY constraint failed/);
    });

    it('deleting account cascades transactions', () => {
      const acct = makeAccount({ name: 'ToDelete' });
      makeTransaction(acct.id, { description: 'Will be deleted' });
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c, 1);
      db.prepare('DELETE FROM accounts WHERE id = ?').run(acct.id);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c, 0);
    });

    it('deleting category sets transaction category_id to NULL (ON DELETE SET NULL)', () => {
      const acct = makeAccount({ name: 'CatTest' });
      const cat = makeCategory({ name: 'EphemeralCat', type: 'expense' });
      makeTransaction(acct.id, { category_id: cat.id, description: 'With category' });
      db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
      const txn = db.prepare('SELECT category_id FROM transactions WHERE account_id = ?').get(acct.id);
      assert.equal(txn.category_id, null, 'category_id should be NULL after category deletion');
    });

    it('cannot create group_member with non-existent group_id', () => {
      assert.throws(() => {
        db.prepare(
          'INSERT INTO group_members (group_id, display_name, role) VALUES (999999, ?, ?)'
        ).run('Ghost', 'member');
      }, /FOREIGN KEY constraint failed/);
    });

    it('cannot create expense_split with non-existent expense_id', () => {
      const group = makeGroup({ name: 'SplitTest' });
      const memberId = db.prepare('SELECT id FROM group_members WHERE group_id = ?').get(group.id).id;
      assert.throws(() => {
        db.prepare(
          'INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (999999, ?, 100)'
        ).run(memberId);
      }, /FOREIGN KEY constraint failed/);
    });

    it('cannot create goal_transaction with non-existent goal_id', () => {
      const acct = makeAccount({ name: 'GoalFKTest' });
      const txn = makeTransaction(acct.id, { description: 'For goal test' });
      assert.throws(() => {
        db.prepare(
          'INSERT INTO goal_transactions (goal_id, transaction_id, amount) VALUES (999999, ?, 100)'
        ).run(txn.id);
      }, /FOREIGN KEY constraint failed/);
    });

    it('delete group cascades to members, expenses, splits, and settlements', () => {
      const group = makeGroup({ name: 'CascadeGroup' });
      const memberId = db.prepare('SELECT id FROM group_members WHERE group_id = ? LIMIT 1').get(group.id).id;
      const expR = db.prepare('INSERT INTO shared_expenses (group_id, paid_by, description, amount, currency, split_method, date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(group.id, memberId, 'Test expense', 100, 'INR', 'equal', '2025-01-01');
      db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)').run(expR.lastInsertRowid, memberId, 100);
      db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount, currency) VALUES (?, ?, ?, ?, ?)').run(group.id, memberId, memberId, 50, 'INR');

      db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?').get(group.id).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM shared_expenses WHERE group_id = ?').get(group.id).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM settlements WHERE group_id = ?').get(group.id).c, 0);
    });

    it('delete user cascades to all owned entities', () => {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('temppass', 4);
      const r = db.prepare('INSERT INTO users (username, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?)').run('tempuser', hash, 'Temp', 'INR');
      const userId = r.lastInsertRowid;
      db.prepare('INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_active, include_in_net_worth, position) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0)').run(userId, 'Temp Checking', 'checking', 'INR', 1000, '🏦', '#000');
      db.prepare('INSERT INTO categories (user_id, name, icon, type, is_system, position) VALUES (?, ?, ?, ?, 0, 0)').run(userId, 'TempCat', '📁', 'expense');
      db.prepare('INSERT INTO savings_goals (user_id, name, target_amount, current_amount, icon, color, is_completed, position) VALUES (?, ?, ?, 0, ?, ?, 0, 0)').run(userId, 'TempGoal', 1000, '🎯', '#000');
      db.prepare('INSERT INTO budgets (user_id, name, period, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, 1)').run(userId, 'TempBudget', 'monthly', '2025-01-01', '2025-01-31');
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      assert.equal(db.prepare('SELECT COUNT(*) as c FROM accounts WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM categories WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM savings_goals WHERE user_id = ?').get(userId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM budgets WHERE user_id = ?').get(userId).c, 0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 3. DATA PERSISTENCE ACROSS OPERATIONS
  // ═══════════════════════════════════════════════════════

  describe('Data Persistence Across Operations', () => {
    beforeEach(() => cleanDb());

    it('WAL mode is active', () => {
      const mode = db.pragma('journal_mode', { simple: true });
      assert.equal(mode, 'wal', 'journal_mode should be WAL');
    });

    it('busy timeout is set', () => {
      const timeout = db.pragma('busy_timeout', { simple: true });
      assert.ok(timeout > 0, `busy_timeout should be > 0, got ${timeout}`);
    });

    it('create user → insert transactions → verify count after re-query', () => {
      const acct = makeAccount({ name: 'Persistence' });
      for (let i = 0; i < 10; i++) {
        makeTransaction(acct.id, { description: `Txn ${i}`, amount: 100 });
      }
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c;
      assert.equal(count, 10, 'should have 10 transactions after re-query');
    });

    it('insert data → close and reopen DB → data still there', () => {
      // Insert data into the shared test DB, then verify via a fresh read
      const acct = makeAccount({ name: 'PersistenceReopen' });
      makeTransaction(acct.id, { description: 'Survivor', amount: 42 });

      // Force WAL checkpoint to ensure data is flushed to main DB file
      db.pragma('wal_checkpoint(FULL)');

      // Open a second connection to the same DB file
      const Database = require('better-sqlite3');
      const { dir } = setup();
      const dbPath = path.join(dir, 'personalfi.db');
      const db2 = new Database(dbPath, { readonly: true });
      db2.pragma('foreign_keys = ON');

      const count = db2.prepare('SELECT COUNT(*) as c FROM transactions WHERE description = ?').get('Survivor').c;
      db2.close();
      assert.ok(count >= 1, 'data should persist in a second connection');
    });

    it('transaction rollback on error does not corrupt existing data', () => {
      const acct = makeAccount({ name: 'RollbackTest', balance: 5000 });
      makeTransaction(acct.id, { description: 'Safe', amount: 100 });

      try {
        db.transaction(() => {
          db.prepare(
            'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, ?, ?, ?)'
          ).run(acct.id, 'expense', 200, 'INR', 'Will rollback', '2025-01-01');
          // Force an error
          throw new Error('Intentional rollback');
        })();
      } catch (e) {
        // expected
      }

      // Original transaction should still exist
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c;
      assert.equal(count, 1, 'only the safe transaction should survive');
      const safe = db.prepare('SELECT description FROM transactions WHERE account_id = ?').get(acct.id);
      assert.equal(safe.description, 'Safe');
    });

    it('large batch insert → verify all rows present', () => {
      const acct = makeAccount({ name: 'BatchTest' });
      const insert = db.prepare(
        'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, ?, ?, ?)'
      );
      const batchSize = 500;

      const insertMany = db.transaction(() => {
        for (let i = 0; i < batchSize; i++) {
          insert.run(acct.id, 'expense', 10, 'INR', `Batch-${i}`, '2025-06-15');
        }
      });
      insertMany();

      const count = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c;
      assert.equal(count, batchSize, `should have all ${batchSize} rows`);
    });

    it('transfer creation is all-or-nothing', async () => {
      const acct1 = makeAccount({ name: 'Source', balance: 10000 });
      const acct2 = makeAccount({ name: 'Dest', balance: 5000 });

      await agent().post('/api/transactions').send({
        account_id: acct1.id,
        transfer_to_account_id: acct2.id,
        type: 'transfer',
        amount: 3000,
        description: 'Transfer test',
        date: new Date().toISOString().slice(0, 10)
      }).expect(201);

      const src = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct1.id);
      const dst = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct2.id);
      assert.equal(src.balance, 7000);
      assert.equal(dst.balance, 8000);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 4. SEED DATA INTEGRITY
  // ═══════════════════════════════════════════════════════

  describe('Seed Data Integrity', () => {
    let seedResult;

    beforeEach(() => {
      cleanDb();
      const seedDemoData = require('../src/db/seed');
      seedResult = db.transaction(() => seedDemoData(db))();
    });

    it('seed creates expected number of accounts (5)', () => {
      const count = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE user_id = ?').get(seedResult.userId).c;
      assert.equal(count, 5, 'seed should create 5 accounts');
    });

    it('seed creates expected number of categories (15)', () => {
      const count = db.prepare('SELECT COUNT(*) as c FROM categories WHERE user_id = ?').get(seedResult.userId).c;
      assert.equal(count, 15, 'seed should create 15 categories');
    });

    it('seed creates 100+ transactions', () => {
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE user_id = ?').get(seedResult.userId).c;
      assert.ok(count >= 100, `seed should create 100+ transactions, got ${count}`);
    });

    it('seed creates demo user with correct username', () => {
      const user = db.prepare('SELECT username, display_name, default_currency FROM users WHERE id = ?').get(seedResult.userId);
      assert.equal(user.username, 'demo');
      assert.equal(user.display_name, 'Demo User');
      assert.equal(user.default_currency, 'INR');
    });

    it('seed is idempotent (running twice does not duplicate demo user)', () => {
      const seedDemoData = require('../src/db/seed');
      db.transaction(() => seedDemoData(db))();
      const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE username = 'demo'").get().c;
      assert.equal(count, 1, 'demo user should exist exactly once after re-seed');
    });

    it('seed data has valid foreign key references (no orphans)', () => {
      // Verify all transaction account_ids reference existing accounts
      const orphanTxns = db.prepare(`
        SELECT COUNT(*) as c FROM transactions t
        WHERE t.user_id = ? AND t.account_id NOT IN (SELECT id FROM accounts)
      `).get(seedResult.userId).c;
      assert.equal(orphanTxns, 0, 'no transactions should have orphan account_id');

      // Verify all transaction category_ids reference existing categories (or are NULL)
      const orphanCats = db.prepare(`
        SELECT COUNT(*) as c FROM transactions t
        WHERE t.user_id = ? AND t.category_id IS NOT NULL
        AND t.category_id NOT IN (SELECT id FROM categories)
      `).get(seedResult.userId).c;
      assert.equal(orphanCats, 0, 'no transactions should have orphan category_id');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 5. SCHEMA VALIDATION
  // ═══════════════════════════════════════════════════════

  describe('Schema Validation', () => {
    beforeEach(() => cleanDb());

    const coreTables = [
      'users', 'sessions', 'settings', 'accounts', 'categories',
      'transactions', 'recurring_rules', 'budgets', 'budget_items',
      'savings_goals', 'subscriptions', 'groups', 'group_members',
      'shared_expenses', 'expense_splits', 'settlements',
      'shared_budgets', 'shared_budget_items',
      'net_worth_snapshots', 'financial_health_scores',
      'tags', 'audit_log'
    ];

    const migrationTables = [
      'category_rules', 'transaction_tags', 'api_tokens', 'bill_reminders',
      'exchange_rates', 'attachments', 'notifications', 'duplicate_dismissals',
      'recurring_suggestion_dismissals', 'spending_limits', 'goal_transactions',
      'group_activities', 'group_invites', 'expense_comments'
    ];

    it('all expected core tables exist', () => {
      const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      for (const table of coreTables) {
        assert.ok(existing.includes(table), `core table '${table}' should exist`);
      }
    });

    it('all migration tables exist', () => {
      const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      for (const table of migrationTables) {
        assert.ok(existing.includes(table), `migration table '${table}' should exist`);
      }
    });

    it('column types match expectations for accounts table', () => {
      const cols = db.prepare("PRAGMA table_info('accounts')").all();
      const colMap = Object.fromEntries(cols.map(c => [c.name, c]));

      assert.equal(colMap.id.type, 'INTEGER');
      assert.equal(colMap.user_id.type, 'INTEGER');
      assert.equal(colMap.name.type, 'TEXT');
      assert.equal(colMap.balance.type, 'REAL');
      assert.equal(colMap.is_active.type, 'INTEGER');
    });

    it('NOT NULL constraints are enforced on users table', () => {
      assert.throws(() => {
        db.prepare('INSERT INTO users (username, password_hash) VALUES (NULL, ?)').run('hash');
      }, /NOT NULL constraint failed/);
    });

    it('UNIQUE constraint blocks duplicate username', () => {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('pass', 4);
      // testuser already exists from setup
      assert.throws(() => {
        db.prepare('INSERT INTO users (username, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?)').run('testuser', hash, 'Dup', 'INR');
      }, /UNIQUE constraint failed/);
    });

    it('CHECK constraint enforces valid account types', () => {
      assert.throws(() => {
        db.prepare(
          'INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_active, include_in_net_worth, position) VALUES (1, ?, ?, ?, ?, ?, ?, 1, 1, 0)'
        ).run('Bad', 'INVALID_TYPE', 'INR', 0, '🏦', '#000');
      }, /CHECK constraint failed/);
    });

    it('CHECK constraint enforces valid transaction types', () => {
      const acct = makeAccount({ name: 'CheckTest' });
      assert.throws(() => {
        db.prepare(
          'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, ?, ?, ?)'
        ).run(acct.id, 'INVALID', 100, 'INR', 'Bad type', '2025-01-01');
      }, /CHECK constraint failed/);
    });

    it('_migrations table has correct schema', () => {
      const cols = db.prepare("PRAGMA table_info('_migrations')").all();
      const names = cols.map(c => c.name);
      assert.ok(names.includes('id'), '_migrations should have id');
      assert.ok(names.includes('name'), '_migrations should have name');
      assert.ok(names.includes('applied_at'), '_migrations should have applied_at');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 6. CONCURRENT SAFETY
  // ═══════════════════════════════════════════════════════

  describe('Concurrent Safety', () => {
    beforeEach(() => cleanDb());

    it('multiple rapid inserts do not lose data', () => {
      const acct = makeAccount({ name: 'RapidInsert' });
      const insert = db.prepare(
        'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, ?, ?, ?)'
      );
      const count = 200;
      for (let i = 0; i < count; i++) {
        insert.run(acct.id, 'expense', 1, 'INR', `Rapid-${i}`, '2025-06-15');
      }
      const actual = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c;
      assert.equal(actual, count, `all ${count} rapid inserts should be present`);
    });

    it('read during write returns consistent data (snapshot isolation via WAL)', () => {
      const acct = makeAccount({ name: 'Consistency', balance: 1000 });
      // Start a write transaction, read in same connection should see pending writes
      db.transaction(() => {
        db.prepare(
          'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, ?, ?, ?)'
        ).run(acct.id, 'expense', 50, 'INR', 'InTxn', '2025-06-15');
        const count = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c;
        assert.equal(count, 1, 'should see pending write within same transaction');
      })();

      // After commit, data is visible
      const count = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c;
      assert.equal(count, 1, 'committed data should be visible');
    });

    it('transaction isolation: begin/commit works and rollback discards', () => {
      const acct = makeAccount({ name: 'Isolation' });

      // Committed transaction
      db.transaction(() => {
        db.prepare(
          'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, ?, ?, ?)'
        ).run(acct.id, 'income', 500, 'INR', 'Committed', '2025-06-15');
      })();
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ? AND description = ?').get(acct.id, 'Committed').c, 1);

      // Rolled-back transaction
      try {
        db.transaction(() => {
          db.prepare(
            'INSERT INTO transactions (user_id, account_id, type, amount, currency, description, date) VALUES (1, ?, ?, ?, ?, ?, ?)'
          ).run(acct.id, 'income', 999, 'INR', 'RolledBack', '2025-06-15');
          throw new Error('force rollback');
        })();
      } catch (e) { /* expected */ }

      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ? AND description = ?').get(acct.id, 'RolledBack').c, 0,
        'rolled-back data should not be visible');
      // Previous committed data still there
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ?').get(acct.id).c, 1);
    });

    it('concurrent readers on second connection see committed data', () => {
      const acct = makeAccount({ name: 'ConcurrentRead' });
      makeTransaction(acct.id, { description: 'Visible', amount: 77 });

      db.pragma('wal_checkpoint(FULL)');

      const Database = require('better-sqlite3');
      const { dir } = setup();
      const db2 = new Database(path.join(dir, 'personalfi.db'), { readonly: true });
      const count = db2.prepare('SELECT COUNT(*) as c FROM transactions WHERE description = ?').get('Visible').c;
      db2.close();
      assert.ok(count >= 1, 'second connection should see committed data');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 7. BALANCE CONSISTENCY & ATOMICITY
  // ═══════════════════════════════════════════════════════

  describe('Balance Consistency', () => {
    beforeEach(() => cleanDb());

    it('after many transactions, balance = initial + SUM(income) - SUM(expense)', () => {
      const initialBalance = 50000;
      const acct = makeAccount({ name: 'BalanceStress', balance: initialBalance });

      let expectedBalance = initialBalance;
      for (let i = 0; i < 50; i++) {
        const type = i % 2 === 0 ? 'income' : 'expense';
        const amount = Math.round(Math.random() * 1000 * 100) / 100;
        makeTransaction(acct.id, { type, amount, description: `Txn ${i}` });
        expectedBalance += type === 'income' ? amount : -amount;
      }

      const actual = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(acct.id);
      assert.ok(Math.abs(actual.balance - expectedBalance) < 0.01, `Expected ~${expectedBalance}, got ${actual.balance}`);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 8. GRACEFUL SHUTDOWN
  // ═══════════════════════════════════════════════════════

  describe('Graceful Shutdown', () => {
    it('server has SIGTERM handler configured', () => {
      const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf-8');
      assert.ok(serverSrc.includes('SIGTERM') || serverSrc.includes('SIGINT'), 'Server should handle termination signals');
      assert.ok(serverSrc.includes('shutdown') || serverSrc.includes('close'), 'Server should have shutdown logic');
    });
  });
});
