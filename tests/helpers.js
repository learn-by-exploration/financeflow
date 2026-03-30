const { tmpdir } = require('os');
const { mkdtempSync, rmSync } = require('fs');
const path = require('path');
const request = require('supertest');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

let _app, _db, _dir, _testSessionToken, _testUserId;

function setup() {
  if (!_app) {
    process.env.NODE_ENV = 'test';
    _dir = mkdtempSync(path.join(tmpdir(), 'personalfi-test-'));
    process.env.DB_DIR = _dir;
    const server = require('../src/server');
    _app = server.app;
    _db = server.db;
    _ensureTestAuth();
  }
  return { app: _app, db: _db, dir: _dir };
}

function _ensureTestAuth() {
  _testUserId = 1;
  const user = _db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!user) {
    const hash = bcrypt.hashSync('testpassword', 4);
    _db.prepare(
      'INSERT INTO users (username, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?)'
    ).run('testuser', hash, 'Test User', 'INR');
  } else {
    const hash = bcrypt.hashSync('testpassword', 4);
    _db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(hash);
  }
  _testSessionToken = 'test-session-' + crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(_testSessionToken).digest('hex');
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  _db.prepare(
    'INSERT OR REPLACE INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
  ).run(_testUserId, tokenHash, expiresAt);
}

function cleanDb() {
  const { db } = setup();
  // Clear in-memory response cache
  const { clearAllCache } = require('../src/middleware/cache');
  clearAllCache();
  // Delete in reverse-dependency order
  db.exec('DELETE FROM expense_splits');
  db.exec('DELETE FROM settlements');
  db.exec('DELETE FROM shared_expenses');
  db.exec('DELETE FROM shared_budget_items');
  db.exec('DELETE FROM shared_budgets');
  db.exec('DELETE FROM group_members');
  db.exec('DELETE FROM groups');
  db.exec('DELETE FROM financial_health_scores');
  db.exec('DELETE FROM net_worth_snapshots');
  db.exec('DELETE FROM budget_items');
  db.exec('DELETE FROM budgets');
  db.exec('DELETE FROM transactions');
  try { db.exec('DELETE FROM transaction_tags'); } catch {}
  try { db.exec('DELETE FROM bill_reminders'); } catch {}
  db.exec('DELETE FROM recurring_rules');
  db.exec('DELETE FROM subscriptions');
  db.exec('DELETE FROM savings_goals');
  db.exec('DELETE FROM accounts');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM settings');
  db.exec('DELETE FROM audit_log');
  // Don't delete users/sessions — test user stays
  try { db.exec('DELETE FROM exchange_rates'); } catch {}
  try { db.exec('DELETE FROM category_rules'); } catch {}
  try { db.exec('DELETE FROM api_tokens'); } catch {}
  try { db.exec('DELETE FROM attachments'); } catch {}
  try { db.exec('DELETE FROM notifications'); } catch {}
  try { db.exec('DELETE FROM duplicate_dismissals'); } catch {}
  try { db.exec('DELETE FROM recurring_suggestion_dismissals'); } catch {}
}

function teardown() {
  if (_db) { try { _db.close(); } catch {} }
  if (_dir) { try { rmSync(_dir, { recursive: true, force: true }); } catch {} }
}

// ─── Factory functions ───

function makeAccount(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Checking', type: 'checking', currency: 'INR', balance: 50000, icon: '🏦', color: '#2563EB', is_active: 1, include_in_net_worth: 1, position: 0, ...overrides };
  const r = db.prepare(
    'INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_active, include_in_net_worth, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(_testUserId, o.name, o.type, o.currency, o.balance, o.icon, o.color, o.is_active, o.include_in_net_worth, o.position);
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(r.lastInsertRowid);
}

function makeCategory(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Category', icon: '🧪', color: '#FF0000', type: 'expense', is_system: 0, position: 0, ...overrides };
  const r = db.prepare(
    'INSERT INTO categories (user_id, name, icon, color, type, is_system, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(_testUserId, o.name, o.icon, o.color, o.type, o.is_system, o.position);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(r.lastInsertRowid);
}

function makeTransaction(accountId, overrides = {}) {
  const { db } = setup();
  const o = { type: 'expense', amount: 100, currency: 'INR', description: 'Test transaction', date: today(), ...overrides };
  const r = db.prepare(
    'INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(_testUserId, accountId, o.category_id || null, o.type, o.amount, o.currency, o.description, o.note || null, o.date);
  // Update account balance
  const delta = o.type === 'income' ? o.amount : -o.amount;
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(delta, accountId);
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(r.lastInsertRowid);
}

function makeBudget(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Budget', period: 'monthly', start_date: today(), end_date: daysFromNow(30), is_active: 1, items: [], ...overrides };
  const r = db.prepare(
    'INSERT INTO budgets (user_id, name, period, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(_testUserId, o.name, o.period, o.start_date, o.end_date, o.is_active);
  const budgetId = r.lastInsertRowid;
  for (const item of o.items) {
    db.prepare('INSERT INTO budget_items (budget_id, category_id, amount, rollover) VALUES (?, ?, ?, ?)').run(
      budgetId, item.category_id, item.amount, item.rollover || 0
    );
  }
  return db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId);
}

function makeSubscription(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Netflix', amount: 199, currency: 'INR', frequency: 'monthly', is_active: 1, ...overrides };
  const r = db.prepare(
    'INSERT INTO subscriptions (user_id, name, amount, currency, frequency, category_id, next_billing_date, provider, is_active, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(_testUserId, o.name, o.amount, o.currency, o.frequency, o.category_id || null, o.next_billing_date || null, o.provider || null, o.is_active, o.notes || null);
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(r.lastInsertRowid);
}

function makeGoal(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Emergency Fund', target_amount: 100000, current_amount: 0, currency: 'INR', icon: '🎯', color: '#22C55E', position: 0, ...overrides };
  const r = db.prepare(
    'INSERT INTO savings_goals (user_id, name, target_amount, current_amount, currency, icon, color, deadline, is_completed, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(_testUserId, o.name, o.target_amount, o.current_amount, o.currency, o.icon, o.color, o.deadline || null, o.is_completed || 0, o.position);
  return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(r.lastInsertRowid);
}

function makeGroup(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Group', icon: '👥', color: '#8B5CF6', ...overrides };
  const r = db.prepare(
    'INSERT INTO groups (name, icon, color, created_by) VALUES (?, ?, ?, ?)'
  ).run(o.name, o.icon, o.color, _testUserId);
  const groupId = r.lastInsertRowid;
  // Add creator as owner
  db.prepare(
    'INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(groupId, _testUserId, 'Test User', 'owner');
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
}

function makeGroupMember(groupId, overrides = {}) {
  const { db } = setup();
  const o = { display_name: 'Guest Member', role: 'member', ...overrides };
  const r = db.prepare(
    'INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(groupId, o.user_id || null, o.display_name, o.role);
  return db.prepare('SELECT * FROM group_members WHERE id = ?').get(r.lastInsertRowid);
}

function makeSharedExpense(groupId, paidByMemberId, overrides = {}) {
  const { db } = setup();
  const o = { amount: 1000, currency: 'INR', description: 'Test expense', date: today(), split_method: 'equal', ...overrides };
  const r = db.prepare(
    'INSERT INTO shared_expenses (group_id, paid_by, amount, currency, description, category_id, date, note, split_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(groupId, paidByMemberId, o.amount, o.currency, o.description, o.category_id || null, o.date, o.note || null, o.split_method);
  const expenseId = r.lastInsertRowid;
  // Auto-create equal splits among all group members
  if (o.split_method === 'equal' && !o.skipSplits) {
    const members = db.prepare('SELECT id FROM group_members WHERE group_id = ?').all(groupId);
    const share = Math.floor(o.amount / members.length * 100) / 100;
    const remainder = Math.round((o.amount - share * members.length) * 100) / 100;
    members.forEach((m, i) => {
      const amt = i === 0 ? share + remainder : share;
      db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)').run(expenseId, m.id, amt);
    });
  }
  return db.prepare('SELECT * FROM shared_expenses WHERE id = ?').get(expenseId);
}

function makeRecurringRule(accountId, overrides = {}) {
  const { db } = setup();
  const o = { type: 'expense', amount: 5000, currency: 'INR', description: 'Monthly rent', frequency: 'monthly', next_date: today(), is_active: 1, ...overrides };
  const r = db.prepare(
    'INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, currency, description, payee, frequency, next_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(_testUserId, accountId, o.category_id || null, o.type, o.amount, o.currency, o.description, o.payee || null, o.frequency, o.next_date, o.end_date || null, o.is_active);
  return db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(r.lastInsertRowid);
}

// ─── Second user for multi-user tests ───

function makeSecondUser(overrides = {}) {
  const { db } = setup();
  const o = { username: 'testuser2', password: 'testpassword2', display_name: 'Test User 2', ...overrides };
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(o.username);
  let userId;
  if (existing) {
    userId = existing.id;
  } else {
    const hash = bcrypt.hashSync(o.password, 4);
    const r = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?)'
    ).run(o.username, hash, o.display_name, 'INR');
    userId = r.lastInsertRowid;
  }
  const token = 'test-session-user2-' + crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, tokenHash, expiresAt);

  const { app } = setup();
  const base = request(app);
  const userAgent = new Proxy(base, {
    get(target, prop) {
      if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(prop)) {
        return (...args) => target[prop](...args).set('X-Session-Token', token);
      }
      return target[prop];
    }
  });

  return { userId, token, agent: userAgent };
}

// ─── HTTP agent proxies ───

function agent() {
  const { app } = setup();
  const base = request(app);
  return new Proxy(base, {
    get(target, prop) {
      if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(prop)) {
        return (...args) => target[prop](...args).set('X-Session-Token', _testSessionToken);
      }
      return target[prop];
    }
  });
}

function rawAgent() {
  const { app } = setup();
  return request(app);
}

// ─── Date helpers ───

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = {
  setup, cleanDb, teardown,
  makeAccount, makeCategory, makeTransaction, makeBudget,
  makeSubscription, makeGoal, makeGroup, makeGroupMember,
  makeSharedExpense, makeRecurringRule, makeSecondUser,
  agent, rawAgent, today, daysFromNow,
};
