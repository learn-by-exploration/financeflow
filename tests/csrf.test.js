const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('CSRF Middleware — Removed in v7', () => {
  it('csrf.js has been deleted (header-auth is CSRF-immune)', () => {
    assert.ok(
      !fs.existsSync(path.join(__dirname, '..', 'src', 'middleware', 'csrf.js')),
      'csrf.js was dead code and should be removed'
    );
  });

  it('server.js explains why CSRF is not needed', () => {
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
    assert.ok(serverJs.includes('X-Session-Token'),
      'server.js should document header-based auth prevents CSRF');
  });
});
