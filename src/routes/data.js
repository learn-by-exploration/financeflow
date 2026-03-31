const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { safePatternTest } = require('../utils/safe-regex');
const logger = require('../logger');

module.exports = function createDataRoutes({ db }) {

  function createExportSnapshot(db, userId) {
    const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(userId);
    const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(userId);
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(userId);
    const recurringRules = db.prepare('SELECT * FROM recurring_rules WHERE user_id = ?').all(userId);
    const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId).map(b => {
      b.items = db.prepare('SELECT * FROM budget_items WHERE budget_id = ?').all(b.id);
      return b;
    });
    const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);
    const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId);
    const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').all(userId);
    const rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ?').all(userId);
    return { exported_at: new Date().toISOString(), version: '1.0', accounts, categories, transactions, recurring_rules: recurringRules, budgets, goals, subscriptions, settings, rules };
  }

  // GET /api/data/export — complete JSON export of user data
  router.get('/export', (req, res, next) => {
    try {
      const userId = req.user.id;

      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(userId);
      const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(userId);
      const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(userId);
      const recurringRules = db.prepare('SELECT * FROM recurring_rules WHERE user_id = ?').all(userId);

      const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId).map(b => {
        b.items = db.prepare('SELECT * FROM budget_items WHERE budget_id = ?').all(b.id);
        return b;
      });

      const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);
      const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId);
      const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').all(userId);
      const rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ?').all(userId);

      // Groups the user belongs to
      const groups = db.prepare(`
        SELECT g.* FROM groups g
        JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = ?
      `).all(userId).map(g => {
        g.members = db.prepare('SELECT * FROM group_members WHERE group_id = ?').all(g.id);
        g.expenses = db.prepare('SELECT * FROM shared_expenses WHERE group_id = ?').all(g.id).map(e => {
          e.splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(e.id);
          return e;
        });
        g.settlements = db.prepare('SELECT * FROM settlements WHERE group_id = ?').all(g.id);
        return g;
      });

      res.json({
        exported_at: new Date().toISOString(),
        version: '1.0',
        accounts,
        categories,
        transactions,
        recurring_rules: recurringRules,
        budgets,
        goals,
        subscriptions,
        settings,
        rules,
        groups,
      });
    } catch (err) { next(err); }
  });

  // POST /api/data/import — destructive import from JSON
  router.post('/import', (req, res, next) => {
    try {
      const { password, data, confirm } = req.body;
      if (!password) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Password confirmation required' } });
      }

      // Verify password
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!bcrypt.compareSync(password, user.password_hash)) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid password' } });
      }

      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid import data' } });
      }

      // Require explicit confirmation for destructive import
      if (!confirm) {
        return res.status(400).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Confirm destructive import by sending confirm: "DELETE ALL DATA"' } });
      }
      if (confirm !== 'DELETE ALL DATA') {
        return res.status(400).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Confirm value must be exactly "DELETE ALL DATA"' } });
      }

      const userId = req.user.id;

      // Atomic import using transaction
      const importTx = db.transaction(() => {
        // Delete existing data (reverse dependency order)
        db.prepare('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM shared_expenses WHERE group_id IN (SELECT g.id FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?))').run(userId);
        db.prepare('DELETE FROM shared_expenses WHERE group_id IN (SELECT g.id FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?)').run(userId);
        db.prepare('DELETE FROM settlements WHERE group_id IN (SELECT g.id FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?)').run(userId);
        db.prepare('DELETE FROM group_members WHERE group_id IN (SELECT g.id FROM groups g WHERE g.created_by = ?)').run(userId);
        db.prepare('DELETE FROM groups WHERE created_by = ?').run(userId);
        db.prepare('DELETE FROM category_rules WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM budget_items WHERE budget_id IN (SELECT id FROM budgets WHERE user_id = ?)').run(userId);
        db.prepare('DELETE FROM budgets WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM recurring_rules WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM savings_goals WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM categories WHERE user_id = ?').run(userId);

        // ID mapping for references
        const categoryMap = {};
        const accountMap = {};
        const budgetMap = {};

        // Import categories
        if (Array.isArray(data.categories)) {
          const catInsert = db.prepare('INSERT INTO categories (user_id, name, icon, color, type, is_system, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
          for (const c of data.categories) {
            const r = catInsert.run(userId, c.name, c.icon || '📁', c.color || '#666', c.type || 'expense', c.is_system || 0, c.position || 0);
            categoryMap[c.id] = r.lastInsertRowid;
          }
        }

        // Import accounts
        if (Array.isArray(data.accounts)) {
          const acctInsert = db.prepare('INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_active, include_in_net_worth, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          for (const a of data.accounts) {
            const r = acctInsert.run(userId, a.name, a.type || 'checking', a.currency || 'INR', a.balance || 0, a.icon || '🏦', a.color || '#2563EB', a.is_active != null ? a.is_active : 1, a.include_in_net_worth != null ? a.include_in_net_worth : 1, a.position || 0);
            accountMap[a.id] = r.lastInsertRowid;
          }
        }

        // Import transactions
        if (Array.isArray(data.transactions)) {
          const txInsert = db.prepare('INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, note, date, payee, tags, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          for (const t of data.transactions) {
            const mappedAcct = accountMap[t.account_id] || t.account_id;
            const mappedCat = t.category_id ? (categoryMap[t.category_id] || t.category_id) : null;
            txInsert.run(userId, mappedAcct, mappedCat, t.type, t.amount, t.currency || 'INR', t.description, t.note || null, t.date, t.payee || null, typeof t.tags === 'string' ? t.tags : JSON.stringify(t.tags || []), t.is_recurring || 0);
          }
        }

        // Import budgets
        if (Array.isArray(data.budgets)) {
          const budgetInsert = db.prepare('INSERT INTO budgets (user_id, name, period, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)');
          const itemInsert = db.prepare('INSERT INTO budget_items (budget_id, category_id, amount, rollover) VALUES (?, ?, ?, ?)');
          for (const b of data.budgets) {
            const r = budgetInsert.run(userId, b.name, b.period, b.start_date, b.end_date, b.is_active != null ? b.is_active : 1);
            budgetMap[b.id] = r.lastInsertRowid;
            if (Array.isArray(b.items)) {
              for (const item of b.items) {
                const mappedCat = item.category_id ? (categoryMap[item.category_id] || item.category_id) : null;
                itemInsert.run(r.lastInsertRowid, mappedCat, item.amount, item.rollover || 0);
              }
            }
          }
        }

        // Import goals
        if (Array.isArray(data.goals)) {
          const goalInsert = db.prepare('INSERT INTO savings_goals (user_id, name, target_amount, current_amount, deadline, icon, color, is_completed, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
          for (const g of data.goals) {
            goalInsert.run(userId, g.name, g.target_amount, g.current_amount || 0, g.deadline || null, g.icon || '🎯', g.color || '#10b981', g.is_completed || 0, g.position || 0);
          }
        }

        // Import subscriptions
        if (Array.isArray(data.subscriptions)) {
          const subInsert = db.prepare('INSERT INTO subscriptions (user_id, name, amount, currency, frequency, next_billing_date, category_id, provider, is_active, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          for (const s of data.subscriptions) {
            const mappedCat = s.category_id ? (categoryMap[s.category_id] || s.category_id) : null;
            subInsert.run(userId, s.name, s.amount, s.currency || 'INR', s.frequency, s.next_billing_date || null, mappedCat, s.provider || null, s.is_active != null ? s.is_active : 1, s.notes || null);
          }
        }

        // Import settings (filtered by allowed keys)
        if (Array.isArray(data.settings)) {
          const ALLOWED_SETTING_KEYS = ['default_currency', 'date_format', 'dashboard_layout'];
          const settInsert = db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)');
          for (const s of data.settings) {
            if (ALLOWED_SETTING_KEYS.includes(s.key)) {
              settInsert.run(userId, s.key, s.value);
            }
          }
        }

        // Import rules
        if (Array.isArray(data.rules)) {
          const ruleInsert = db.prepare('INSERT INTO category_rules (user_id, pattern, category_id, is_system, position) VALUES (?, ?, ?, ?, ?)');
          for (const r of data.rules) {
            const mappedCat = r.category_id ? (categoryMap[r.category_id] || r.category_id) : null;
            ruleInsert.run(userId, r.pattern, mappedCat, r.is_system || 0, r.position || 0);
          }
        }

        // Import recurring rules
        if (Array.isArray(data.recurring_rules)) {
          const rrInsert = db.prepare('INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, currency, description, payee, frequency, next_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          for (const rr of data.recurring_rules) {
            const mappedAcct = accountMap[rr.account_id] || rr.account_id;
            const mappedCat = rr.category_id ? (categoryMap[rr.category_id] || rr.category_id) : null;
            rrInsert.run(userId, mappedAcct, mappedCat, rr.type, rr.amount, rr.currency || 'INR', rr.description, rr.payee || null, rr.frequency, rr.next_date, rr.end_date || null, rr.is_active != null ? rr.is_active : 1);
          }
        }

        // Import groups
        if (Array.isArray(data.groups)) {
          const groupInsert = db.prepare('INSERT INTO groups (name, icon, color, created_by) VALUES (?, ?, ?, ?)');
          const memberInsert = db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)');
          const expenseInsert = db.prepare('INSERT INTO shared_expenses (group_id, paid_by, amount, currency, description, category_id, date, note, split_method, is_settled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          const splitInsert = db.prepare('INSERT INTO expense_splits (expense_id, member_id, amount, is_settled) VALUES (?, ?, ?, ?)');
          const settlementInsert = db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount, currency, note) VALUES (?, ?, ?, ?, ?, ?)');

          for (const g of data.groups) {
            const gr = groupInsert.run(g.name, g.icon || '👥', g.color || '#f59e0b', userId);
            const newGroupId = gr.lastInsertRowid;
            const memberMap = {};

            if (Array.isArray(g.members)) {
              for (const m of g.members) {
                const mr = memberInsert.run(newGroupId, m.user_id || null, m.display_name, m.role || 'member');
                memberMap[m.id] = mr.lastInsertRowid;
              }
            }

            if (Array.isArray(g.expenses)) {
              for (const e of g.expenses) {
                const mappedPaidBy = memberMap[e.paid_by] || e.paid_by;
                const mappedCat = e.category_id ? (categoryMap[e.category_id] || e.category_id) : null;
                const er = expenseInsert.run(newGroupId, mappedPaidBy, e.amount, e.currency || 'INR', e.description, mappedCat, e.date, e.note || null, e.split_method || 'equal', e.is_settled || 0);
                const newExpenseId = er.lastInsertRowid;
                if (Array.isArray(e.splits)) {
                  for (const s of e.splits) {
                    const mappedMember = memberMap[s.member_id] || s.member_id;
                    splitInsert.run(newExpenseId, mappedMember, s.amount, s.is_settled || 0);
                  }
                }
              }
            }

            if (Array.isArray(g.settlements)) {
              for (const s of g.settlements) {
                const mappedFrom = memberMap[s.from_member] || s.from_member;
                const mappedTo = memberMap[s.to_member] || s.to_member;
                settlementInsert.run(newGroupId, mappedFrom, mappedTo, s.amount, s.currency || 'INR', s.note || null);
              }
            }
          }
        }
      });

      // Auto-backup before destructive import
      const backup = createExportSnapshot(db, userId);

      try {
        importTx();
      } catch (err) {
        logger.error({ err, userId }, 'Data import failed');
        return res.status(400).json({ error: { code: 'IMPORT_ERROR', message: 'Import failed due to invalid data' } });
      }

      res.json({ ok: true, backup });
    } catch (err) { next(err); }
  });

  // GET /api/data/csv-template — download CSV template
  router.get('/csv-template', (req, res) => {
    const template = 'date,description,amount,type,category\n2025-01-15,Salary,50000,income,\n2025-01-16,Lunch,500,expense,Food & Dining\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="personalfi-template.csv"');
    res.send(template);
  });

  // POST /api/data/csv-import — import CSV transactions
  router.post('/csv-import', express.text({ type: '*/*' }), (req, res, next) => {
    try {
      const accountId = req.query.account_id;
      if (!accountId) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'account_id query parameter is required' } });
      }

      // Validate account exists and belongs to user
      const account = db.prepare('SELECT id, currency FROM accounts WHERE id = ? AND user_id = ?').get(accountId, req.user.id);
      if (!account) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account not found' } });
      }
      const accountCurrency = account.currency || 'INR';

      const csvText = typeof req.body === 'string' ? req.body : '';
      const lines = csvText.split('\n').filter(l => l.trim());
      if (lines.length === 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Empty CSV' } });
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredCols = ['date', 'description', 'amount', 'type'];
      for (const col of requiredCols) {
        if (!header.includes(col)) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Missing required column: ${col}` } });
        }
      }

      const dateIdx = header.indexOf('date');
      const descIdx = header.indexOf('description');
      const amountIdx = header.indexOf('amount');
      const typeIdx = header.indexOf('type');
      const catIdx = header.indexOf('category');

      // Load rules for auto-categorization
      const rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ? ORDER BY position ASC, id ASC').all(req.user.id);
      const categoryLookup = {};
      const cats = db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(req.user.id);
      for (const c of cats) {
        categoryLookup[c.name.toLowerCase()] = c.id;
      }

      let imported = 0;
      let categorized = 0;
      let uncategorized = 0;

      const userId = req.user.id;
      const txInsert = db.prepare('INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'[]\')');
      const balanceUpdate = db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?');

      const importTx = db.transaction(() => {
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          const date = cols[dateIdx];
          const description = cols[descIdx];
          const amount = parseFloat(cols[amountIdx]);
          const type = cols[typeIdx];

          if (!date || !description || isNaN(amount) || !type) continue;
          if (!['income', 'expense', 'transfer'].includes(type)) continue;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

          // Resolve category
          let categoryId = null;
          if (catIdx >= 0 && cols[catIdx]) {
            categoryId = categoryLookup[cols[catIdx].toLowerCase()] || null;
          }

          // Auto-categorize if no category
          if (!categoryId) {
            for (const rule of rules) {
              if (safePatternTest(rule.pattern, description)) {
                categoryId = rule.category_id;
                break;
              }
            }
          }

          if (categoryId) categorized++;
          else uncategorized++;

          txInsert.run(userId, accountId, categoryId, type, amount, accountCurrency, description, date);
          const balanceChange = type === 'income' ? amount : -amount;
          balanceUpdate.run(Math.round((balanceChange + Number.EPSILON) * 100) / 100, accountId, userId);
          imported++;
        }
      });
      importTx();

      res.json({ imported, categorized, uncategorized });
    } catch (err) { next(err); }
  });

  return router;
};
