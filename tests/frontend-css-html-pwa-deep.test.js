// tests/frontend-css-html-pwa-deep.test.js — CSS themes, HTML structure, PWA manifest
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const cssFile = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
const loginCss = fs.readFileSync(path.join(PUBLIC, 'css', 'login.css'), 'utf8');
const landingCss = fs.readFileSync(path.join(PUBLIC, 'css', 'landing.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
const landingHtml = fs.readFileSync(path.join(PUBLIC, 'landing.html'), 'utf8');
const manifestJson = fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestJson);

// ════════════════════════════════════════════════════════════════
// CSS — Theme System
// ════════════════════════════════════════════════════════════════

describe('CSS — Theme Variables (:root)', () => {
  const rootVars = [
    '--bg-primary', '--bg-secondary', '--bg-tertiary',
    '--text-primary', '--text-secondary', '--text-muted',
    '--border', '--accent', '--accent-light',
    '--green', '--green-bg', '--red', '--red-bg',
    '--yellow', '--yellow-bg',
    '--radius', '--radius-sm', '--sidebar-width', '--font',
    '--transition-fast', '--transition-medium',
  ];

  for (const v of rootVars) {
    it(`defines ${v}`, () => {
      assert.ok(cssFile.includes(v), `Missing CSS variable: ${v}`);
    });
  }
});

describe('CSS — Entity Accent Colors', () => {
  const entityVars = [
    '--entity-account', '--entity-budget', '--entity-goal',
    '--entity-subscription', '--entity-group', '--entity-recurring',
    '--entity-category', '--entity-insight', '--entity-report',
    '--entity-calendar', '--entity-challenge', '--entity-lending',
  ];

  for (const v of entityVars) {
    it(`defines ${v} in :root`, () => {
      assert.ok(cssFile.includes(v), `Missing entity color: ${v}`);
    });
  }
});

describe('CSS — All 6 Themes Defined', () => {
  const themes = ['light', 'forest', 'ocean', 'rose', 'nord'];

  it('default theme (dark/midnight) defined in :root', () => {
    assert.ok(cssFile.includes(':root {'));
    assert.ok(cssFile.includes('--bg-primary:'));
  });

  for (const theme of themes) {
    it(`defines [data-theme="${theme}"] block`, () => {
      assert.ok(cssFile.includes(`[data-theme="${theme}"]`));
    });

    it(`${theme} overrides --bg-primary`, () => {
      const block = cssFile.slice(cssFile.indexOf(`[data-theme="${theme}"]`));
      const end = block.indexOf('}');
      const vars = block.slice(0, end);
      assert.ok(vars.includes('--bg-primary:'), `${theme} missing --bg-primary`);
    });

    it(`${theme} overrides --accent`, () => {
      const block = cssFile.slice(cssFile.indexOf(`[data-theme="${theme}"]`));
      const end = block.indexOf('}');
      const vars = block.slice(0, end);
      assert.ok(vars.includes('--accent:'), `${theme} missing --accent`);
    });
  }

  it('prefers-color-scheme dark auto-detection', () => {
    assert.ok(cssFile.includes('prefers-color-scheme'));
  });
});

describe('CSS — Self-Hosted Fonts', () => {
  it('has @font-face for Inter', () => {
    assert.ok(cssFile.includes("font-family: 'Inter'"));
  });

  it('has @font-face for Material Icons Round', () => {
    assert.ok(cssFile.includes("font-family: 'Material Icons Round'"));
  });

  it('uses local font files (not CDN)', () => {
    assert.ok(cssFile.includes("url('/fonts/"));
    assert.ok(!cssFile.includes('fonts.googleapis.com'));
    assert.ok(!cssFile.includes('cdnjs.cloudflare.com'));
  });

  it('uses woff2 format', () => {
    assert.ok(cssFile.includes("format('woff2')"));
  });

  it('has font-display: swap for Inter (performance)', () => {
    assert.ok(cssFile.includes('font-display: swap'));
  });

  it('has font-display: block for Material Icons (prevent FOUC)', () => {
    assert.ok(cssFile.includes('font-display: block'));
  });
});

describe('CSS — Text Size Scaling', () => {
  it('default font-size is 16px', () => {
    assert.ok(cssFile.includes('font-size: 16px'));
  });

  it('small text-size is 14px', () => {
    assert.ok(cssFile.includes('[data-text-size="small"]'));
    assert.ok(cssFile.includes('font-size: 14px'));
  });

  it('large text-size is 18px', () => {
    assert.ok(cssFile.includes('[data-text-size="large"]'));
    assert.ok(cssFile.includes('font-size: 18px'));
  });
});

describe('CSS — Accessibility Features', () => {
  it('has prefers-reduced-motion: reduce support', () => {
    assert.ok(cssFile.includes('prefers-reduced-motion: reduce'));
  });

  it('disables animations/transitions for reduced motion', () => {
    const motionBlock = cssFile.slice(cssFile.indexOf('prefers-reduced-motion'));
    assert.ok(motionBlock.includes('animation') || motionBlock.includes('transition'));
  });

  it('has :focus-visible styles', () => {
    assert.ok(cssFile.includes(':focus-visible'));
  });

  it('has .sr-only or screen-reader utility', () => {
    assert.ok(cssFile.includes('sr-only') || cssFile.includes('visually-hidden'));
  });
});

describe('CSS — Responsive Design', () => {
  it('has mobile breakpoint (@media)', () => {
    const mediaQueries = cssFile.match(/@media\s*\(/g) || [];
    assert.ok(mediaQueries.length >= 2, 'Need at least 2 media queries');
  });

  it('has max-width breakpoint for mobile', () => {
    assert.ok(cssFile.includes('max-width'));
  });

  it('sidebar responsive behavior', () => {
    assert.ok(cssFile.includes('.sidebar'));
  });

  it('bottom-nav for mobile screens', () => {
    assert.ok(cssFile.includes('.bottom-nav'));
  });

  it('bottom-sheet for mobile more menu', () => {
    assert.ok(cssFile.includes('.bottom-sheet'));
  });
});

describe('CSS — Component Styles', () => {
  const components = [
    '.sidebar', '.nav-item', '.view-header', '.card',
    '.stat-card', '.btn', '.btn-primary', '.btn-secondary',
    '.form-group', '.toast',
    '.modal-overlay', '.modal-form', '.progress-bar',
    '.fab', '.breadcrumb', '.pagination',
    '.bottom-nav', '.bottom-sheet',
    '.accounts-grid', '.budgets-grid', '.goals-grid', '.subs-grid', '.groups-grid',
  ];

  for (const c of components) {
    it(`defines ${c}`, () => {
      assert.ok(cssFile.includes(c), `Missing CSS component: ${c}`);
    });
  }
});

describe('CSS — Entity Card Borders', () => {
  it('account-card has entity-account color border', () => {
    assert.ok(cssFile.includes('.account-card'));
    assert.ok(cssFile.includes('entity-account'));
  });

  it('budget-card has entity-budget color', () => {
    assert.ok(cssFile.includes('.budget-card') || cssFile.includes('budgets-grid'));
    assert.ok(cssFile.includes('entity-budget'));
  });

  it('goal-card has entity-goal color', () => {
    assert.ok(cssFile.includes('.goal-card'));
    assert.ok(cssFile.includes('entity-goal'));
  });

  it('sub-card has entity-subscription color', () => {
    assert.ok(cssFile.includes('.sub-card'));
    assert.ok(cssFile.includes('entity-subscription'));
  });

  it('group-card has entity-group color', () => {
    assert.ok(cssFile.includes('.group-card'));
    assert.ok(cssFile.includes('entity-group'));
  });

  it('recurring-card has entity-recurring color', () => {
    assert.ok(cssFile.includes('.recurring-card'));
    assert.ok(cssFile.includes('entity-recurring'));
  });
});

describe('CSS — Entity Header Icons', () => {
  it('entity-icon class defined', () => {
    assert.ok(cssFile.includes('.entity-icon'));
  });

  it('entity-icon styles include border-radius', () => {
    const iconSection = cssFile.slice(cssFile.indexOf('.entity-icon'));
    const block = iconSection.slice(0, iconSection.indexOf('}') + 1);
    assert.ok(block.includes('border-radius'));
  });
});

describe('CSS — Toast Styles', () => {
  it('toast container defined', () => {
    assert.ok(cssFile.includes('#toast-container') || cssFile.includes('.toast-container'));
  });

  it('toast has success variant', () => {
    assert.ok(cssFile.includes('.toast-success') || cssFile.includes('toast.success'));
  });

  it('toast has error variant', () => {
    assert.ok(cssFile.includes('.toast-error') || cssFile.includes('toast.error'));
  });
});

describe('CSS — Transitions', () => {
  it('--transition-fast token defined', () => {
    assert.ok(cssFile.includes('--transition-fast'));
  });

  it('--transition-medium token defined', () => {
    assert.ok(cssFile.includes('--transition-medium'));
  });

  it('transitions used on interactive elements', () => {
    assert.ok(cssFile.includes('transition:'));
  });
});

describe('CSS — Loading & Error States', () => {
  it('loading spinner defined', () => {
    assert.ok(cssFile.includes('.loading') || cssFile.includes('@keyframes'));
  });

  it('skeleton loading class', () => {
    assert.ok(cssFile.includes('skeleton'));
  });

  it('empty state class', () => {
    assert.ok(cssFile.includes('empty-state'));
  });

  it('error state class', () => {
    assert.ok(cssFile.includes('error-state'));
  });
});

describe('CSS — Onboarding & Wizard', () => {
  it('onboarding class defined', () => {
    assert.ok(cssFile.includes('.onboarding'));
  });

  it('wizard dots defined', () => {
    assert.ok(cssFile.includes('.wizard-dot'));
  });

  it('onboarding wizard class', () => {
    assert.ok(cssFile.includes('.onboarding-wizard'));
  });
});

// ════════════════════════════════════════════════════════════════
// CSS — Login Page
// ════════════════════════════════════════════════════════════════

describe('CSS — Login Page', () => {
  it('login.css exists and has content', () => {
    assert.ok(loginCss.length > 100);
  });

  it('has auth-card class', () => {
    assert.ok(loginCss.includes('.auth-card'));
  });

  it('has tab styling for login/register', () => {
    assert.ok(loginCss.includes('.auth-tab') || loginCss.includes('tab'));
  });
});

describe('CSS — Landing Page', () => {
  it('landing.css exists and has content', () => {
    assert.ok(landingCss.length > 100);
  });

  it('has hero section', () => {
    assert.ok(landingCss.includes('.hero') || landingCss.includes('hero'));
  });
});

// ════════════════════════════════════════════════════════════════
// HTML — index.html Structure
// ════════════════════════════════════════════════════════════════

describe('HTML — index.html Structure', () => {
  it('has DOCTYPE', () => {
    assert.ok(indexHtml.toLowerCase().includes('<!doctype html>'));
  });

  it('has lang="en"', () => {
    assert.ok(indexHtml.includes('lang="en"'));
  });

  it('has charset UTF-8', () => {
    assert.ok(indexHtml.includes('UTF-8') || indexHtml.includes('utf-8'));
  });

  it('has viewport meta tag', () => {
    assert.ok(indexHtml.includes('name="viewport"'));
    assert.ok(indexHtml.includes('width=device-width'));
  });

  it('has theme-color meta', () => {
    assert.ok(indexHtml.includes('name="theme-color"'));
  });

  it('has title element', () => {
    assert.ok(indexHtml.includes('<title>'));
  });

  it('links to styles.css', () => {
    assert.ok(indexHtml.includes('href="/styles.css"') || indexHtml.includes("href='styles.css'") || indexHtml.includes('styles.css'));
  });

  it('links to manifest.json', () => {
    assert.ok(indexHtml.includes('manifest.json'));
  });

  it('includes service worker registration script', () => {
    assert.ok(indexHtml.includes('serviceWorker'));
    assert.ok(indexHtml.includes("register('/sw.js')") || indexHtml.includes('register'));
  });

  it('loads app.js as ES module', () => {
    assert.ok(indexHtml.includes('type="module"'));
    assert.ok(indexHtml.includes('js/app.js'));
  });

  it('has skip-to-content or a11y-announce region', () => {
    assert.ok(indexHtml.includes('a11y-announce') || indexHtml.includes('skip'));
  });
});

describe('HTML — login.html Structure', () => {
  it('has DOCTYPE', () => {
    assert.ok(loginHtml.toLowerCase().includes('<!doctype html>'));
  });

  it('has lang="en"', () => {
    assert.ok(loginHtml.includes('lang="en"'));
  });

  it('has viewport meta', () => {
    assert.ok(loginHtml.includes('viewport'));
  });

  it('has login form', () => {
    assert.ok(loginHtml.includes('<form'));
  });

  it('has username/email input', () => {
    assert.ok(loginHtml.includes('username') || loginHtml.includes('email'));
  });

  it('has password input', () => {
    assert.ok(loginHtml.includes('type="password"'));
  });

  it('links to login.css', () => {
    assert.ok(loginHtml.includes('login.css'));
  });

  it('loads login.js', () => {
    assert.ok(loginHtml.includes('login.js'));
  });

  it('has auth tabs (login/register)', () => {
    assert.ok(loginHtml.includes('Login') && loginHtml.includes('Register'));
  });

  it('has remember-me checkbox', () => {
    assert.ok(loginHtml.includes('remember') || loginHtml.includes('Remember'));
  });

  it('has password toggle button', () => {
    assert.ok(loginHtml.includes('toggle') || loginHtml.includes('visibility'));
  });
});

describe('HTML — landing.html Structure', () => {
  it('has DOCTYPE', () => {
    assert.ok(landingHtml.toLowerCase().includes('<!doctype html>'));
  });

  it('has lang="en"', () => {
    assert.ok(landingHtml.includes('lang="en"'));
  });

  it('has viewport meta', () => {
    assert.ok(landingHtml.includes('viewport'));
  });

  it('links to landing.css', () => {
    assert.ok(landingHtml.includes('landing.css'));
  });

  it('has CTA link to login', () => {
    assert.ok(landingHtml.includes('login.html') || landingHtml.includes('Login') || landingHtml.includes('Get Started'));
  });

  it('has app name/branding', () => {
    assert.ok(landingHtml.includes('FinanceFlow') || landingHtml.includes('PersonalFi'));
  });
});

// ════════════════════════════════════════════════════════════════
// PWA — manifest.json
// ════════════════════════════════════════════════════════════════

describe('PWA — manifest.json', () => {
  it('has name', () => {
    assert.ok(manifest.name);
    assert.ok(manifest.name.length > 0);
  });

  it('has short_name', () => {
    assert.ok(manifest.short_name);
  });

  it('has description', () => {
    assert.ok(manifest.description);
  });

  it('has start_url "/"', () => {
    assert.equal(manifest.start_url, '/');
  });

  it('display is standalone', () => {
    assert.equal(manifest.display, 'standalone');
  });

  it('has background_color', () => {
    assert.ok(manifest.background_color);
    assert.ok(manifest.background_color.match(/^#[0-9a-f]{6}$/i));
  });

  it('has theme_color', () => {
    assert.ok(manifest.theme_color);
    assert.ok(manifest.theme_color.match(/^#[0-9a-f]{6}$/i));
  });

  it('has icons array', () => {
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.length >= 2);
  });

  it('has 192px icon', () => {
    const icon192 = manifest.icons.find(i => i.sizes === '192x192');
    assert.ok(icon192);
    assert.equal(icon192.type, 'image/png');
  });

  it('has 512px icon', () => {
    const icon512 = manifest.icons.find(i => i.sizes === '512x512');
    assert.ok(icon512);
    assert.equal(icon512.type, 'image/png');
  });

  it('has icons with purpose any/maskable', () => {
    const withPurpose = manifest.icons.filter(i => i.purpose && i.purpose.includes('maskable'));
    assert.ok(withPurpose.length > 0);
  });

  it('has SVG fallback icon', () => {
    const svg = manifest.icons.find(i => i.type === 'image/svg+xml');
    assert.ok(svg);
  });

  it('has categories', () => {
    assert.ok(Array.isArray(manifest.categories));
    assert.ok(manifest.categories.includes('finance'));
  });

  it('has shortcuts', () => {
    assert.ok(Array.isArray(manifest.shortcuts));
    assert.ok(manifest.shortcuts.length >= 2);
  });

  it('has Add Transaction shortcut', () => {
    const addTxn = manifest.shortcuts.find(s => s.name.includes('Transaction'));
    assert.ok(addTxn);
    assert.ok(addTxn.url);
  });

  it('has Dashboard shortcut', () => {
    const dash = manifest.shortcuts.find(s => s.name.includes('Dashboard'));
    assert.ok(dash);
    assert.ok(dash.url);
  });

  it('has orientation field', () => {
    assert.ok(manifest.orientation);
  });
});

// ════════════════════════════════════════════════════════════════
// Font Files — Existence
// ════════════════════════════════════════════════════════════════

describe('Font Files — Self-hosted', () => {
  it('Inter font file exists', () => {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'fonts', 'inter-var-latin.woff2')));
  });

  it('Material Icons font file exists', () => {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'fonts', 'material-icons', 'material-icons-round.woff2')));
  });
});

// ════════════════════════════════════════════════════════════════
// Icon Files — Existence
// ════════════════════════════════════════════════════════════════

describe('Icon Files — PWA', () => {
  it('icon-192.png exists', () => {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'icons', 'icon-192.png')));
  });

  it('icon-512.png exists', () => {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'icons', 'icon-512.png')));
  });
});
