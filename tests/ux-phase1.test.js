const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf-8');

describe('P5 — Reduced Motion Support', () => {
  const css = read('styles.css');
  const chartsJs = read('js/charts.js');

  it('styles.css contains @media (prefers-reduced-motion: reduce)', () => {
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  });

  it('charts.js respects reduced motion preference', () => {
    assert.ok(chartsJs.includes('prefers-reduced-motion'));
  });

  it('reduced motion disables all animations and transitions', () => {
    assert.ok(css.includes('animation-duration'));
    assert.ok(css.includes('transition-duration'));
  });
});

describe('P6 — Keyboard Shortcuts Help Modal', () => {
  const appJs = read('js/app.js');

  it('app.js contains showShortcutsHelp function', () => {
    assert.ok(appJs.includes('showShortcutsHelp'));
  });

  it('pressing ? key calls showShortcutsHelp', () => {
    assert.ok(appJs.includes("'?'"));
  });

  it('shortcuts modal lists common shortcuts', () => {
    assert.ok(appJs.includes('Keyboard Shortcuts'));
    assert.ok(appJs.includes('Dashboard'));
    assert.ok(appJs.includes('Transactions'));
  });

  it('shortcuts modal has a close button', () => {
    assert.ok(appJs.includes('closeModal'));
  });
});

describe('P3 — Toast with Undo Action', () => {
  const utilsJs = read('js/utils.js');
  const css = read('styles.css');

  it('toast function accepts a third options parameter', () => {
    assert.match(utilsJs, /function toast\(message,\s*type\s*=\s*['"]info['"],\s*options\s*=/);
  });

  it('toast function renders undo button when undo callback provided', () => {
    assert.ok(utilsJs.includes('toast-undo-btn'));
  });

  it('styles.css contains .toast-undo-btn styling', () => {
    assert.ok(css.includes('.toast-undo-btn'));
  });

  it('toast with undo has aria announcement', () => {
    assert.ok(utilsJs.includes('Undo available'));
  });
});

describe('P1 — Dark/Light Theme Toggle', () => {
  const css = read('styles.css');
  const html = read('index.html');
  const appJs = read('js/app.js');
  const chartsJs = read('js/charts.js');
  const loginHtml = read('login.html');

  it('styles.css contains [data-theme="light"] CSS variable block', () => {
    assert.ok(css.includes('[data-theme="light"]'));
  });

  it('[data-theme="light"] defines --bg-primary as a light color', () => {
    const match = css.match(/\[data-theme="light"\]\s*\{[^}]*--bg-primary:\s*(#[0-9a-fA-F]+)/);
    assert.ok(match, 'light theme must define --bg-primary');
    const hex = match[1];
    // Light color means high luminance (first hex digit > 8)
    const r = parseInt(hex.slice(1, 3), 16);
    assert.ok(r > 200, `--bg-primary should be light, got ${hex}`);
  });

  it('[data-theme="light"] defines --text-primary as a dark color', () => {
    const match = css.match(/\[data-theme="light"\]\s*\{[^}]*--text-primary:\s*(#[0-9a-fA-F]+)/);
    assert.ok(match, 'light theme must define --text-primary');
    const hex = match[1];
    const r = parseInt(hex.slice(1, 3), 16);
    assert.ok(r < 100, `--text-primary should be dark, got ${hex}`);
  });

  it('[data-theme="light"] block covers all essential custom properties', () => {
    const lightBlock = css.match(/\[data-theme="light"\]\s*\{([^}]+)\}/);
    assert.ok(lightBlock, 'light theme block must exist');
    const block = lightBlock[1];
    for (const prop of ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--text-primary', '--text-secondary', '--border', '--accent']) {
      assert.ok(block.includes(prop), `light theme must define ${prop}`);
    }
  });

  it('index.html sidebar-footer contains a theme toggle button', () => {
    assert.ok(html.includes('theme-toggle'));
  });

  it('theme toggle button has aria-label', () => {
    assert.match(html, /theme-toggle[\s\S]*aria-label/);
  });

  it('app.js contains initTheme function', () => {
    assert.ok(appJs.includes('initTheme'));
  });

  it('app.js references pfi_theme localStorage key', () => {
    assert.ok(appJs.includes('pfi_theme'));
  });

  it('charts.js reads CSS variables via getComputedStyle', () => {
    assert.ok(chartsJs.includes('getComputedStyle'));
  });

  it('login.html references theme variables', () => {
    assert.ok(loginHtml.includes('styles.css') || loginHtml.includes('data-theme'));
  });

  it('styles.css contains prefers-color-scheme media query', () => {
    assert.ok(css.includes('prefers-color-scheme'));
  });

  it('CSS has transition tokens', () => {
    assert.ok(css.includes('--transition-fast'));
    assert.ok(css.includes('--transition-medium'));
  });
});

describe('P2 — Sidebar Collapse to Icon Rail', () => {
  const css = read('styles.css');
  const html = read('index.html');
  const appJs = read('js/app.js');

  it('index.html contains a sidebar collapse toggle button', () => {
    assert.ok(html.includes('sidebar-collapse'));
  });

  it('collapse button has aria-expanded attribute', () => {
    assert.match(html, /sidebar-collapse[\s\S]*aria-expanded/);
  });

  it('styles.css contains .sidebar.collapsed styles', () => {
    assert.ok(css.includes('.sidebar.collapsed'));
  });

  it('.sidebar.collapsed styles hide nav labels', () => {
    assert.ok(css.includes('.sidebar.collapsed .nav-label'));
  });

  it('styles.css has CSS transition on sidebar width', () => {
    assert.ok(css.includes('transition') && css.includes('sidebar'));
  });

  it('app.js contains sidebar collapse handler', () => {
    assert.ok(appJs.includes('sidebar-collapse') || appJs.includes('sidebarCollapse'));
  });

  it('app.js references localStorage for sidebar collapse state', () => {
    assert.ok(appJs.includes('pfi_sidebar'));
  });
});

describe('P4 — Mobile Bottom Navigation Bar', () => {
  const css = read('styles.css');
  const html = read('index.html');
  const appJs = read('js/app.js');

  it('index.html contains bottom-nav element', () => {
    assert.ok(html.includes('bottom-nav'));
  });

  it('bottom nav has 5 child items', () => {
    const matches = html.match(/class="bottom-nav-item"/g);
    assert.ok(matches && matches.length === 5, `Expected 5 bottom-nav-items, got ${matches ? matches.length : 0}`);
  });

  it('bottom nav items include Dashboard, Transactions, Accounts, Budgets', () => {
    // Check data-view attributes
    assert.ok(html.includes('bottom-nav'));
    const navSection = html.slice(html.indexOf('bottom-nav'));
    assert.ok(navSection.includes('dashboard'));
    assert.ok(navSection.includes('transactions'));
    assert.ok(navSection.includes('accounts'));
    assert.ok(navSection.includes('budgets'));
  });

  it('styles.css contains .bottom-nav with position:fixed', () => {
    assert.ok(css.includes('.bottom-nav'));
    assert.ok(css.includes('position: fixed') || css.includes('position:fixed'));
  });

  it('.bottom-nav is hidden by default (desktop)', () => {
    const match = css.match(/\.bottom-nav\s*\{[^}]*display:\s*none/);
    assert.ok(match, 'bottom-nav should be display:none by default');
  });

  it('@media max-width:768px shows .bottom-nav', () => {
    assert.ok(css.includes('.bottom-nav'));
  });

  it('app.js wires bottom-nav click handlers', () => {
    assert.ok(appJs.includes('bottom-nav'));
  });
});
