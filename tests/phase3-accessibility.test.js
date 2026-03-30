const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

describe('Phase 3 — Accessibility Compliance (P1)', () => {

  // ─── 3.1 Keyboard-Focusable Nav Items ───

  describe('3.1 Nav items are keyboard-focusable', () => {
    it('all .nav-item[data-view] elements have tabindex="0"', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      const navItems = html.match(/<li\s[^>]*class="nav-item"[^>]*data-view="[^"]*"[^>]*>/g) || [];
      assert.ok(navItems.length > 0, 'Should find nav-item elements with data-view');
      for (const item of navItems) {
        assert.ok(item.includes('tabindex="0"'), `Nav item missing tabindex="0": ${item}`);
      }
    });

    it('all .nav-item[data-view] elements have role="button"', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      const navItems = html.match(/<li\s[^>]*class="nav-item[^"]*"[^>]*data-view="[^"]*"[^>]*>/g) || [];
      assert.ok(navItems.length > 0, 'Should find nav-item elements with data-view');
      for (const item of navItems) {
        assert.ok(item.includes('role="button"'), `Nav item missing role="button": ${item}`);
      }
    });

    it('app.js has keydown handler for nav items with Enter and Space', () => {
      const js = fs.readFileSync(path.join(PUBLIC, 'js', 'app.js'), 'utf8');
      assert.ok(js.includes('keydown'), 'app.js must have keydown event listener');
      assert.ok(js.includes("'Enter'") || js.includes('"Enter"'), 'app.js must handle Enter key');
      assert.ok(js.includes("' '") || js.includes('" "'), 'app.js must handle Space key');
    });
  });

  // ─── 3.2 Color Contrast ───

  describe('3.2 Color contrast for --text-muted', () => {
    it('--text-muted is NOT the old low-contrast value #64748b', () => {
      const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
      const match = css.match(/--text-muted:\s*(#[0-9a-fA-F]{6})/);
      assert.ok(match, '--text-muted CSS variable must exist');
      assert.notEqual(match[1].toLowerCase(), '#64748b', '--text-muted must not be the old low-contrast #64748b');
    });

    it('--text-muted has >= 4.5:1 contrast ratio against --bg-primary #0f172a', () => {
      const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
      const mutedMatch = css.match(/--text-muted:\s*(#[0-9a-fA-F]{6})/);
      assert.ok(mutedMatch, '--text-muted must exist');

      const hex = mutedMatch[1];
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;

      function linearize(c) {
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      }

      const textLum = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);

      // --bg-primary: #0f172a
      const bgR = 0x0f / 255, bgG = 0x17 / 255, bgB = 0x2a / 255;
      const bgLum = 0.2126 * linearize(bgR) + 0.7152 * linearize(bgG) + 0.0722 * linearize(bgB);

      const L1 = Math.max(textLum, bgLum);
      const L2 = Math.min(textLum, bgLum);
      const ratio = (L1 + 0.05) / (L2 + 0.05);

      assert.ok(ratio >= 4.5, `Contrast ratio ${ratio.toFixed(2)} must be >= 4.5:1`);
    });
  });

  // ─── 3.3 Toast a11y & non-color indicators ───

  describe('3.3 Toast a11y', () => {
    it('toast-container has role="status" in index.html', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      const match = html.match(/<div[^>]*id="toast-container"[^>]*>/);
      assert.ok(match, 'toast-container element must exist');
      assert.ok(match[0].includes('role="status"'), 'toast-container must have role="status"');
    });

    it('toast-container has aria-live="polite" in index.html', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      const match = html.match(/<div[^>]*id="toast-container"[^>]*>/);
      assert.ok(match, 'toast-container element must exist');
      assert.ok(match[0].includes('aria-live="polite"'), 'toast-container must have aria-live="polite"');
    });

    it('utils.js toast function references a11y-announce', () => {
      const js = fs.readFileSync(path.join(PUBLIC, 'js', 'utils.js'), 'utf8');
      assert.ok(js.includes('a11y-announce'), 'toast function must reference a11y-announce for screen reader support');
    });
  });

  describe('3.3 Non-color income/expense indicators', () => {
    it('transactions.js uses + prefix for income amounts', () => {
      const js = fs.readFileSync(path.join(PUBLIC, 'js', 'views', 'transactions.js'), 'utf8');
      assert.ok(js.includes("'+'") || js.includes('"+"'), 'transactions.js must use + prefix for income');
    });

    it('transactions.js uses − (Unicode minus) prefix for expense amounts', () => {
      const js = fs.readFileSync(path.join(PUBLIC, 'js', 'views', 'transactions.js'), 'utf8');
      assert.ok(js.includes('\u2212') || js.includes('\\u2212'), 'transactions.js must use Unicode minus (−) for expenses');
    });

    it('transactions.js uses → indicator for transfers', () => {
      const js = fs.readFileSync(path.join(PUBLIC, 'js', 'views', 'transactions.js'), 'utf8');
      assert.ok(js.includes('\u2192') || js.includes('→') || js.includes('\\u2192'),
        'transactions.js must use → indicator for transfers');
    });
  });

  // ─── Focus-visible styles ───

  describe('Focus-visible styles', () => {
    it(':focus-visible styles exist for [tabindex] elements in styles.css', () => {
      const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
      assert.ok(css.includes('focus-visible'), 'styles.css must have :focus-visible styles');
      assert.ok(css.includes('[tabindex]') || css.includes('.nav-item:focus-visible'),
        'focus-visible must target tabindex or nav-item elements');
    });
  });
});
