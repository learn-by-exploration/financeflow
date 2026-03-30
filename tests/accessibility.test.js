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
