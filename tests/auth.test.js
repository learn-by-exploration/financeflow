const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('Auth', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('POST /api/auth/register', () => {
    it('creates user and returns token + user object (201)', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ username: 'newuser', password: 'password123' })
        .expect(201);
      assert.ok(res.body.token);
      assert.ok(res.body.user);
      assert.equal(res.body.user.username, 'newuser');
      assert.ok(res.body.user.id);
    });

    it('rejects duplicate username (409)', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'dupuser', password: 'password123' })
        .expect(201);
      await rawAgent().post('/api/auth/register')
        .send({ username: 'dupuser', password: 'password456' })
        .expect(409);
    });

    it('rejects missing username (400)', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('rejects missing password (400)', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'nopassuser' })
        .expect(400);
    });

    it('rejects password shorter than 8 characters (400)', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'shortpw', password: 'short' })
        .expect(400);
    });

    it('seeds 21 default categories for new user', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ username: 'catuser', password: 'password123' })
        .expect(201);

      const { db } = setup();
      const cats = db.prepare('SELECT COUNT(*) as cnt FROM categories WHERE user_id = ?').get(res.body.user.id);
      assert.equal(cats.cnt, 21);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns token for valid credentials (200)', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'loginuser', password: 'password123' });

      const res = await rawAgent().post('/api/auth/login')
        .send({ username: 'loginuser', password: 'password123' })
        .expect(200);
      assert.ok(res.body.token);
      assert.equal(res.body.user.username, 'loginuser');
    });

    it('rejects wrong password (401)', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ username: 'wrongpw', password: 'password123' });

      await rawAgent().post('/api/auth/login')
        .send({ username: 'wrongpw', password: 'wrongpassword' })
        .expect(401);
    });

    it('rejects non-existent user (401)', async () => {
      await rawAgent().post('/api/auth/login')
        .send({ username: 'nosuchuser', password: 'password123' })
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('invalidates session', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'logoutuser', password: 'password123' })
        .expect(201);

      await rawAgent().post('/api/auth/logout')
        .set('X-Session-Token', reg.body.token)
        .expect(200);

      // Token should no longer work
      await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', reg.body.token)
        .expect(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user for valid session', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'meuser', password: 'password123' });

      const res = await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', reg.body.token)
        .expect(200);
      assert.equal(res.body.user.username, 'meuser');
    });

    it('returns 401 for invalid session', async () => {
      await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', 'invalid-token-12345')
        .expect(401);
    });

    it('returns 401 for expired session', async () => {
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'expireduser', password: 'password123' });

      // Manually expire the session
      const { db } = setup();
      db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day') WHERE token = ?").run(reg.body.token);

      await rawAgent().get('/api/auth/me')
        .set('X-Session-Token', reg.body.token)
        .expect(401);
    });
  });

  describe('Protected routes require auth', () => {
    it('returns 401 without auth for /api/accounts', async () => {
      await rawAgent().get('/api/accounts').expect(401);
    });

    it('returns 401 without auth for /api/transactions', async () => {
      await rawAgent().get('/api/transactions').expect(401);
    });

    it('returns 401 without auth for /api/categories', async () => {
      await rawAgent().get('/api/categories').expect(401);
    });

    it('returns 401 without auth for /api/budgets', async () => {
      await rawAgent().get('/api/budgets').expect(401);
    });

    it('returns 401 without auth for /api/stats/overview', async () => {
      await rawAgent().get('/api/stats/overview').expect(401);
    });
  });

  describe('System rule seeding', () => {
    it('seeds system auto-categorization rules on registration', async () => {
      const { db } = setup();
      const reg = await rawAgent().post('/api/auth/register')
        .send({ username: 'ruleuser', password: 'password123' })
        .expect(201);

      const rules = db.prepare('SELECT * FROM category_rules WHERE user_id = ? AND is_system = 1').all(reg.body.user.id);
      assert.ok(rules.length >= 5, `Expected at least 5 system rules, got ${rules.length}`);
      const patterns = rules.map(r => r.pattern);
      assert.ok(patterns.some(p => p.includes('swiggy')));
      assert.ok(patterns.some(p => p.includes('uber')));
      assert.ok(patterns.some(p => p.includes('amazon')));
    });
  });
});
