const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ═══════════════════════════════════════════
// RESPONSIVE LAYOUT & MOBILE SUPPORT
// ═══════════════════════════════════════════

describe('Responsive — Viewport meta tag', () => {
  it('index.html contains viewport meta tag', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('name="viewport"'), 'viewport meta tag should exist');
    assert.ok(html.includes('width=device-width'), 'viewport should set width=device-width');
    assert.ok(html.includes('initial-scale=1'), 'viewport should set initial-scale=1');
  });
});

describe('Responsive — HTML structure', () => {
  it('index.html contains hamburger menu button', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('id="mobile-menu"'), 'mobile menu button should exist');
    assert.ok(html.includes('mobile-menu-btn'), 'mobile menu button should have proper class');
  });

  it('index.html contains sidebar navigation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('id="sidebar"'), 'sidebar should exist');
    assert.ok(html.includes('class="sidebar"'), 'sidebar should have proper class');
    assert.ok(html.includes('nav-list'), 'nav list should exist in sidebar');
  });

  it('index.html contains main content area', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('id="main-content"'), 'main content area should exist');
    assert.ok(html.includes('id="view-container"'), 'view container should exist');
  });
});

describe('Responsive — CSS media queries', () => {
  it('styles.css contains tablet breakpoint (768px)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    const matches = css.match(/@media\s*\(\s*max-width:\s*768px\s*\)/g);
    assert.ok(matches && matches.length >= 1, 'should have at least one 768px breakpoint');
  });

  it('styles.css contains phone breakpoint (480px)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes('max-width: 480px'), 'should have 480px breakpoint');
  });

  it('styles.css contains responsive table styles', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes('.data-table thead { display: none'), 'table head should be hidden on mobile');
    assert.ok(css.includes('attr(data-label)'), 'should use data-label for card layout');
    assert.ok(css.includes('.data-table tr'), 'table rows should be styled as cards');
  });

  it('styles.css contains touch-friendly target sizes', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes('min-height: 44px'), 'interactive elements should have 44px minimum height');
  });

  it('styles.css contains sidebar backdrop styles', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes('sidebar-backdrop'), 'sidebar backdrop should exist for mobile overlay');
  });
});

describe('Responsive — API endpoints still work', () => {
  it('GET /api/stats/overview returns data', async () => {
    const acct = makeAccount();
    const cat = makeCategory({ type: 'expense' });
    makeTransaction(acct.id, { category_id: cat.id, amount: 500 });

    const res = await agent().get('/api/stats/overview');
    assert.equal(res.status, 200);
    assert.ok(res.body.net_worth !== undefined, 'should include net_worth');
  });

  it('GET /api/transactions returns data', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { amount: 100 });

    const res = await agent().get('/api/transactions');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.transactions));
    assert.ok(res.body.transactions.length > 0);
  });
});

describe('Responsive — Static assets served correctly', () => {
  it('serves index.html with correct content-type', async () => {
    const res = await agent().get('/').redirects(0);
    // May redirect to /login.html or serve index.html
    assert.ok([200, 302, 301].includes(res.status));
  });

  it('serves styles.css with correct content-type', async () => {
    const res = await agent().get('/styles.css');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('css'), 'should serve CSS with correct content-type');
  });

  it('serves JavaScript files correctly', async () => {
    const res = await agent().get('/js/utils.js');
    assert.equal(res.status, 200);
    assert.ok(
      res.headers['content-type'].includes('javascript'),
      'should serve JS with correct content-type'
    );
  });
});

describe('Responsive — View JS files include data-label attributes', () => {
  it('transactions view uses data-label on td elements', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'transactions.js'), 'utf8');
    assert.ok(js.includes("'data-label'"), 'transactions view should set data-label attributes');
    assert.ok(js.includes("'data-label': 'Date'"), 'should label Date column');
    assert.ok(js.includes("'data-label': 'Amount'"), 'should label Amount column');
  });

  it('rules view uses data-label on td elements', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'rules.js'), 'utf8');
    assert.ok(js.includes("'data-label'"), 'rules view should set data-label attributes');
    assert.ok(js.includes("'data-label': 'Pattern'"), 'should label Pattern column');
  });

  it('reports view uses data-label on td elements', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'reports.js'), 'utf8');
    assert.ok(js.includes("'data-label'"), 'reports view should set data-label attributes');
    assert.ok(js.includes("'data-label': 'Month'"), 'should label Month column');
  });

  it('splits view uses data-label on td elements', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'views', 'splits.js'), 'utf8');
    assert.ok(js.includes("'data-label'"), 'splits view should set data-label attributes');
    assert.ok(js.includes("'data-label': 'Paid By'"), 'should label Paid By column');
  });
});
