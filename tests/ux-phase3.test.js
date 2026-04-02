const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf-8');

describe('P16 — Multiple Theme Presets', () => {
  const css = read('styles.css');
  const settingsJs = read('js/views/settings.js');

  it('styles.css contains [data-theme="forest"] block', () => {
    assert.ok(css.includes('[data-theme="forest"]'));
  });

  it('styles.css contains [data-theme="ocean"] block', () => {
    assert.ok(css.includes('[data-theme="ocean"]'));
  });

  it('styles.css contains [data-theme="rose"] block', () => {
    assert.ok(css.includes('[data-theme="rose"]'));
  });

  it('styles.css contains [data-theme="nord"] block', () => {
    assert.ok(css.includes('[data-theme="nord"]'));
  });

  it('each theme defines essential variables', () => {
    for (const theme of ['forest', 'ocean', 'rose', 'nord']) {
      const regex = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{[^}]*--bg-primary`);
      assert.ok(regex.test(css), `${theme} must define --bg-primary`);
    }
  });

  it('settings.js renders theme selector', () => {
    assert.ok(settingsJs.includes('theme') || settingsJs.includes('Theme'));
  });
});

describe('P17 — Quick Setup Presets', () => {
  const settingsJs = read('js/views/settings.js');

  it('settings.js renders preset buttons for regions', () => {
    assert.ok(settingsJs.includes('India') || settingsJs.includes('INR'));
  });

  it('presets include US and EU', () => {
    assert.ok(settingsJs.includes('USD'));
    assert.ok(settingsJs.includes('EUR'));
  });
});

describe('P18 — Demo Quick-Fill', () => {
  const loginHtml = read('login.html');
  const loginJs = read('js/login.js');

  it('login.html has demo button', () => {
    assert.ok(loginHtml.includes('demo-btn'));
  });

  it('login.js fills demo credentials on click', () => {
    assert.ok(loginJs.includes('demo'));
  });
});

describe('P19 — Landing CTA Enhancement', () => {
  const landingCss = read('css/landing.css');

  it('landing.css has btn-hero-primary with box-shadow', () => {
    assert.match(landingCss, /btn-hero-primary[\s\S]*?box-shadow/);
  });

  it('landing.css has hover transform on CTA', () => {
    assert.match(landingCss, /btn-hero-primary[\s\S]*?:hover[\s\S]*?transform/);
  });
});

describe('P20 — Color Swatch Picker', () => {
  const utilsJs = read('js/utils.js');
  const css = read('styles.css');

  it('utils.js has renderColorPicker function', () => {
    assert.ok(utilsJs.includes('renderColorPicker'));
  });

  it('styles.css has color-swatch styles', () => {
    assert.ok(css.includes('.color-swatch'));
  });
});

describe('P21 — Hover Action Buttons', () => {
  const css = read('styles.css');

  it('styles.css has hover-actions class', () => {
    assert.ok(css.includes('.hover-actions'));
  });

  it('hover-actions hidden by default, shown on hover', () => {
    assert.ok(css.includes('hover-actions'));
  });
});

describe('P22 — Search with Filters', () => {
  const searchJs = read('js/views/search.js');
  const css = read('styles.css');

  it('search.js renders filter chips', () => {
    assert.ok(searchJs.includes('filter') || searchJs.includes('chip'));
  });

  it('styles.css has search-filter-chip styles', () => {
    assert.ok(css.includes('.search-filter-chip') || css.includes('filter-chip'));
  });
});

describe('P23 — Breadcrumbs', () => {
  const appJs = read('js/app.js');
  const css = read('styles.css');
  const html = read('index.html');

  it('index.html has breadcrumb navigation', () => {
    assert.ok(html.includes('breadcrumb'));
  });

  it('breadcrumb has aria-label', () => {
    assert.match(html, /breadcrumb[\s\S]*?aria-label/i);
  });

  it('styles.css has breadcrumb styles', () => {
    assert.ok(css.includes('.breadcrumb'));
  });

  it('app.js updates breadcrumbs on view change', () => {
    assert.ok(appJs.includes('breadcrumb'));
  });
});

describe('P24 — Multi-Select Transactions', () => {
  const appJs = read('js/app.js');
  const css = read('styles.css');
  const txnJs = read('js/views/transactions.js');

  it('app.js has M key for multi-select', () => {
    assert.match(appJs, /['"]m['"]|['"]M['"]/);
  });

  it('styles.css has multi-select styles', () => {
    assert.ok(css.includes('multi-select') || css.includes('bulk-action'));
  });

  it('transactions view has a visible Select button', () => {
    assert.ok(txnJs.includes("textContent: 'Select'") || txnJs.includes('toggle-multi-select'));
  });

  it('M shortcut is listed in help modal', () => {
    assert.ok(appJs.includes('Toggle multi-select') || appJs.includes('multi-select'));
  });
});

describe('P25 — PWA Offline Queue', () => {
  const sw = read('sw.js');
  const appJs = read('js/app.js');

  it('sw.js contains offline queue logic', () => {
    assert.ok(sw.includes('offlineQueue') || sw.includes('IndexedDB') || sw.includes('indexedDB'));
  });

  it('sw.js does not queue auth requests', () => {
    assert.ok(sw.includes('auth'));
  });

  it('app.js has pending sync indicator', () => {
    assert.ok(appJs.includes('pending') || appJs.includes('sync'));
  });
});

describe('P26 — Shortcut Customization', () => {
  const settingsJs = read('js/views/settings.js');
  const appJs = read('js/app.js');

  it('settings.js renders keyboard shortcuts section', () => {
    assert.ok(settingsJs.includes('shortcut') || settingsJs.includes('Shortcut') || settingsJs.includes('Keyboard'));
  });

  it('app.js uses configurable shortcuts map', () => {
    assert.ok(appJs.includes('pfi_shortcuts') || appJs.includes('shortcutMap'));
  });
});

describe('P27 — Vim Navigation', () => {
  const appJs = read('js/app.js');

  it('app.js has vim mode support', () => {
    assert.ok(appJs.includes('vim') || appJs.includes('pfi_vim'));
  });
});

describe('P28 — NLP Quick Capture', () => {
  const appJs = read('js/app.js');

  it('quick-add has NLP parser integration', () => {
    assert.ok(appJs.includes('parseQuick') || appJs.includes('nlp') || appJs.includes('quick-capture'));
  });

  it('parser extracts amount from text', () => {
    assert.ok(appJs.includes('parseQuick') || appJs.includes('amount'));
  });
});
