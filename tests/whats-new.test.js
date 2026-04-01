const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, agent, rawAgent } = require('./helpers');

describe('What\'s New API', () => {
  before(() => setup());
  after(() => teardown());

  describe('GET /api/whats-new', () => {
    it('returns changelog entries (200)', async () => {
      const res = await agent().get('/api/whats-new').expect(200);
      assert.ok(Array.isArray(res.body.entries));
      assert.ok(res.body.entries.length > 0);
    });

    it('includes currentVersion in response', async () => {
      const res = await agent().get('/api/whats-new').expect(200);
      assert.ok(res.body.currentVersion);
      assert.equal(typeof res.body.currentVersion, 'string');
    });

    it('each entry has required fields', async () => {
      const res = await agent().get('/api/whats-new').expect(200);
      for (const entry of res.body.entries) {
        assert.ok(entry.version, 'entry should have version');
        assert.ok(entry.date, 'entry should have date');
        assert.ok(Array.isArray(entry.changes), 'entry should have changes array');
        assert.ok(entry.changes.length > 0, 'entry should have at least one change');
      }
    });

    it('entries have valid date format', async () => {
      const res = await agent().get('/api/whats-new').expect(200);
      for (const entry of res.body.entries) {
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.date), `Invalid date format: ${entry.date}`);
      }
    });

    it('changes are non-empty strings', async () => {
      const res = await agent().get('/api/whats-new').expect(200);
      for (const entry of res.body.entries) {
        for (const change of entry.changes) {
          assert.equal(typeof change, 'string');
          assert.ok(change.length > 0);
        }
      }
    });

    it('is accessible without authentication (public endpoint)', async () => {
      const res = await rawAgent().get('/api/whats-new').expect(200);
      assert.ok(Array.isArray(res.body.entries));
    });

    it('returns consistent data on multiple calls', async () => {
      const res1 = await agent().get('/api/whats-new').expect(200);
      const res2 = await agent().get('/api/whats-new').expect(200);
      assert.deepEqual(res1.body.entries, res2.body.entries);
      assert.equal(res1.body.currentVersion, res2.body.currentVersion);
    });

    it('returns JSON content type', async () => {
      const res = await agent().get('/api/whats-new').expect(200);
      assert.ok(res.headers['content-type'].includes('application/json'));
    });

    it('version matches package.json version', async () => {
      const pkg = require('../package.json');
      const res = await agent().get('/api/whats-new').expect(200);
      assert.equal(res.body.currentVersion, pkg.version);
    });

    it('entries are ordered (most recent first)', async () => {
      const res = await agent().get('/api/whats-new').expect(200);
      if (res.body.entries.length >= 2) {
        assert.ok(res.body.entries[0].date >= res.body.entries[1].date);
      }
    });
  });
});
