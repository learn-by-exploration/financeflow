const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, agent, rawAgent } = require('./helpers');

describe('Branding, PWA & What\'s New', () => {
  before(() => setup());
  after(() => teardown());

  // ─── Branding ───

  describe('GET /api/branding', () => {
    it('returns branding config', async () => {
      const res = await rawAgent().get('/api/branding').expect(200);
      assert.ok(res.body.name);
      assert.ok(typeof res.body.color === 'string');
      assert.ok('logoUrl' in res.body);
      assert.ok('version' in res.body);
    });

    it('default brand name is FinanceFlow', async () => {
      const res = await rawAgent().get('/api/branding').expect(200);
      assert.equal(res.body.name, 'FinanceFlow');
    });

    it('returns default accent color', async () => {
      const res = await rawAgent().get('/api/branding').expect(200);
      assert.equal(res.body.color, '#6366f1');
    });

    it('is a public endpoint (no auth needed)', async () => {
      const res = await rawAgent().get('/api/branding');
      assert.equal(res.status, 200);
      assert.ok(res.body.name);
    });

    it('includes version in response', async () => {
      const res = await rawAgent().get('/api/branding').expect(200);
      assert.ok(res.body.version);
      assert.ok(typeof res.body.version === 'string');
    });
  });

  // ─── PWA Manifest ───

  describe('GET /manifest.json', () => {
    it('returns valid JSON manifest', async () => {
      const res = await rawAgent().get('/manifest.json').expect(200);
      assert.ok(res.body.name || res.text);
      const manifest = typeof res.body === 'object' && res.body.name ? res.body : JSON.parse(res.text);
      assert.ok(manifest.name);
    });

    it('has required PWA fields', async () => {
      const res = await rawAgent().get('/manifest.json');
      const manifest = typeof res.body === 'object' && res.body.name ? res.body : JSON.parse(res.text);
      assert.ok(manifest.name);
      assert.ok(manifest.short_name);
      assert.equal(manifest.start_url, '/');
      assert.equal(manifest.display, 'standalone');
      assert.ok(manifest.theme_color);
      assert.ok(manifest.background_color);
    });

    it('has icon entries with sizes', async () => {
      const res = await rawAgent().get('/manifest.json');
      const manifest = typeof res.body === 'object' && res.body.name ? res.body : JSON.parse(res.text);
      assert.ok(Array.isArray(manifest.icons));
      assert.ok(manifest.icons.length >= 1);
      const sizes = manifest.icons.map(i => i.sizes);
      assert.ok(sizes.some(s => s === '192x192' || s === 'any'));
    });
  });

  // ─── Service Worker ───

  describe('GET /sw.js', () => {
    it('serves the service worker file', async () => {
      const res = await rawAgent().get('/sw.js').expect(200);
      assert.ok(res.text.includes('self.addEventListener'));
      assert.ok(res.text.includes('CACHE_NAME'));
    });
  });

  // ─── What's New ───

  describe('GET /api/whats-new', () => {
    it('returns changelog entries', async () => {
      const res = await rawAgent().get('/api/whats-new').expect(200);
      assert.ok(Array.isArray(res.body.entries));
      assert.ok(res.body.entries.length > 0);
    });

    it('changelog entries have version and changes', async () => {
      const res = await rawAgent().get('/api/whats-new').expect(200);
      for (const entry of res.body.entries) {
        assert.ok(entry.version, 'entry should have version');
        assert.ok(entry.date, 'entry should have date');
        assert.ok(Array.isArray(entry.changes), 'entry should have changes array');
        assert.ok(entry.changes.length > 0, 'changes should not be empty');
      }
    });

    it('includes currentVersion in response', async () => {
      const res = await rawAgent().get('/api/whats-new').expect(200);
      assert.ok(res.body.currentVersion);
      assert.ok(typeof res.body.currentVersion === 'string');
    });

    it('is a public endpoint (no auth needed)', async () => {
      const res = await rawAgent().get('/api/whats-new');
      assert.equal(res.status, 200);
    });
  });
});
