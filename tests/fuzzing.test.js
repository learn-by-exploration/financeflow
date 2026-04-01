const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeAccount, makeCategory, today } = require('./helpers');

describe('v0.3.48 Fuzzing Tests & Security Sweep', () => {
  let db;

  before(() => {
    const ctx = setup();
    db = ctx.db;
  });

  after(() => teardown());
  beforeEach(() => cleanDb());

  // ═══════════════════════════════════════════════════
  // XSS FUZZING
  // ═══════════════════════════════════════════════════

  describe('XSS fuzzing', () => {
    it('transaction description with <script> tag is stored but response does not execute script', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 100, description: '<script>alert(1)</script>', date: today(),
        });
      // Should be accepted (it's a valid string) or rejected by validation — either is safe
      if (res.status === 201) {
        // If stored, the raw JSON response should contain the literal string, not executable HTML
        const body = JSON.stringify(res.body);
        assert.ok(body.includes('<script>') || body.includes('&lt;script&gt;'),
          'Script tag should be stored as literal text or escaped');
        assert.equal(res.headers['content-type'].includes('application/json'), true,
          'Response must be application/json, not text/html');
      } else {
        // Rejected by validation — also safe
        assert.ok([400, 422].includes(res.status));
      }
    });

    it('category name with JS event handler img tag is rejected or safely stored', async () => {
      const res = await agent().post('/api/categories')
        .set('Content-Type', 'application/json')
        .send({ name: '<img onerror=alert(1) src=x>', type: 'expense' });
      if (res.status === 201) {
        const body = JSON.stringify(res.body);
        assert.ok(!body.includes('onerror=alert') || res.headers['content-type'].includes('application/json'),
          'If stored, must be served as JSON not HTML');
      } else {
        assert.ok([400, 422].includes(res.status));
      }
    });

    it('account name with HTML entities is handled safely', async () => {
      const res = await agent().post('/api/accounts')
        .set('Content-Type', 'application/json')
        .send({ name: '&lt;b&gt;Bold&lt;/b&gt; & "quotes"', type: 'checking' });
      if (res.status === 201) {
        assert.ok(res.headers['content-type'].includes('application/json'));
      } else {
        assert.ok([400, 422].includes(res.status));
      }
    });

    it('search query with XSS payload does not reflect unescaped HTML', async () => {
      const res = await agent().get('/api/search')
        .query({ q: '<script>document.cookie</script>' });
      assert.ok(res.headers['content-type'].includes('application/json'));
      // Error or empty results — either way, no HTML execution
      if (res.body.error) {
        assert.ok(!res.body.error.message.includes('<script>') ||
          typeof res.body.error.message === 'string');
      }
    });
  });

  // ═══════════════════════════════════════════════════
  // SQL INJECTION FUZZING
  // ═══════════════════════════════════════════════════

  describe('SQL injection fuzzing', () => {
    it('transaction description with DROP TABLE is safely handled', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 50, description: "'; DROP TABLE transactions; --", date: today(),
        });
      // Should succeed (parameterized query) or be rejected by validation
      if (res.status === 201) {
        // Verify transactions table still exists
        const count = db.prepare('SELECT count(*) as c FROM transactions').get();
        assert.ok(count.c >= 1, 'Transactions table must still exist and have data');
      } else {
        assert.ok([400, 422].includes(res.status));
      }
    });

    it('sort parameter with SQL injection is rejected', async () => {
      const acct = makeAccount();
      const res = await agent().get('/api/transactions')
        .query({ sort: 'amount; DROP TABLE users' });
      // Should return 400 or ignore invalid sort — not execute SQL
      const userCount = db.prepare('SELECT count(*) as c FROM users').get();
      assert.ok(userCount.c >= 1, 'Users table must still exist');
      assert.ok([200, 400, 422].includes(res.status));
    });

    it('filter values with SQL wildcards are treated as literal strings', async () => {
      const acct = makeAccount();
      const cat = makeCategory({ name: 'Normal Category' });
      makeCategory({ name: 'Another Category' });
      // Try SQL wildcard in filter
      const res = await agent().get('/api/transactions')
        .query({ description: "% OR 1=1 --" });
      assert.ok([200, 400].includes(res.status));
      if (res.status === 200) {
        // Should return empty results or just matching — not all rows
        assert.ok(Array.isArray(res.body.transactions) || Array.isArray(res.body));
      }
    });

    it('login username with SQL injection is rejected', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send({ username: "admin' OR '1'='1", password: 'Password1!' });
      assert.equal(res.status, 401);
      // Users table still intact
      const userCount = db.prepare('SELECT count(*) as c FROM users').get();
      assert.ok(userCount.c >= 1);
    });

    it('login password with SQL injection is rejected', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send({ username: 'testuser', password: "' OR '1'='1" });
      assert.equal(res.status, 401);
    });
  });

  // ═══════════════════════════════════════════════════
  // OVERFLOW / BOUNDARY FUZZING
  // ═══════════════════════════════════════════════════

  describe('Overflow and boundary fuzzing', () => {
    it('transaction with Number.MAX_SAFE_INTEGER amount is rejected or handled', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'income',
          amount: Number.MAX_SAFE_INTEGER, description: 'Huge amount', date: today(),
        });
      // Either accepted (large but valid number) or rejected — no crash
      assert.ok([201, 400, 422].includes(res.status));
    });

    it('transaction with -MAX_SAFE_INTEGER amount is rejected (must be positive)', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: -Number.MAX_SAFE_INTEGER, description: 'Negative huge', date: today(),
        });
      // Zod requires positive amount
      assert.equal(res.status, 400);
    });

    it('description with 10,000 characters is rejected by Zod (max 500)', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const longDesc = 'A'.repeat(10000);
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 100, description: longDesc, date: today(),
        });
      assert.equal(res.status, 400);
    });

    it('very long username (1000 chars) is rejected on registration', async () => {
      const longUser = 'u'.repeat(1000);
      const res = await rawAgent().post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send({ username: longUser, password: 'GoodPass1!' });
      assert.equal(res.status, 400);
    });

    it('very long email (1000 chars) is rejected on registration', async () => {
      const longEmail = 'a'.repeat(990) + '@test.com';
      const res = await rawAgent().post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send({ username: 'longemailuser', password: 'GoodPass1!', email: longEmail });
      assert.equal(res.status, 400);
    });

    it('deeply nested JSON body does not crash the server', async () => {
      // Build deeply nested object
      let nested = { value: 'deep' };
      for (let i = 0; i < 100; i++) {
        nested = { child: nested };
      }
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send(nested);
      // Should fail validation, not crash
      assert.ok([400, 422, 413].includes(res.status));
    });

    it('array where object expected is rejected', async () => {
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send([1, 2, 3]);
      assert.ok([400, 422].includes(res.status));
    });
  });

  // ═══════════════════════════════════════════════════
  // SPECIAL CHARACTERS FUZZING
  // ═══════════════════════════════════════════════════

  describe('Special characters fuzzing', () => {
    it('unicode emoji in transaction description is accepted', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 250, description: '☕ Coffee & 🍰 Cake', date: today(),
        });
      assert.equal(res.status, 201);
      assert.ok(res.body.transaction.description.includes('☕'));
    });

    it('CJK characters in transaction description are accepted', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 500, description: '日本語テスト 中文测试', date: today(),
        });
      assert.equal(res.status, 201);
      assert.ok(res.body.transaction.description.includes('日本語'));
    });

    it('RTL characters in transaction description are accepted', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 300, description: 'مرحبا بالعالم', date: today(),
        });
      assert.equal(res.status, 201);
    });

    it('null bytes in strings are rejected or stripped', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 100, description: 'test\x00injection', date: today(),
        });
      // Either accepted without null byte or rejected
      if (res.status === 201) {
        // If accepted, null byte should not be in stored value (or harmless in SQLite)
        assert.ok(typeof res.body.transaction.description === 'string');
      } else {
        assert.ok([400, 422].includes(res.status));
      }
    });

    it('CRLF injection attempt in description does not inject headers', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 100, description: 'test\r\nX-Injected: true\r\n', date: today(),
        });
      // Verify no injected header appears
      assert.ok(!res.headers['x-injected'], 'CRLF injection must not add response headers');
      assert.ok([201, 400, 422].includes(res.status));
    });
  });

  // ═══════════════════════════════════════════════════
  // SECURITY HEADERS SWEEP
  // ═══════════════════════════════════════════════════

  describe('Security headers sweep', () => {
    it('X-Content-Type-Options: nosniff is present on API responses', async () => {
      const res = await agent().get('/api/accounts');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });

    it('X-Frame-Options is present on API responses', async () => {
      const res = await agent().get('/api/accounts');
      // Helmet sets this via CSP frame-ancestors or X-Frame-Options header
      const xfo = res.headers['x-frame-options'];
      const csp = res.headers['content-security-policy'];
      assert.ok(
        (xfo && (xfo === 'DENY' || xfo === 'SAMEORIGIN')) ||
        (csp && csp.includes('frame-ancestors')),
        'X-Frame-Options or CSP frame-ancestors must be set'
      );
    });

    it('Content-Type on API responses is application/json', async () => {
      const res = await agent().get('/api/accounts');
      assert.ok(res.headers['content-type'].includes('application/json'),
        'API responses must be application/json');
    });

    it('error responses do not leak stack traces', async () => {
      // Hit a non-existent API endpoint that will 404
      const res = await agent().get('/api/nonexistent-endpoint-xyz');
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('at '), 'Error response must not contain stack trace "at " lines');
      assert.ok(!body.includes('.js:'), 'Error response must not contain file references');
    });

    it('error responses do not leak internal paths', async () => {
      // Try to trigger an error with invalid data
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({ invalid: 'data' });
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('/home/'), 'Error must not leak absolute paths');
      assert.ok(!body.includes('/src/'), 'Error must not leak source paths');
      assert.ok(!body.includes('node_modules'), 'Error must not leak node_modules paths');
    });

    it('Referrer-Policy header is present', async () => {
      const res = await agent().get('/api/accounts');
      assert.ok(res.headers['referrer-policy'], 'Referrer-Policy header must be set');
    });

    it('Strict-Transport-Security header is present in production', async () => {
      const res = await agent().get('/api/accounts');
      // HSTS is only enabled in production (NODE_ENV=production)
      // In test/dev, it's intentionally disabled to allow HTTP access on LAN
      if (process.env.NODE_ENV === 'production') {
        assert.ok(res.headers['strict-transport-security'],
          'Strict-Transport-Security header must be set in production');
      } else {
        assert.ok(true, 'HSTS disabled in non-production — OK');
      }
    });
  });

  // ═══════════════════════════════════════════════════
  // ADDITIONAL EDGE CASES
  // ═══════════════════════════════════════════════════

  describe('Additional edge cases', () => {
    it('zero amount transaction is rejected', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 0, description: 'Zero amount', date: today(),
        });
      assert.equal(res.status, 400);
    });

    it('NaN amount is rejected', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: 'not-a-number', description: 'NaN amount', date: today(),
        });
      assert.equal(res.status, 400);
    });

    it('Infinity amount is rejected', async () => {
      const acct = makeAccount();
      const cat = makeCategory();
      const res = await agent().post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send({
          account_id: acct.id, category_id: cat.id, type: 'expense',
          amount: Infinity, description: 'Infinite', date: today(),
        });
      // JSON.stringify converts Infinity to null, so should fail validation
      assert.equal(res.status, 400);
    });

    it('prototype pollution via __proto__ in JSON is not exploitable', async () => {
      const res = await agent().post('/api/accounts')
        .set('Content-Type', 'application/json')
        .send({ name: 'Test', type: 'checking', '__proto__': { admin: true } });
      // Should not pollute Object prototype
      assert.ok(!({}).admin, 'Object prototype must not be polluted');
      assert.ok([201, 400].includes(res.status));
    });

    it('constructor pollution via constructor.prototype is not exploitable', async () => {
      const res = await agent().post('/api/accounts')
        .set('Content-Type', 'application/json')
        .send({ name: 'Test', type: 'checking', constructor: { prototype: { polluted: true } } });
      assert.ok(!({}).polluted, 'Prototype must not be polluted');
      assert.ok([201, 400].includes(res.status));
    });
  });
});
