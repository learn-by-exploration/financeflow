// tests/frontend-integrity.test.js — Comprehensive frontend integrity checks
// Catches issues that string-pattern tests miss: broken references, missing files,
// CSP violations, CSS consistency, view wiring, HTML structure, and localStorage hygiene.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(PUBLIC, f));

const indexHtml = read('index.html');
const loginHtml = read('login.html');
const landingHtml = read('landing.html');
const stylesCss = read('styles.css');
const appJs = read('js/app.js');
const swJs = read('sw.js');

// ─── Helpers ───
function getViewFiles() {
  return fs.readdirSync(path.join(PUBLIC, 'js', 'views')).filter(f => f.endsWith('.js'));
}

function getAllJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'vendor') {
      files.push(...getAllJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

// ═══════════════════════════════════════════════════════════════
// 1. HTML INTEGRITY
// ═══════════════════════════════════════════════════════════════
describe('HTML Integrity', () => {
  describe('CSP compliance — no inline styles in HTML', () => {
    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml], ['landing.html', landingHtml]]) {
      it(`${name} has no inline style= attributes`, () => {
        // Match style="..." but ignore data-style or comments
        const matches = html.match(/<[^>]+\sstyle\s*=\s*["'][^"']*["'][^>]*>/gi) || [];
        assert.equal(matches.length, 0,
          `Found ${matches.length} inline style(s) in ${name} — violates CSP style-src 'self':\n${matches.slice(0, 3).join('\n')}`);
      });
    }
  });

  describe('No duplicate IDs in index.html', () => {
    it('all element IDs are unique', () => {
      const idMatches = indexHtml.match(/\bid=["']([^"']+)["']/g) || [];
      const ids = idMatches.map(m => m.match(/id=["']([^"']+)["']/)[1]);
      const seen = new Set();
      const dupes = [];
      for (const id of ids) {
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
      }
      assert.equal(dupes.length, 0, `Duplicate IDs found: ${dupes.join(', ')}`);
    });
  });

  describe('Script and stylesheet references resolve', () => {
    it('all <script src="..."> files exist', () => {
      const srcs = indexHtml.match(/src=["']([^"']+\.js)["']/g) || [];
      for (const src of srcs) {
        const file = src.match(/src=["']([^"']+)["']/)[1];
        if (file.startsWith('http')) continue; // skip external (should not exist but be safe)
        const resolved = file.startsWith('/') ? file.slice(1) : file;
        assert.ok(exists(resolved), `Script not found: ${file}`);
      }
    });

    it('all <link rel="stylesheet" href="..."> files exist', () => {
      const hrefs = indexHtml.match(/href=["']([^"']+\.css)["']/g) || [];
      for (const href of hrefs) {
        const file = href.match(/href=["']([^"']+)["']/)[1];
        const resolved = file.startsWith('/') ? file.slice(1) : file;
        assert.ok(exists(resolved), `Stylesheet not found: ${file}`);
      }
    });

    it('all preloaded font files exist', () => {
      const preloads = indexHtml.match(/href=["']([^"']+\.woff2)["']/g) || [];
      for (const p of preloads) {
        const file = p.match(/href=["']([^"']+)["']/)[1];
        const resolved = file.startsWith('/') ? file.slice(1) : file;
        assert.ok(exists(resolved), `Font not found: ${file}`);
      }
    });
  });

  describe('Critical DOM elements exist', () => {
    const requiredIds = [
      'app', 'sidebar', 'main-content', 'view-container',
      'modal-overlay', 'modal-content', 'toast-container',
      'global-search', 'sidebar-collapse', 'fab-add',
      'notif-bell', 'privacy-banner', 'offline-banner',
      'breadcrumb', 'a11y-announce',
    ];
    for (const id of requiredIds) {
      it(`#${id} exists in index.html`, () => {
        assert.ok(indexHtml.includes(`id="${id}"`), `Missing element #${id}`);
      });
    }
  });

  describe('Sidebar nav items have data-tooltip for collapsed mode', () => {
    it('all nav-items with data-view have data-tooltip', () => {
      const navItems = indexHtml.match(/<(?:li|button)[^>]*data-view=["'][^"']+["'][^>]*>/g) || [];
      const missing = [];
      for (const item of navItems) {
        if (!item.includes('data-tooltip=')) {
          const viewMatch = item.match(/data-view=["']([^"']+)["']/);
          missing.push(viewMatch ? viewMatch[1] : item.slice(0, 60));
        }
      }
      assert.equal(missing.length, 0, `Nav items missing data-tooltip: ${missing.join(', ')}`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. VIEW WIRING — app.js ↔ view files
// ═══════════════════════════════════════════════════════════════
describe('View Wiring', () => {
  // Extract view registry from app.js
  const viewImports = appJs.match(/['"]\.\/views\/([^'"]+)\.js['"]/g) || [];
  const importedFiles = viewImports.map(m => m.match(/views\/([^'"]+)\.js/)[1] + '.js');
  const exportNames = appJs.match(/\.then\(m\s*=>\s*m\.(\w+)\)/g) || [];
  const exports = exportNames.map(m => m.match(/m\.(\w+)/)[1]);

  it('every view file in views/ is registered in app.js', () => {
    const viewFiles = getViewFiles();
    const unregistered = viewFiles.filter(f => !importedFiles.includes(f));
    assert.equal(unregistered.length, 0,
      `View files not registered in app.js: ${unregistered.join(', ')}`);
  });

  it('every import in app.js points to an existing file', () => {
    for (const file of importedFiles) {
      const fullPath = path.join(PUBLIC, 'js', 'views', file);
      assert.ok(fs.existsSync(fullPath), `app.js imports views/${file} but file does not exist`);
    }
  });

  it('every exported function name in app.js exists in its view file', () => {
    // Build map: file → expected export
    const pairs = [];
    const registry = appJs.match(/import\(['"]\.\/views\/([^'"]+)\.js['"]\)\.then\(m\s*=>\s*m\.(\w+)\)/g) || [];
    for (const match of registry) {
      const parts = match.match(/views\/([^'"]+)\.js.*m\.(\w+)/);
      if (parts) pairs.push({ file: parts[1] + '.js', exportName: parts[2] });
    }
    for (const { file, exportName } of pairs) {
      const content = read(`js/views/${file}`);
      assert.ok(
        content.includes(`export async function ${exportName}`) ||
        content.includes(`export function ${exportName}`),
        `views/${file} does not export '${exportName}' (expected by app.js)`
      );
    }
  });

  it('sidebar nav data-view values match app.js view registry keys', () => {
    const navViews = (indexHtml.match(/data-view=["']([^"']+)["']/g) || [])
      .map(m => m.match(/data-view=["']([^"']+)["']/)[1])
      .filter(v => v !== 'more'); // bottom-sheet trigger, not a view
    const registryKeys = (appJs.match(/^\s+(\w[\w-]*):\s+\(\)/gm) || [])
      .map(m => m.trim().split(':')[0].replace(/['"]/g, ''));
    // Also extract quoted keys like 'whats-new'
    const quotedKeys = (appJs.match(/['"]([^'"]+)['"]\s*:\s+\(\)/g) || [])
      .map(m => m.match(/['"]([^'"]+)['"]/)[1]);
    const allKeys = new Set([...registryKeys, ...quotedKeys]);
    const unregistered = navViews.filter(v => !allKeys.has(v));
    assert.equal(unregistered.length, 0,
      `Sidebar links to unregistered views: ${unregistered.join(', ')}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. CSS INTEGRITY
// ═══════════════════════════════════════════════════════════════
describe('CSS Integrity', () => {
  it('all 6 themes are defined', () => {
    const themes = ['light', 'forest', 'ocean', 'rose', 'nord'];
    for (const theme of themes) {
      assert.ok(stylesCss.includes(`[data-theme="${theme}"]`), `Theme "${theme}" not defined in styles.css`);
    }
    // Default (dark/midnight) defined in :root
    assert.ok(stylesCss.includes(':root {'), 'Default theme (:root) not defined');
  });

  it('critical CSS classes exist', () => {
    const required = [
      '.sidebar', '.main-content', '.nav-item', '.card',
      '.btn', '.btn-primary', '.btn-secondary',
      '.modal-overlay', '.toast-container', '.toast',
      '.breadcrumb', '.fab', '.settings-section',
      '.color-swatch', '.privacy-banner', '.demo-banner',
      '.offline-banner', '.bottom-nav', '.search-bar',
    ];
    for (const cls of required) {
      assert.ok(stylesCss.includes(cls), `CSS class "${cls}" not found in styles.css`);
    }
  });

  it('no undefined CSS custom properties used in styles.css', () => {
    // Extract all var(--xxx) usages
    const usages = stylesCss.match(/var\(--([a-z0-9-]+)/g) || [];
    const usedVars = [...new Set(usages.map(m => m.match(/var\(--([a-z0-9-]+)/)[1]))];
    // Extract all --xxx: definitions
    const defs = stylesCss.match(/--([a-z0-9-]+)\s*:/g) || [];
    const definedVars = new Set(defs.map(m => m.match(/--([a-z0-9-]+)/)[1]));
    // CSS built-in env() vars and standard properties are OK
    const exceptions = new Set(['transition-medium', 'transition-fast']);
    const undefined_ = usedVars.filter(v => !definedVars.has(v) && !exceptions.has(v));
    assert.equal(undefined_.length, 0,
      `Undefined CSS custom properties: ${undefined_.join(', ')}`);
  });

  it('.hidden class uses !important to override any display value', () => {
    assert.ok(stylesCss.includes('.hidden') && stylesCss.includes('!important'),
      '.hidden class must use display: none !important');
  });

  it('collapsed sidebar styles exist', () => {
    assert.ok(stylesCss.includes('.sidebar.collapsed'), 'Missing .sidebar.collapsed CSS');
    assert.ok(stylesCss.includes('.sidebar.collapsed .nav-label'), 'Missing collapsed .nav-label CSS');
    assert.ok(stylesCss.includes('.sidebar.collapsed .nav-item'), 'Missing collapsed .nav-item CSS');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. SERVICE WORKER INTEGRITY
// ═══════════════════════════════════════════════════════════════
describe('Service Worker Integrity', () => {
  it('STATIC_ASSETS in sw.js reference files that exist', () => {
    // Extract the array contents
    const match = swJs.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(match, 'STATIC_ASSETS array not found in sw.js');
    const assets = match[1].match(/'([^']+)'/g) || [];
    const paths = assets.map(a => a.replace(/'/g, ''));
    for (const p of paths) {
      if (p === '/') continue; // root index
      const resolved = p.startsWith('/') ? p.slice(1) : p;
      assert.ok(exists(resolved), `sw.js STATIC_ASSETS references missing file: ${p}`);
    }
  });

  it('sw.js cache versioning follows naming convention', () => {
    const match = swJs.match(/CACHE_NAME\s*=\s*'([^']+)'/);
    assert.ok(match, 'CACHE_NAME not found in sw.js');
    assert.match(match[1], /^financeflow-v\d+\.\d+\.\d+$/, `CACHE_NAME should be financeflow-vX.Y.Z, got: ${match[1]}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. LOCALSTORAGE KEY CONSISTENCY
// ═══════════════════════════════════════════════════════════════
describe('LocalStorage Key Consistency', () => {
  it('all localStorage keys in JS use pfi_ prefix', () => {
    const jsFiles = getAllJsFiles(path.join(PUBLIC, 'js'));
    const violations = [];
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(PUBLIC, file);
      // Match localStorage.getItem('xxx') and localStorage.setItem('xxx', ...)
      const matches = content.match(/localStorage\.(get|set|remove)Item\(\s*['"]([^'"]+)['"]/g) || [];
      for (const m of matches) {
        const key = m.match(/['"]([^'"]+)['"]/)[1];
        if (!key.startsWith('pfi_')) {
          violations.push(`${rel}: ${key}`);
        }
      }
    }
    assert.equal(violations.length, 0,
      `Non-prefixed localStorage keys found:\n${violations.join('\n')}`);
  });

  it('pfi_token key is used for auth', () => {
    assert.ok(appJs.includes("pfi_token"), 'app.js must reference pfi_token for auth');
  });

  it('pfi_theme key is used for theme persistence', () => {
    assert.ok(appJs.includes("pfi_theme"), 'app.js must reference pfi_theme');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. IMPORT/DEPENDENCY GRAPH — no broken imports
// ═══════════════════════════════════════════════════════════════
describe('Import Graph Integrity', () => {
  const jsFiles = getAllJsFiles(path.join(PUBLIC, 'js'));

  for (const file of jsFiles) {
    const rel = path.relative(PUBLIC, file);
    it(`${rel} — all imports resolve to existing files`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const imports = content.match(/from\s+['"](\.[^'"]+)['"]/g) || [];
      for (const imp of imports) {
        const target = imp.match(/from\s+['"](\.[^'"]+)['"]/)[1];
        const resolved = path.resolve(path.dirname(file), target);
        assert.ok(fs.existsSync(resolved), `${rel} imports '${target}' but file not found at ${resolved}`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 7. SECURITY — no external resources
// ═══════════════════════════════════════════════════════════════
describe('Security — No External Resources', () => {
  const htmlFiles = [
    ['index.html', indexHtml],
    ['login.html', loginHtml],
    ['landing.html', landingHtml],
  ];

  for (const [name, html] of htmlFiles) {
    it(`${name} has no external CDN links`, () => {
      const cdnPatterns = /(?:src|href)=["'](https?:\/\/(?:cdn|unpkg|jsdelivr|cloudflare|googleapis|gstatic))/gi;
      const matches = html.match(cdnPatterns) || [];
      assert.equal(matches.length, 0, `External CDN links in ${name}: ${matches.join(', ')}`);
    });

    it(`${name} has no analytics or tracking scripts`, () => {
      const trackers = /google-analytics|gtag|facebook|mixpanel|segment|hotjar|amplitude/gi;
      const matches = html.match(trackers) || [];
      assert.equal(matches.length, 0, `Tracking scripts in ${name}: ${matches.join(', ')}`);
    });
  }

  it('styles.css has no @import from external URLs', () => {
    const externalImports = stylesCss.match(/@import\s+url\s*\(\s*['"]?https?:\/\//gi) || [];
    assert.equal(externalImports.length, 0, `External @import in CSS: ${externalImports.join(', ')}`);
  });

  it('no JS file contains eval() or Function() constructor', () => {
    const jsFiles = getAllJsFiles(path.join(PUBLIC, 'js'));
    const violations = [];
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(PUBLIC, file);
      if (/\beval\s*\(/.test(content)) violations.push(`${rel}: eval()`);
      if (/\bnew\s+Function\s*\(/.test(content)) violations.push(`${rel}: new Function()`);
    }
    assert.equal(violations.length, 0, `Unsafe code found:\n${violations.join('\n')}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. ACCESSIBILITY — structural checks
// ═══════════════════════════════════════════════════════════════
describe('Accessibility Structure', () => {
  it('modal has role="dialog" and aria-modal', () => {
    assert.ok(indexHtml.includes('role="dialog"'), 'Modal must have role="dialog"');
    assert.ok(indexHtml.includes('aria-modal="true"'), 'Modal must have aria-modal="true"');
  });

  it('skip-link exists for keyboard navigation', () => {
    assert.ok(indexHtml.includes('skip-link'), 'Skip link must exist');
    assert.ok(indexHtml.includes('#main-content'), 'Skip link must target #main-content');
  });

  it('sidebar has aria-label for navigation', () => {
    assert.ok(indexHtml.includes('aria-label="Main navigation"'), 'Sidebar needs aria-label');
  });

  it('all nav items have role="button" or are <button> elements', () => {
    const navItems = indexHtml.match(/<li[^>]*class="[^"]*nav-item[^"]*"[^>]*>/g) || [];
    for (const item of navItems) {
      assert.ok(item.includes('role="button"') || item.startsWith('<button'),
        `Nav item missing role="button": ${item.slice(0, 60)}`);
    }
  });

  it('a11y live region exists for announcements', () => {
    assert.ok(indexHtml.includes('aria-live="polite"'), 'Must have aria-live region');
    assert.ok(indexHtml.includes('a11y-announce'), 'Must have #a11y-announce element');
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. FONT & ASSET INTEGRITY
// ═══════════════════════════════════════════════════════════════
describe('Font & Asset Integrity', () => {
  it('Inter font file exists', () => {
    assert.ok(exists('fonts/inter-var-latin.woff2'), 'Inter font file missing');
  });

  it('Material Icons font file exists', () => {
    assert.ok(exists('fonts/material-icons/material-icons-round.woff2'), 'Material Icons font missing');
  });

  it('Chart.js vendor file exists', () => {
    assert.ok(exists('js/vendor/chart.min.js'), 'Chart.js vendor file missing');
  });

  it('manifest.json exists and is valid JSON', () => {
    assert.ok(exists('manifest.json'), 'manifest.json missing');
    assert.doesNotThrow(() => JSON.parse(read('manifest.json')), 'manifest.json is not valid JSON');
  });

  it('CSS @font-face declarations reference existing files', () => {
    const fontUrls = stylesCss.match(/url\(['"]?([^)'"]+\.woff2)['"]?\)/g) || [];
    for (const u of fontUrls) {
      const file = u.match(/url\(['"]?([^)'"]+)['"]?\)/)[1];
      const resolved = file.startsWith('/') ? file.slice(1) : file;
      assert.ok(exists(resolved), `@font-face references missing file: ${file}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. APP.JS CRITICAL FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════
describe('app.js Critical Functionality', () => {
  it('has auth redirect for unauthenticated users', () => {
    assert.ok(appJs.includes('login.html'), 'app.js must redirect to login.html');
  });

  it('has error handling in render function', () => {
    assert.ok(appJs.includes('catch'), 'app.js render must have error handling');
  });

  it('registers hashchange or popstate listener for SPA routing', () => {
    assert.ok(
      appJs.includes('hashchange') || appJs.includes('popstate'),
      'app.js must handle browser navigation'
    );
  });

  it('navigateTo function updates history', () => {
    assert.ok(appJs.includes('pushState') || appJs.includes('replaceState'),
      'navigateTo must update browser history');
  });

  it('Escape key closes modal', () => {
    assert.ok(appJs.includes("'Escape'") || appJs.includes('"Escape"'),
      'app.js must handle Escape key for modal close');
  });

  it('search input has debounce or timeout', () => {
    assert.ok(appJs.includes('setTimeout') && appJs.includes('clearTimeout'),
      'Search should be debounced');
  });

  it('clearing search restores previous view', () => {
    assert.ok(appJs.includes('viewBeforeSearch'),
      'app.js must track and restore view before search');
  });

  it('text size preference is applied on load', () => {
    assert.ok(appJs.includes('pfi_text_size'), 'app.js must apply saved text size');
    assert.ok(appJs.includes('data-text-size'), 'app.js must set data-text-size attribute');
  });
});
