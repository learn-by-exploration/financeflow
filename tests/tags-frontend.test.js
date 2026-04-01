// tests/tags-frontend.test.js — Tag management frontend tests
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');
const fs = require('fs');
const path = require('path');

describe('Tag Management Frontend & API', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(teardown);
  beforeEach(cleanDb);

  // ─── Frontend content tests ───

  describe('tags.js frontend file', () => {
    const filePath = path.join(__dirname, '..', 'public', 'js', 'views', 'tags.js');
    const content = fs.readFileSync(filePath, 'utf8');

    it('exists and exports renderTags', () => {
      assert.ok(content.includes('export async function renderTags'));
    });

    it('uses el() helper for DOM creation', () => {
      assert.ok(content.includes("el('"));
    });

    it('does not use innerHTML with dynamic data', () => {
      // Only allowed innerHTML is container.innerHTML = '' for clearing
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('innerHTML') && !line.includes("innerHTML = ''") && !line.includes("innerHTML = '';")) {
          assert.fail(`Unsafe innerHTML usage: ${line.trim()}`);
        }
      }
    });

    it('includes ARIA labels for accessibility', () => {
      assert.ok(content.includes('aria-label'));
    });

    it('includes confirm dialog for delete', () => {
      assert.ok(content.includes('confirm'));
    });

    it('imports from utils.js', () => {
      assert.ok(content.includes("from '../utils.js'"));
    });
  });

  // ─── API tests ───

  describe('GET /api/tags', () => {
    it('returns empty tags list', async () => {
      const res = await agent().get('/api/tags');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.tags));
    });

    it('returns created tags', async () => {
      await agent().post('/api/tags').send({ name: 'Grocery', color: '#22c55e' });
      const res = await agent().get('/api/tags');
      assert.equal(res.status, 200);
      assert.ok(res.body.tags.some(t => t.name === 'Grocery'));
    });
  });

  describe('POST /api/tags', () => {
    it('creates a new tag', async () => {
      const res = await agent().post('/api/tags').send({ name: 'Priority', color: '#ef4444' });
      assert.equal(res.status, 201);
      assert.equal(res.body.tag.name, 'Priority');
      assert.equal(res.body.tag.color, '#ef4444');
    });

    it('rejects duplicate tag name', async () => {
      await agent().post('/api/tags').send({ name: 'Duplicate' });
      const res = await agent().post('/api/tags').send({ name: 'Duplicate' });
      assert.equal(res.status, 409);
    });

    it('rejects empty name', async () => {
      const res = await agent().post('/api/tags').send({ name: '' });
      assert.equal(res.status, 400);
    });
  });

  describe('PUT /api/tags/:id', () => {
    it('updates a tag', async () => {
      const createRes = await agent().post('/api/tags').send({ name: 'Old Name', color: '#000000' });
      const id = createRes.body.tag.id;
      const res = await agent().put(`/api/tags/${id}`).send({ name: 'New Name', color: '#ffffff' });
      assert.equal(res.status, 200);
      assert.equal(res.body.tag.name, 'New Name');
    });

    it('returns 404 for non-existent tag', async () => {
      const res = await agent().put('/api/tags/99999').send({ name: 'Test' });
      assert.equal(res.status, 404);
    });
  });

  describe('DELETE /api/tags/:id', () => {
    it('deletes a tag', async () => {
      const createRes = await agent().post('/api/tags').send({ name: 'ToDelete' });
      const id = createRes.body.tag.id;
      const res = await agent().delete(`/api/tags/${id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it('returns 404 for non-existent tag', async () => {
      const res = await agent().delete('/api/tags/99999');
      assert.equal(res.status, 404);
    });
  });

  // ─── App.js registration ───

  describe('app.js registration', () => {
    const appContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

    it('registers tags view in view registry', () => {
      assert.ok(appContent.includes("tags:"));
      assert.ok(appContent.includes("renderTags"));
    });

    it('includes tags in navigation menu', () => {
      assert.ok(appContent.includes("'tags'") || appContent.includes('"tags"'));
    });
  });

  // ─── SW cache ───

  describe('service worker', () => {
    const swContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');

    it('includes tags.js in cache list', () => {
      assert.ok(swContent.includes('tags.js'));
    });
  });
});
