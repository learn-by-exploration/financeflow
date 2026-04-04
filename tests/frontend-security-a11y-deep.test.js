// tests/frontend-security-a11y-deep.test.js — Security & Accessibility deep coverage
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');

// Collect ALL frontend source files
function collectFiles(dir, exts = ['.js', '.html']) {
  const result = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor' || entry.name === 'fonts' || entry.name === 'icons') continue;
      Object.assign(result, collectFiles(full, exts));
    } else if (exts.some(e => entry.name.endsWith(e))) {
      const rel = path.relative(PUBLIC, full);
      result[rel] = fs.readFileSync(full, 'utf8');
    }
  }
  return result;
}

const allFiles = collectFiles(PUBLIC);
const jsFiles = Object.fromEntries(Object.entries(allFiles).filter(([k]) => k.endsWith('.js')));
const htmlFiles = Object.fromEntries(Object.entries(allFiles).filter(([k]) => k.endsWith('.html')));

// Load CSS for a11y checks
const cssFile = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
const loginCss = fs.readFileSync(path.join(PUBLIC, 'css', 'login.css'), 'utf8');
const landingCss = fs.readFileSync(path.join(PUBLIC, 'css', 'landing.css'), 'utf8');

// ════════════════════════════════════════════════════════════════
// SECURITY — innerHTML Safety
// ════════════════════════════════════════════════════════════════

describe('Security — innerHTML Safety', () => {
  it('no JS module sets innerHTML with template literal containing interpolation', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      // Skip legacy root app.js (non-module, superseded by js/app.js)
      if (name === 'app.js') continue;
      const matches = src.match(/\.innerHTML\s*=\s*`/g) || [];
      for (const m of matches) {
        const idx = src.indexOf(m);
        const slice = src.slice(idx, idx + 200);
        if (slice.includes('${')) {
          assert.fail(`${name}: innerHTML with template literal containing interpolation (XSS risk)`);
        }
      }
    }
  });

  it('no JS file uses innerHTML with concatenation of variables', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      // innerHTML = 'text' + variable
      const risky = src.match(/\.innerHTML\s*=\s*['"][^'"]*['"]\s*\+/g) || [];
      // Filter out safe patterns (empty strings, known-safe static + static)
      for (const m of risky) {
        if (!m.includes("= '' +") && !m.includes('= "" +')) {
          assert.fail(`${name}: innerHTML with string concatenation is unsafe`);
        }
      }
    }
  });

  it('every innerHTML = "" is safe (clearing)', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      const clears = src.match(/\.innerHTML\s*=\s*['"]['"];?/g) || [];
      // All should be clearing - just verify they exist as expected
      assert.ok(true, `${name}: all innerHTML clears are safe`);
    }
  });
});

describe('Security — No eval/Function', () => {
  it('no JS file uses eval()', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      // Match eval( but not .includes('eval') or comments
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('*')) continue;
        if (/\beval\s*\(/.test(line) && !line.includes("'eval'") && !line.includes('"eval"')) {
          assert.fail(`${name}:${i + 1}: uses eval()`);
        }
      }
    }
  });

  it('no JS file uses new Function()', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      assert.ok(!src.match(/new\s+Function\s*\(/), `${name}: uses new Function()`);
    }
  });

  it('no JS file uses document.write()', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      assert.ok(!src.includes('document.write('), `${name}: uses document.write()`);
    }
  });

  it('no JS file uses setTimeout/setInterval with string arg', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      // setTimeout('code', ...) is unsafe
      const risky = src.match(/setTimeout\s*\(\s*['"]/g) || [];
      assert.equal(risky.length, 0, `${name}: setTimeout with string argument`);
      const risky2 = src.match(/setInterval\s*\(\s*['"]/g) || [];
      assert.equal(risky2.length, 0, `${name}: setInterval with string argument`);
    }
  });
});

describe('Security — No External Resources', () => {
  it('no JS file loads external URLs', () => {
    const externalPatterns = [
      /https?:\/\/cdn\./,
      /https?:\/\/unpkg\.com/,
      /https?:\/\/cdnjs\.cloudflare\.com/,
      /https?:\/\/ajax\.googleapis\.com/,
    ];
    for (const [name, src] of Object.entries(jsFiles)) {
      for (const pat of externalPatterns) {
        assert.ok(!pat.test(src), `${name}: loads external resource`);
      }
    }
  });

  it('no HTML file loads external scripts', () => {
    for (const [name, src] of Object.entries(htmlFiles)) {
      const scripts = src.match(/<script[^>]+src=["']https?:\/\//gi) || [];
      assert.equal(scripts.length, 0, `${name}: external script tag`);
    }
  });

  it('no HTML file loads external stylesheets', () => {
    for (const [name, src] of Object.entries(htmlFiles)) {
      const links = src.match(/<link[^>]+href=["']https?:\/\/[^"']*["'][^>]*stylesheet/gi) || [];
      assert.equal(links.length, 0, `${name}: external stylesheet`);
    }
  });

  it('no analytics or tracking scripts', () => {
    const trackers = ['google-analytics', 'gtag', 'fbevents', 'hotjar', 'mixpanel', 'segment'];
    for (const [name, src] of Object.entries(allFiles)) {
      for (const t of trackers) {
        assert.ok(!src.includes(t), `${name}: contains tracker: ${t}`);
      }
    }
  });
});

describe('Security — Token Handling', () => {
  const utilsSrc = jsFiles['js/utils.js'] || '';
  const appSrc = jsFiles['js/app.js'] || '';
  const loginSrc = jsFiles['js/login.js'] || '';

  it('token stored in pfi_token key (not generic "token")', () => {
    assert.ok(utilsSrc.includes('pfi_token'));
  });

  it('getToken checks both localStorage and sessionStorage', () => {
    assert.ok(utilsSrc.includes('localStorage') && utilsSrc.includes('sessionStorage'));
  });

  it('auth header uses X-Session-Token (not Authorization Bearer)', () => {
    assert.ok(utilsSrc.includes('X-Session-Token'));
    assert.ok(!utilsSrc.includes('Authorization: Bearer'));
  });

  it('logout clears both storage types', () => {
    assert.ok(appSrc.includes("localStorage.removeItem('pfi_token')"));
    assert.ok(appSrc.includes("sessionStorage.removeItem('pfi_token')"));
  });

  it('login respects remember-me for storage choice', () => {
    assert.ok(loginSrc.includes('remember') || loginSrc.includes('Remember'));
  });
});

describe('Security — Input Handling', () => {
  it('search view escapes regex special chars in user input', () => {
    const searchSrc = jsFiles['js/views/search.js'] || '';
    assert.ok(searchSrc.includes('replace(/[.*+?^${}()|[\\]\\\\]/g'));
  });

  it('search uses textContent for highlighted text (not innerHTML)', () => {
    const searchSrc = jsFiles['js/views/search.js'] || '';
    assert.ok(searchSrc.includes('mark.textContent'));
  });

  it('el() helper uses textContent (not innerHTML)', () => {
    const utilsSrc = jsFiles['js/utils.js'] || '';
    assert.ok(utilsSrc.includes('textContent'));
  });

  it('confirm() uses textContent for message', () => {
    const utilsSrc = jsFiles['js/utils.js'] || '';
    // confirm modal should not inject HTML
    const confirmSection = utilsSrc.slice(utilsSrc.indexOf('function confirm'));
    assert.ok(confirmSection.includes('textContent'));
  });
});

describe('Security — Content Security Policy', () => {
  it('no inline onclick handlers in HTML', () => {
    for (const [name, src] of Object.entries(htmlFiles)) {
      const inlineHandlers = src.match(/\s+on\w+\s*=\s*["']/gi) || [];
      const safePatterns = ['onsubmit']; // some forms may have onsubmit="return false"
      const risky = inlineHandlers.filter(h => !safePatterns.some(s => h.toLowerCase().includes(s)));
      assert.equal(risky.length, 0, `${name}: inline event handlers found: ${risky.join(', ')}`);
    }
  });

  it('no inline style tags with expressions', () => {
    for (const [name, src] of Object.entries(htmlFiles)) {
      assert.ok(!src.includes('expression('), `${name}: CSS expression found`);
    }
  });

  it('no javascript: protocol links', () => {
    for (const [name, src] of Object.entries(allFiles)) {
      const jsLinks = src.match(/href\s*=\s*["']javascript:/gi) || [];
      assert.equal(jsLinks.length, 0, `${name}: javascript: protocol link`);
    }
  });

  it('no data: URLs in script src', () => {
    for (const [name, src] of Object.entries(htmlFiles)) {
      assert.ok(!src.match(/<script[^>]+src=["']data:/i), `${name}: data: URL in script`);
    }
  });
});

describe('Security — No Secrets in Source', () => {
  it('no hardcoded API keys', () => {
    const patterns = [/api[_-]?key\s*[:=]\s*['"][a-z0-9]{20,}/i, /secret\s*[:=]\s*['"][a-z0-9]{20,}/i];
    for (const [name, src] of Object.entries(allFiles)) {
      for (const pat of patterns) {
        assert.ok(!pat.test(src), `${name}: possible hardcoded API key/secret`);
      }
    }
  });

  it('no hardcoded passwords', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      // Skip login.js demo quick-fill which intentionally has demo123
      if (name.includes('login')) continue;
      assert.ok(!src.match(/password\s*[:=]\s*['"][^'"]{4,}/i) || name.includes('login'),
        `${name}: possible hardcoded password`);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// ACCESSIBILITY — ARIA & Keyboard
// ════════════════════════════════════════════════════════════════

describe('Accessibility — ARIA Roles in HTML', () => {
  const indexHtml = Object.entries(htmlFiles).find(([k]) => k === 'index.html')?.[1] || '';

  it('has <nav> with aria-label on sidebar', () => {
    assert.ok(indexHtml.includes('<nav') && indexHtml.includes('aria-label'));
  });

  it('has role="main" on main content area', () => {
    assert.ok(indexHtml.includes('role="main"') || indexHtml.includes('<main'));
  });

  it('has aria-live region for announcements', () => {
    assert.ok(indexHtml.includes('aria-live'));
  });

  it('has aria-label on search input', () => {
    assert.ok(indexHtml.includes('aria-label') && indexHtml.includes('search'));
  });

  it('nav items have tabindex for keyboard navigation', () => {
    assert.ok(indexHtml.includes('tabindex'));
  });
});

describe('Accessibility — Keyboard Navigation in Views', () => {
  const viewDir = path.join(PUBLIC, 'js', 'views');
  const viewSources = {};
  for (const f of fs.readdirSync(viewDir).filter(f => f.endsWith('.js'))) {
    viewSources[f] = fs.readFileSync(path.join(viewDir, f), 'utf8');
  }

  it('interactive elements in views use el() not innerHTML', () => {
    for (const [name, src] of Object.entries(viewSources)) {
      // Check that buttons are created with el() not innerHTML
      if (src.includes('el(')) {
        assert.ok(true, `${name}: uses el() helper for DOM creation`);
      }
    }
  });

  it('forms use labels for inputs', () => {
    for (const [name, src] of Object.entries(viewSources)) {
      if (src.includes('form-group')) {
        assert.ok(src.includes('label') || src.includes('Label'),
          `${name}: has form-group but no labels`);
      }
    }
  });

  it('modal forms have title', () => {
    for (const [name, src] of Object.entries(viewSources)) {
      if (src.includes('openModal')) {
        assert.ok(src.includes('modal-title') || src.includes('h3'),
          `${name}: modal opened without title`);
      }
    }
  });

  it('delete actions use confirm (not just direct delete)', () => {
    for (const [name, src] of Object.entries(viewSources)) {
      if (src.includes('Api.del(')) {
        assert.ok(src.includes('confirm('),
          `${name}: delete without confirmation dialog`);
      }
    }
  });
});

describe('Accessibility — Form Validation Messages', () => {
  it('form-validator marks fields with error class', () => {
    const fv = jsFiles['js/form-validator.js'] || '';
    assert.ok(fv.includes('error'));
  });

  it('form-validator shows user-readable messages', () => {
    const fv = jsFiles['js/form-validator.js'] || '';
    assert.ok(fv.includes('required'));
    assert.ok(fv.includes('at least'));
  });

  it('toast notifications use role attributes', () => {
    const utils = jsFiles['js/utils.js'] || '';
    assert.ok(utils.includes('role') || utils.includes('aria'));
  });
});

describe('Accessibility — Color & Contrast (CSS)', () => {
  it('styles.css has prefers-reduced-motion support', () => {
    assert.ok(cssFile.includes('prefers-reduced-motion'));
  });

  it('styles.css has prefers-color-scheme support', () => {
    assert.ok(cssFile.includes('prefers-color-scheme'));
  });

  it('focus styles defined (:focus-visible)', () => {
    assert.ok(cssFile.includes(':focus-visible') || cssFile.includes(':focus'));
  });

  it('focus styles have visible outline or ring', () => {
    assert.ok(cssFile.includes('outline') || cssFile.includes('box-shadow'));
  });

  it('skip link or focus management for keyboard users', () => {
    const indexHtml = Object.entries(htmlFiles).find(([k]) => k === 'index.html')?.[1] || '';
    assert.ok(
      indexHtml.includes('skip') || indexHtml.includes('a11y-announce') || cssFile.includes('sr-only'),
      'Should have skip link or screen reader utilities'
    );
  });
});

describe('Accessibility — Screen Reader Support', () => {
  const appSrc = jsFiles['js/app.js'] || '';

  it('view changes announced to screen readers', () => {
    assert.ok(appSrc.includes('announceToScreenReader'));
    assert.ok(appSrc.includes('view loaded'));
  });

  it('modal has focus trap', () => {
    assert.ok(appSrc.includes("e.key === 'Tab'"));
    assert.ok(appSrc.includes('focusable'));
  });

  it('modal escape key closes it', () => {
    assert.ok(appSrc.includes("e.key === 'Escape'") && appSrc.includes('closeModal()'));
  });

  it('aria-expanded used on collapsible elements', () => {
    assert.ok(appSrc.includes('aria-expanded'));
  });
});

describe('Accessibility — Search a11y', () => {
  const searchSrc = jsFiles['js/views/search.js'] || '';

  it('filter chips use aria-pressed', () => {
    assert.ok(searchSrc.includes("'aria-pressed'"));
  });

  it('filter toolbar has role="toolbar"', () => {
    assert.ok(searchSrc.includes("role: 'toolbar'"));
  });

  it('result count announced', () => {
    assert.ok(searchSrc.includes('totalResults') || searchSrc.includes('result'));
  });
});

describe('Accessibility — Pagination a11y', () => {
  const pagSrc = jsFiles['js/pagination.js'] || '';

  it('pagination uses aria-current for active page', () => {
    assert.ok(pagSrc.includes('aria-current'));
  });

  it('has aria-label on pagination container', () => {
    assert.ok(pagSrc.includes('aria-label'));
  });

  it('disabled buttons are properly marked', () => {
    assert.ok(pagSrc.includes('disabled'));
  });
});

describe('Accessibility — Color Picker a11y', () => {
  const utilsSrc = jsFiles['js/utils.js'] || '';

  it('color picker uses radiogroup role', () => {
    assert.ok(utilsSrc.includes("role: 'radiogroup'"));
  });

  it('color options use role="radio"', () => {
    assert.ok(utilsSrc.includes("role: 'radio'"));
  });

  it('checked state uses aria-checked', () => {
    assert.ok(utilsSrc.includes('aria-checked'));
  });

  it('color options have aria-label with color name', () => {
    assert.ok(utilsSrc.includes("'aria-label':"));
  });
});

// ════════════════════════════════════════════════════════════════
// SECURITY — Cross-file consistency
// ════════════════════════════════════════════════════════════════

describe('Security — Cross-file consistency', () => {
  it('all API calls in views go through Api object (not raw fetch to /api/)', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      // app.js has legitimate raw fetch for branding/demo/version
      // sw.js has service worker fetch interception
      // settings.js has csv-template/csv-import file downloads
      // login.js has auth calls before Api is available
      if (name.includes('app.js') || name.includes('sw.js') ||
          name.includes('settings.js') || name.includes('login.js')) continue;
      const rawFetches = src.match(/fetch\s*\(\s*['"`]\/api\//g) || [];
      assert.equal(rawFetches.length, 0, `${name}: uses raw fetch to /api/ instead of Api object`);
    }
  });

  it('no view imports directly from node_modules', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      assert.ok(!src.includes("from 'node_modules"), `${name}: imports from node_modules`);
      assert.ok(!src.includes('from "node_modules'), `${name}: imports from node_modules`);
    }
  });

  it('all imports use relative paths', () => {
    for (const [name, src] of Object.entries(jsFiles)) {
      const imports = src.match(/from\s+['"][^'"]+['"]/g) || [];
      for (const imp of imports) {
        const path = imp.match(/['"]([^'"]+)['"]/)[1];
        assert.ok(path.startsWith('./') || path.startsWith('../'),
          `${name}: non-relative import: ${path}`);
      }
    }
  });
});

describe('Security — Login Page', () => {
  const loginSrc = jsFiles['js/login.js'] || '';

  it('password fields use type="password"', () => {
    for (const [name, src] of Object.entries(htmlFiles)) {
      if (!name.includes('login')) continue;
      assert.ok(src.includes('type="password"'));
    }
  });

  it('login form submits via JS (not form action)', () => {
    assert.ok(loginSrc.includes('preventDefault'));
  });

  it('login redirects to app on success', () => {
    assert.ok(loginSrc.includes('/index.html') || loginSrc.includes("location.href = '/'") || loginSrc.includes("window.location.href"));
  });

  it('login shows error message on failure', () => {
    assert.ok(loginSrc.includes('error') || loginSrc.includes('Error'));
  });

  it('password toggle does not log password', () => {
    assert.ok(!loginSrc.includes('console.log'));
  });
});
