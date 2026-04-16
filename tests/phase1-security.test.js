const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, teardown, rawAgent } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

describe('Phase 1 — Security Foundation (P0)', () => {
  before(() => setup());
  after(() => teardown());

  // ─── 1.1 Self-Host All External Dependencies ───

  describe('1.1 Self-hosted assets', () => {
    it('Inter variable font file exists', () => {
      assert.ok(fs.existsSync(path.join(PUBLIC, 'fonts', 'inter-var-latin.woff2')),
        'public/fonts/inter-var-latin.woff2 must exist');
    });

    it('Material Icons Round font file exists', () => {
      assert.ok(fs.existsSync(path.join(PUBLIC, 'fonts', 'material-icons', 'material-icons-round.woff2')),
        'public/fonts/material-icons/material-icons-round.woff2 must exist');
    });

    it('Chart.js vendor bundle exists', () => {
      assert.ok(fs.existsSync(path.join(PUBLIC, 'js', 'vendor', 'chart.min.js')),
        'public/js/vendor/chart.min.js must exist');
    });

    it('Chart.js vendor bundle is non-trivial (>50KB)', () => {
      const stat = fs.statSync(path.join(PUBLIC, 'js', 'vendor', 'chart.min.js'));
      assert.ok(stat.size > 50000, `chart.min.js should be >50KB, got ${stat.size}`);
    });

    it('styles.css contains @font-face for Inter', () => {
      const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
      assert.ok(css.includes("font-family: 'Inter'"), 'styles.css must have @font-face for Inter');
      assert.ok(css.includes('inter-var-latin.woff2'), 'must reference inter-var-latin.woff2');
    });

    it('styles.css contains @font-face for Material Icons Round', () => {
      const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
      assert.ok(css.includes("font-family: 'Material Icons Round'"),
        'styles.css must have @font-face for Material Icons Round');
      assert.ok(css.includes('material-icons-round.woff2'),
        'must reference material-icons-round.woff2');
    });

    it('styles.css contains .material-icons-round class', () => {
      const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
      assert.ok(css.includes('.material-icons-round'),
        'styles.css must have .material-icons-round class');
    });

    it('index.html has no Google Fonts CDN links', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      assert.ok(!html.includes('fonts.googleapis.com'), 'index.html must not reference fonts.googleapis.com');
      assert.ok(!html.includes('fonts.gstatic.com'), 'index.html must not reference fonts.gstatic.com');
    });

    it('index.html has no cdn.jsdelivr.net links', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      assert.ok(!html.includes('cdn.jsdelivr.net'), 'index.html must not reference cdn.jsdelivr.net');
    });

    it('index.html references local chart.min.js', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      assert.ok(html.includes('/js/vendor/chart.min.js'), 'index.html must reference /js/vendor/chart.min.js');
    });

    it('login.html has no Google Fonts CDN links', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
      assert.ok(!html.includes('fonts.googleapis.com'), 'login.html must not reference fonts.googleapis.com');
      assert.ok(!html.includes('fonts.gstatic.com'), 'login.html must not reference fonts.gstatic.com');
    });
  });

  // ─── 1.2 Remove CSP unsafe-inline ───

  describe('1.2 CSP no unsafe-inline', () => {
    it('login.html has no inline <style> block', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
      assert.ok(!html.includes('<style>'), 'login.html must not have inline <style>');
    });

    it('login.html has no inline <script> block', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
      assert.ok(!html.includes('<script>'), 'login.html must not have inline <script>');
    });

    it('login.html references external login.css', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
      assert.ok(html.includes('css/login.css'), 'login.html must reference css/login.css');
    });

    it('login.html references external login.js', () => {
      const html = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
      assert.ok(html.includes('js/login.js'), 'login.html must reference js/login.js');
    });

    it('public/css/login.css exists and has auth-card styles', () => {
      const css = fs.readFileSync(path.join(PUBLIC, 'css', 'login.css'), 'utf8');
      assert.ok(css.includes('.auth-card'), 'login.css must have .auth-card styles');
    });

    it('public/js/login.js exists and has form handler', () => {
      const js = fs.readFileSync(path.join(PUBLIC, 'js', 'login.js'), 'utf8');
      assert.ok(js.includes('auth-form'), 'login.js must handle auth-form');
      assert.ok(js.includes('addEventListener'), 'login.js must have event listeners');
    });

    it('CSP script-src does not contain unsafe-inline', () => {
      const serverSrc = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
      // Find the scriptSrc line
      const scriptSrcMatch = serverSrc.match(/scriptSrc:\s*\[([^\]]+)\]/);
      assert.ok(scriptSrcMatch, 'scriptSrc directive must exist');
      assert.ok(!scriptSrcMatch[1].includes('unsafe-inline'),
        'scriptSrc must not contain unsafe-inline');
    });

    it('CSP style-src allows unsafe-inline (required for dynamic el() styles)', () => {
      const serverSrc = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
      const styleSrcMatch = serverSrc.match(/styleSrc:\s*\[([^\]]+)\]/);
      assert.ok(styleSrcMatch, 'styleSrc directive must exist');
      // unsafe-inline is required for style-src because el() uses setAttribute('style', ...)
      // This is safe — CSS cannot execute JS. script-src remains strict.
      assert.ok(styleSrcMatch[1].includes('unsafe-inline'),
        'styleSrc must contain unsafe-inline for dynamic styles');
    });

    it('CSP script-src does not reference CDN domains', () => {
      const serverSrc = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
      const scriptSrcMatch = serverSrc.match(/scriptSrc:\s*\[([^\]]+)\]/);
      assert.ok(scriptSrcMatch, 'scriptSrc directive must exist');
      assert.ok(!scriptSrcMatch[1].includes('cdn.jsdelivr.net'),
        'scriptSrc must not reference cdn.jsdelivr.net');
    });

    it('CSP style-src does not reference Google Fonts', () => {
      const serverSrc = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
      const styleSrcMatch = serverSrc.match(/styleSrc:\s*\[([^\]]+)\]/);
      assert.ok(styleSrcMatch, 'styleSrc directive must exist');
      assert.ok(!styleSrcMatch[1].includes('fonts.googleapis.com'),
        'styleSrc must not reference fonts.googleapis.com');
    });

    it('CSP font-src does not reference Google Fonts CDN', () => {
      const serverSrc = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
      const fontSrcMatch = serverSrc.match(/fontSrc:\s*\[([^\]]+)\]/);
      assert.ok(fontSrcMatch, 'fontSrc directive must exist');
      assert.ok(!fontSrcMatch[1].includes('fonts.gstatic.com'),
        'fontSrc must not reference fonts.gstatic.com');
    });
  });

  // ─── 1.2b csrf.js removed in v7 (dead code — header-auth is CSRF-immune) ───

  describe('1.2b csrf.js removal', () => {
    it('csrf.js has been removed from middleware', () => {
      assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'middleware', 'csrf.js')),
        'csrf.js was dead code and should be removed');
    });
  });

  // ─── 1.3 Restrict CORS Default ───

  describe('1.3 CORS default restricted', () => {
    it('config.js CORS default is empty string, not wildcard', () => {
      const src = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
      // Should have CORS_ORIGINS || '' (empty string)
      assert.ok(
        src.includes("CORS_ORIGINS || ''") || src.includes('CORS_ORIGINS || ""'),
        'CORS_ORIGINS default must be empty string, not wildcard'
      );
      assert.ok(!src.match(/CORS_ORIGINS\s*\|\|\s*'\*'/),
        'CORS_ORIGINS default must not be wildcard *');
    });

    it('.env.example documents CORS_ORIGINS', () => {
      const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
      assert.ok(env.includes('CORS_ORIGINS'), '.env.example must document CORS_ORIGINS');
    });
  });

  // ─── CSP response header integration test ───

  describe('CSP response headers', () => {
    it('GET / returns CSP header with script-src strict (no unsafe-inline)', async () => {
      const res = await rawAgent().get('/').expect(200);
      const csp = res.headers['content-security-policy'];
      assert.ok(csp, 'CSP header must be present');
      // style-src may have unsafe-inline (safe), but script-src must not
      const scriptSrc = csp.match(/script-src\s+([^;]+)/);
      assert.ok(scriptSrc, 'CSP must have script-src directive');
      assert.ok(!scriptSrc[1].includes("'unsafe-inline'"), 'script-src must not contain unsafe-inline');
    });

    it('GET / returns CSP header without CDN domains', async () => {
      const res = await rawAgent().get('/').expect(200);
      const csp = res.headers['content-security-policy'];
      assert.ok(!csp.includes('cdn.jsdelivr.net'), 'CSP must not contain cdn.jsdelivr.net');
      assert.ok(!csp.includes('fonts.googleapis.com'), 'CSP must not contain fonts.googleapis.com');
      assert.ok(!csp.includes('fonts.gstatic.com'), 'CSP must not contain fonts.gstatic.com');
    });

    it('GET /login.html serves the login page', async () => {
      const res = await rawAgent().get('/login.html').expect(200);
      assert.ok(res.text.includes('auth-form'), 'login page must contain auth-form');
    });

    it('GET /js/login.js returns JavaScript', async () => {
      const res = await rawAgent().get('/js/login.js').expect(200);
      assert.ok(res.text.includes('addEventListener'), 'login.js must be served');
    });

    it('GET /css/login.css returns CSS', async () => {
      const res = await rawAgent().get('/css/login.css').expect(200);
      assert.ok(res.text.includes('.auth-card'), 'login.css must be served');
    });
  });
});
