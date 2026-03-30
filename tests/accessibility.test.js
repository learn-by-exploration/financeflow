const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeSecondUser } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ═══════════════════════════════════════════
// PREFERENCES
// ═══════════════════════════════════════════

describe('GET /api/preferences', () => {
  it('returns default preferences for new user', async () => {
    const res = await agent().get('/api/preferences');
    assert.equal(res.status, 200);
    const { preferences } = res.body;
    assert.equal(preferences.date_format, 'YYYY-MM-DD');
    assert.equal(preferences.number_format, 'en-IN');
    assert.equal(preferences.timezone, 'Asia/Kolkata');
    assert.equal(preferences.theme, 'system');
    assert.equal(preferences.language, 'en');
    assert.equal(preferences.items_per_page, 25);
  });
});

describe('PUT /api/preferences', () => {
  it('updates preferences and returns them', async () => {
    const res = await agent()
      .put('/api/preferences')
      .send({ theme: 'dark', date_format: 'DD/MM/YYYY', items_per_page: 50 });
    assert.equal(res.status, 200);
    const { preferences } = res.body;
    assert.equal(preferences.theme, 'dark');
    assert.equal(preferences.date_format, 'DD/MM/YYYY');
    assert.equal(preferences.items_per_page, 50);
    // Unchanged defaults
    assert.equal(preferences.language, 'en');
  });

  it('persists preferences across requests', async () => {
    await agent().put('/api/preferences').send({ theme: 'dark' });
    const res = await agent().get('/api/preferences');
    assert.equal(res.status, 200);
    assert.equal(res.body.preferences.theme, 'dark');
  });

  it('rejects invalid preference values', async () => {
    const res = await agent()
      .put('/api/preferences')
      .send({ theme: 'neon' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects invalid items_per_page', async () => {
    const res = await agent()
      .put('/api/preferences')
      .send({ items_per_page: 999 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects invalid date_format', async () => {
    const res = await agent()
      .put('/api/preferences')
      .send({ date_format: 'INVALID' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════
// SEARCH — tags support
// ═══════════════════════════════════════════

describe('GET /api/search', () => {
  it('finds transactions by description', async () => {
    const acc = makeAccount();
    makeTransaction(acc.id, { description: 'Grocery shopping at BigBasket' });
    const res = await agent().get('/api/search?q=BigBasket');
    assert.equal(res.status, 200);
    assert.ok(res.body.transactions.length >= 1);
    assert.ok(res.body.transactions[0].description.includes('BigBasket'));
  });

  it('finds accounts by name', async () => {
    makeAccount({ name: 'HDFC Savings' });
    const res = await agent().get('/api/search?q=HDFC');
    assert.equal(res.status, 200);
    assert.ok(res.body.accounts.length >= 1);
    assert.ok(res.body.accounts[0].name.includes('HDFC'));
  });

  it('finds categories by name', async () => {
    makeCategory({ name: 'Entertainment' });
    const res = await agent().get('/api/search?q=Entertainment');
    assert.equal(res.status, 200);
    assert.ok(res.body.categories.length >= 1);
  });

  it('finds tags by name', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(1, 'vacation');
    const res = await agent().get('/api/search?q=vacation');
    assert.equal(res.status, 200);
    assert.ok(res.body.tags.length >= 1);
    assert.equal(res.body.tags[0].name, 'vacation');
  });

  it('returns empty results for no match', async () => {
    const res = await agent().get('/api/search?q=zzzznonexistent');
    assert.equal(res.status, 200);
    assert.equal(res.body.transactions.length, 0);
    assert.equal(res.body.accounts.length, 0);
    assert.equal(res.body.categories.length, 0);
    assert.equal(res.body.tags.length, 0);
  });

  it('search respects user isolation', async () => {
    const acc = makeAccount({ name: 'My Private Account' });
    makeTransaction(acc.id, { description: 'Secret purchase' });

    const { agent: agent2 } = makeSecondUser();
    const res = await agent2.get('/api/search?q=Secret');
    assert.equal(res.status, 200);
    assert.equal(res.body.transactions.length, 0);
    assert.equal(res.body.accounts.length, 0);
  });

  it('returns error for empty query', async () => {
    const res = await agent().get('/api/search?q=');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════
// WCAG 2.1 AA — Accessibility
// ═══════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
const stylesCSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf-8');

describe('WCAG 2.1 AA — HTML Accessibility', () => {
  it('html element has lang attribute', () => {
    assert.match(indexHtml, /<html[^>]+lang="en"/);
  });

  it('skip-to-content link is present', () => {
    assert.match(indexHtml, /class="skip-link"/);
    assert.match(indexHtml, /Skip to main content/);
  });

  it('aria-live region is present for announcements', () => {
    assert.match(indexHtml, /aria-live="polite"/);
    assert.match(indexHtml, /id="a11y-announce"/);
  });

  it('nav landmark has aria-label', () => {
    assert.match(indexHtml, /<nav[^>]+aria-label="Main navigation"/);
  });

  it('main landmark is present', () => {
    assert.match(indexHtml, /<main[^>]+id="main-content"/);
    assert.match(indexHtml, /role="main"/);
  });

  it('modal has role="dialog" and aria-modal', () => {
    assert.match(indexHtml, /role="dialog"/);
    assert.match(indexHtml, /aria-modal="true"/);
  });

  it('notification bell has aria-label', () => {
    assert.match(indexHtml, /id="notif-bell"[^>]*aria-label="Notifications"/);
  });

  it('notification bell has aria-expanded attribute', () => {
    assert.match(indexHtml, /id="notif-bell"[^>]*aria-expanded=/);
  });

  it('notification list has role="list"', () => {
    assert.match(indexHtml, /id="notif-list"[^>]*role="list"/);
  });
});

describe('WCAG 2.1 AA — CSS Accessibility', () => {
  it('has focus-visible styles', () => {
    assert.match(stylesCSS, /:focus-visible/);
  });

  it('has skip-link styles', () => {
    assert.match(stylesCSS, /\.skip-link/);
  });

  it('has reduced motion media query', () => {
    assert.match(stylesCSS, /prefers-reduced-motion:\s*reduce/);
  });

  it('has sr-only class for screen readers', () => {
    assert.match(stylesCSS, /\.sr-only/);
  });
});

describe('WCAG 2.1 AA — API Accessibility', () => {
  it('API error responses have proper error field', async () => {
    const res = await agent().post('/api/transactions').send({});
    assert.ok(res.status >= 400);
    assert.ok(res.body.error);
  });

  it('API endpoints accept application/json content type', async () => {
    const acc = makeAccount();
    const res = await agent()
      .post('/api/transactions')
      .set('Content-Type', 'application/json')
      .send({ account_id: acc.id, type: 'expense', amount: 50, description: 'A11y test', date: '2025-01-15' });
    assert.equal(res.status, 201);
  });

  it('API responses have proper content-type header', async () => {
    const res = await agent().get('/api/accounts');
    assert.ok(res.headers['content-type'].includes('application/json'));
  });
});
