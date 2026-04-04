// tests/v7-audit-fixes.test.js — Audit issue fixes (v7.3.1)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(PUBLIC, rel));

// ═══ ISSUE 1: Missing PWA icons ═══
describe('Issue 1: PWA icons exist', () => {
  it('icon-192.png exists in public/icons/', () => {
    assert.ok(exists('icons/icon-192.png'), 'icons/icon-192.png must exist');
  });
  it('icon-512.png exists in public/icons/', () => {
    assert.ok(exists('icons/icon-512.png'), 'icons/icon-512.png must exist');
  });
  it('manifest.json references icons that exist', () => {
    const manifest = JSON.parse(read('manifest.json'));
    for (const icon of manifest.icons) {
      if (icon.src.startsWith('data:')) continue; // inline SVG is valid
      const iconPath = icon.src.startsWith('/') ? icon.src.slice(1) : icon.src;
      assert.ok(exists(iconPath), `manifest icon ${icon.src} must exist`);
    }
  });
});

// ═══ ISSUE 2: Missing calendar view ═══
describe('Issue 2: Calendar view', () => {
  it('calendar.js exists in public/js/views/', () => {
    assert.ok(exists('js/views/calendar.js'), 'calendar.js view must exist');
  });
  it('calendar.js exports renderCalendar function', () => {
    const src = read('js/views/calendar.js');
    assert.ok(
      src.includes('export') && src.includes('renderCalendar'),
      'calendar.js must export renderCalendar'
    );
  });
  it('app.js registers calendar in view registry', () => {
    const app = read('js/app.js');
    assert.ok(
      app.includes("calendar") && app.includes("views/calendar.js"),
      'app.js must import calendar view'
    );
  });
});

// ═══ ISSUE 3: SW cache incomplete ═══
describe('Issue 3: Service worker caches all views', () => {
  const viewFiles = [
    'categories', 'subscriptions', 'groups', 'splits',
    'recurring', 'insights', 'rules', 'export',
    'calendar', 'calculators', 'challenges', 'automation',
  ];
  for (const view of viewFiles) {
    it(`sw.js caches /js/views/${view}.js`, () => {
      const sw = read('sw.js');
      assert.ok(
        sw.includes(`/js/views/${view}.js`),
        `sw.js STATIC_ASSETS must include /js/views/${view}.js`
      );
    });
  }
  it('sw.js CACHE_NAME is bumped to v7.5.0', () => {
    const sw = read('sw.js');
    assert.ok(
      sw.includes('financeflow-v7.5.0'),
      'CACHE_NAME should be bumped after changes'
    );
  });
});

// ═══ ISSUE 4: View registry incomplete ═══
describe('Issue 4: All views registered in app.js', () => {
  const requiredViews = ['calculators', 'challenges', 'calendar'];
  for (const view of requiredViews) {
    it(`app.js registers ${view} view`, () => {
      const app = read('js/app.js');
      assert.ok(
        app.includes(`views/${view}.js`),
        `app.js views registry must include ${view}`
      );
    });
  }
});

// ═══ ISSUE 5: Dead api.js removed ═══
describe('Issue 5: Dead code cleanup', () => {
  it('public/js/api.js does not exist (duplicate of utils.js)', () => {
    assert.ok(
      !exists('js/api.js'),
      'api.js should be removed (duplicate API client)'
    );
  });
});
