const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, agent, cleanDb, makeAccount, makeCategory, makeTransaction, makeBudget, today, daysFromNow } = require('./helpers');

describe('Phase 6 – Core UX Improvements', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = setup());
    cleanDb();
  });

  // ─── 6.1 Sidebar Navigation Grouping ──────────────────────────────────

  describe('Sidebar Navigation Grouping', () => {
    const indexHtml = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'index.html'), 'utf-8'
    );

    it('has .nav-group containers', () => {
      assert.ok(indexHtml.includes('nav-group'), 'index.html should have nav-group containers');
      // Should have groups for Core, Planning, Social, Analysis, System
      const groupCount = (indexHtml.match(/class="nav-group"/g) || []).length;
      assert.ok(groupCount >= 5, `Expected at least 5 nav-group containers, found ${groupCount}`);
    });

    it('each nav-group has a .nav-group-header', () => {
      const groups = (indexHtml.match(/class="nav-group"/g) || []).length;
      const headers = (indexHtml.match(/class="nav-group-header"/g) || []).length;
      assert.equal(headers, groups, 'Each nav-group should have a nav-group-header');
    });

    it('nav-group-headers have aria-expanded attribute', () => {
      const headers = indexHtml.match(/nav-group-header[^>]*/g) || [];
      for (const header of headers) {
        assert.ok(header.includes('aria-expanded'), `nav-group-header should have aria-expanded: ${header}`);
      }
    });

    it('all nav items still exist within groups', () => {
      const expectedViews = [
        'dashboard', 'transactions', 'accounts', 'categories',
        'budgets', 'subscriptions', 'goals', 'recurring',
        'groups', 'splits',
        'health', 'reports', 'rules', 'insights', 'calendar',
        'export', 'whats-new'
      ];
      for (const view of expectedViews) {
        assert.ok(
          indexHtml.includes(`data-view="${view}"`),
          `Nav item for "${view}" should exist in sidebar`
        );
      }
    });

    it('nav-divider elements are removed', () => {
      assert.ok(
        !indexHtml.includes('nav-divider'),
        'nav-divider elements should be removed (replaced by groups)'
      );
    });
  });

  // ─── 6.2 Keyboard Shortcuts Enhancement ───────────────────────────────

  describe('Keyboard Shortcuts Enhancement', () => {
    const appJs = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8'
    );

    it('has key handler for ? (shortcuts help)', () => {
      assert.ok(
        appJs.includes("'?'") || appJs.includes('"?"'),
        'app.js should have a keyboard handler for ?'
      );
    });

    it('has key handlers for d, t, b, g', () => {
      for (const key of ['d', 't', 'b', 'g']) {
        assert.ok(
          appJs.includes(`'${key}'`) || appJs.includes(`"${key}"`),
          `app.js should have a keyboard handler for '${key}'`
        );
      }
    });

    it('shortcuts are not active when input is focused (INPUT/TEXTAREA guard)', () => {
      // The handler should check e.target.tagName for INPUT/TEXTAREA/SELECT
      assert.ok(
        appJs.includes('INPUT') && appJs.includes('TEXTAREA'),
        'app.js should guard keyboard shortcuts against INPUT and TEXTAREA focus'
      );
    });

    it('has showShortcutsHelp function', () => {
      assert.ok(
        appJs.includes('showShortcutsHelp'),
        'app.js should define a showShortcutsHelp function'
      );
    });
  });

  // ─── 6.3 Budget Threshold Notifications ───────────────────────────────

  describe('Budget Threshold Notifications', () => {
    it('creating a transaction that pushes budget to 80% creates a notification', async () => {
      const account = makeAccount();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budget = makeBudget({
        name: 'Monthly',
        period: 'monthly',
        start_date: today(),
        end_date: daysFromNow(30),
        items: [{ category_id: cat.id, amount: 1000 }]
      });

      // Create a transaction for 800 (80% of 1000)
      const res = await agent(app).post('/api/transactions').send({
        account_id: account.id,
        category_id: cat.id,
        type: 'expense',
        amount: 800,
        description: 'Groceries',
        date: today()
      });
      assert.equal(res.status, 201);

      // Check notifications
      const notifs = db.prepare(
        "SELECT * FROM notifications WHERE user_id = 1 AND type = 'budget_warning'"
      ).all();
      assert.ok(notifs.length >= 1, 'Should create a budget warning notification at 80%');
      assert.ok(notifs[0].message.includes('80%'), 'Notification message should mention 80%');
    });

    it('creating a transaction that pushes budget to 100% creates a notification', async () => {
      const account = makeAccount();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budget = makeBudget({
        name: 'Monthly',
        period: 'monthly',
        start_date: today(),
        end_date: daysFromNow(30),
        items: [{ category_id: cat.id, amount: 1000 }]
      });

      // Create a transaction for 1000 (100% of 1000)
      const res = await agent(app).post('/api/transactions').send({
        account_id: account.id,
        category_id: cat.id,
        type: 'expense',
        amount: 1000,
        description: 'Big grocery haul',
        date: today()
      });
      assert.equal(res.status, 201);

      const notifs = db.prepare(
        "SELECT * FROM notifications WHERE user_id = 1 AND type = 'budget_exceeded'"
      ).all();
      assert.ok(notifs.length >= 1, 'Should create a budget exceeded notification at 100%');
      assert.ok(notifs[0].message.includes('100%'), 'Notification message should mention 100%');
    });

    it('budget at 79% does NOT create a notification', async () => {
      const account = makeAccount();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budget = makeBudget({
        name: 'Monthly',
        period: 'monthly',
        start_date: today(),
        end_date: daysFromNow(30),
        items: [{ category_id: cat.id, amount: 1000 }]
      });

      // Create a transaction for 790 (79% of 1000)
      const res = await agent(app).post('/api/transactions').send({
        account_id: account.id,
        category_id: cat.id,
        type: 'expense',
        amount: 790,
        description: 'Some groceries',
        date: today()
      });
      assert.equal(res.status, 201);

      const notifs = db.prepare(
        "SELECT * FROM notifications WHERE user_id = 1 AND type IN ('budget_warning', 'budget_exceeded')"
      ).all();
      assert.equal(notifs.length, 0, 'Should NOT create a budget notification at 79%');
    });

    it('no duplicate notification for same budget+threshold in same period', async () => {
      const account = makeAccount();
      const cat = makeCategory({ name: 'Food', type: 'expense' });
      const budget = makeBudget({
        name: 'Monthly',
        period: 'monthly',
        start_date: today(),
        end_date: daysFromNow(30),
        items: [{ category_id: cat.id, amount: 1000 }]
      });

      // First transaction: 800 (80%)
      await agent(app).post('/api/transactions').send({
        account_id: account.id,
        category_id: cat.id,
        type: 'expense',
        amount: 800,
        description: 'First purchase',
        date: today()
      });

      // Second transaction: 50 more (still above 80%, now 85%)
      await agent(app).post('/api/transactions').send({
        account_id: account.id,
        category_id: cat.id,
        type: 'expense',
        amount: 50,
        description: 'Second purchase',
        date: today()
      });

      const notifs = db.prepare(
        "SELECT * FROM notifications WHERE user_id = 1 AND type = 'budget_warning'"
      ).all();
      assert.equal(notifs.length, 1, 'Should NOT create duplicate budget warning notification');
    });
  });

  // ─── 6.4 Health Score Breakdown ───────────────────────────────────────

  describe('Health Score Breakdown', () => {
    function seedHealthData() {
      const account = makeAccount({ type: 'savings', balance: 100000 });
      const cat = makeCategory({ name: 'Salary', type: 'income' });
      const expCat = makeCategory({ name: 'Food', type: 'expense' });

      // Create 3+ months of transaction data (so we pass the 30-day gate)
      const months = [0, 1, 2, 3];
      for (const m of months) {
        const d = new Date();
        d.setMonth(d.getMonth() - m);
        const dateStr = d.toISOString().slice(0, 10);
        makeTransaction(account.id, {
          type: 'income',
          amount: 50000,
          category_id: cat.id,
          description: 'Salary',
          date: dateStr
        });
        makeTransaction(account.id, {
          type: 'expense',
          amount: 30000,
          category_id: expCat.id,
          description: 'Food',
          date: dateStr
        });
      }

      return { account, cat, expCat };
    }

    it('GET /api/stats/financial-health includes ratios array', async () => {
      seedHealthData();

      const res = await agent(app).get('/api/stats/financial-health').expect(200);
      assert.ok(res.body.ratios, 'Response should include ratios array');
      assert.ok(Array.isArray(res.body.ratios), 'ratios should be an array');
      assert.ok(res.body.ratios.length > 0, 'ratios should not be empty');
    });

    it('each ratio has name, value, score, recommendation', async () => {
      seedHealthData();

      const res = await agent(app).get('/api/stats/financial-health').expect(200);
      for (const ratio of res.body.ratios) {
        assert.ok(typeof ratio.name === 'string', `ratio should have a name: ${JSON.stringify(ratio)}`);
        assert.ok(typeof ratio.value === 'number', `ratio should have a numeric value: ${JSON.stringify(ratio)}`);
        assert.ok(typeof ratio.score === 'number', `ratio should have a numeric score: ${JSON.stringify(ratio)}`);
        assert.ok(typeof ratio.max === 'number', `ratio should have a numeric max: ${JSON.stringify(ratio)}`);
        assert.ok(typeof ratio.recommendation === 'string', `ratio should have a recommendation: ${JSON.stringify(ratio)}`);
      }
    });

    it('health score matches sum of ratio scores', async () => {
      seedHealthData();

      const res = await agent(app).get('/api/stats/financial-health').expect(200);
      const ratioScoreSum = res.body.ratios.reduce((sum, r) => sum + r.score, 0);
      // The base score (50) + ratio scores should equal the total score
      assert.equal(res.body.score, ratioScoreSum, 'Score should equal sum of individual ratio scores');
    });
  });
});
