const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('CSRF Middleware', () => {
  const createCsrfMiddleware = require('../src/middleware/csrf');
  const csrf = createCsrfMiddleware();

  function mockReq(method, path, headers = {}) {
    return { method, path, headers };
  }

  function mockRes() {
    const _headers = {};
    return {
      statusCode: 200,
      getHeader(name) { return _headers[name.toLowerCase()]; },
      setHeader(name, value) { _headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      _headers,
    };
  }

  it('allows GET requests without CSRF token', (_, done) => {
    const req = mockReq('GET', '/api/accounts');
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('sets csrf_token cookie on GET requests', (_, done) => {
    const req = mockReq('GET', '/api/accounts');
    const res = mockRes();
    csrf(req, res, () => {
      const cookies = res._headers['set-cookie'];
      assert.ok(cookies, 'should set Set-Cookie header');
      const csrfCookie = Array.isArray(cookies) ? cookies.find(c => c.includes('csrf_token=')) : cookies;
      assert.ok(csrfCookie, 'should contain csrf_token cookie');
      assert.match(csrfCookie, /csrf_token=[a-f0-9]{64}/);
      assert.ok(csrfCookie.includes('SameSite=Strict'));
      done();
    });
  });

  it('blocks POST without CSRF token', () => {
    const req = mockReq('POST', '/api/accounts', {});
    const res = mockRes();
    csrf(req, res, () => { assert.fail('should not call next'); });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'CSRF_FAILED');
  });

  it('blocks POST with mismatched CSRF token', () => {
    const req = mockReq('POST', '/api/accounts', {
      'x-csrf-token': 'wrong-token',
      cookie: 'csrf_token=' + 'a'.repeat(64),
    });
    const res = mockRes();
    csrf(req, res, () => { assert.fail('should not call next'); });
    assert.equal(res.statusCode, 403);
  });

  it('allows POST with matching CSRF token', (_, done) => {
    const token = 'b'.repeat(64);
    const req = mockReq('POST', '/api/accounts', {
      'x-csrf-token': token,
      cookie: `csrf_token=${token}`,
    });
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('exempts /register endpoint', (_, done) => {
    const req = mockReq('POST', '/register', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('exempts /login endpoint', (_, done) => {
    const req = mockReq('POST', '/login', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('exempts /logout endpoint', (_, done) => {
    const req = mockReq('POST', '/logout', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });
});
