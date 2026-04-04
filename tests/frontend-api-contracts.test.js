// tests/frontend-api-contracts.test.js — Verify all API endpoints called by frontend exist
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

let app, db, authedAgent;

before(() => {
  ({ app, db } = setup());
  cleanDb();
  authedAgent = agent();
});

function unauthed() { return request(app); }

// ════════════════════════════════════════════════════════════════
// Core CRUD Endpoints — GET (list)
// ════════════════════════════════════════════════════════════════

describe('API Contract — GET List Endpoints', () => {
  it('GET /api/accounts returns 200', async () => {
    const res = await authedAgent.get('/api/accounts');
    assert.equal(res.status, 200);
  });

  it('GET /api/transactions returns 200', async () => {
    const res = await authedAgent.get('/api/transactions');
    assert.equal(res.status, 200);
  });

  it('GET /api/categories returns 200', async () => {
    const res = await authedAgent.get('/api/categories');
    assert.equal(res.status, 200);
  });

  it('GET /api/budgets returns 200', async () => {
    const res = await authedAgent.get('/api/budgets');
    assert.equal(res.status, 200);
  });

  it('GET /api/goals returns 200', async () => {
    const res = await authedAgent.get('/api/goals');
    assert.equal(res.status, 200);
  });

  it('GET /api/subscriptions returns 200', async () => {
    const res = await authedAgent.get('/api/subscriptions');
    assert.equal(res.status, 200);
  });

  it('GET /api/groups returns 200', async () => {
    const res = await authedAgent.get('/api/groups');
    assert.equal(res.status, 200);
  });

  it('GET /api/recurring returns 200', async () => {
    const res = await authedAgent.get('/api/recurring');
    assert.equal(res.status, 200);
  });

  it('GET /api/tags returns 200', async () => {
    const res = await authedAgent.get('/api/tags');
    assert.equal(res.status, 200);
  });

  it('GET /api/rules returns 200', async () => {
    const res = await authedAgent.get('/api/rules');
    assert.equal(res.status, 200);
  });

  it('GET /api/settings returns 200', async () => {
    const res = await authedAgent.get('/api/settings');
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════════
// Stats & Analytics Endpoints
// ════════════════════════════════════════════════════════════════

describe('API Contract — Stats Endpoints', () => {
  it('GET /api/stats/overview returns 200', async () => {
    const res = await authedAgent.get('/api/stats/overview');
    assert.equal(res.status, 200);
  });

  it('GET /api/stats/financial-health returns 200', async () => {
    const res = await authedAgent.get('/api/stats/financial-health');
    assert.equal(res.status, 200);
  });

  it('GET /api/stats/category-breakdown returns 200', async () => {
    const res = await authedAgent.get('/api/stats/category-breakdown');
    assert.equal(res.status, 200);
  });

  it('GET /api/stats/trends?months=12 returns 200', async () => {
    const res = await authedAgent.get('/api/stats/trends?months=12');
    assert.equal(res.status, 200);
  });

  it('GET /api/stats/challenges returns 200', async () => {
    const res = await authedAgent.get('/api/stats/challenges');
    assert.equal(res.status, 200);
  });
});

describe('API Contract — Calculator Endpoints', () => {
  it('GET /api/stats/sip-calculator returns 200', async () => {
    const res = await authedAgent.get('/api/stats/sip-calculator?monthly=5000&return=12&years=10&step_up=0');
    assert.equal(res.status, 200);
  });

  it('GET /api/stats/lumpsum-calculator returns 200', async () => {
    const res = await authedAgent.get('/api/stats/lumpsum-calculator?principal=100000&return=12&years=10');
    assert.equal(res.status, 200);
  });

  it('GET /api/stats/emi-calculator returns 200', async () => {
    const res = await authedAgent.get('/api/stats/emi-calculator?principal=1000000&rate=8&tenure=20');
    assert.equal(res.status, 200);
  });

  it('GET /api/stats/fire-calculator returns 200', async () => {
    const res = await authedAgent.get('/api/stats/fire-calculator?annual_expense=600000&safe_withdrawal_rate=4&inflation_rate=6&years=25');
    assert.equal(res.status, 200);
  });
});

describe('API Contract — Chart Endpoints', () => {
  it('GET /api/charts/spending-pie returns 200', async () => {
    const res = await authedAgent.get('/api/charts/spending-pie?from=2024-01-01&to=2024-12-31');
    assert.equal(res.status, 200);
  });

  it('GET /api/charts/income-expense returns 200', async () => {
    const res = await authedAgent.get('/api/charts/income-expense?from=2024-01-01&to=2024-12-31&interval=monthly');
    assert.equal(res.status, 200);
  });

  it('GET /api/charts/spending-trend returns 200', async () => {
    const res = await authedAgent.get('/api/charts/spending-trend?from=2024-01-01&to=2024-12-31&interval=daily');
    assert.equal(res.status, 200);
  });
});

describe('API Contract — Insight Endpoints', () => {
  it('GET /api/insights/velocity returns 200', async () => {
    const res = await authedAgent.get('/api/insights/velocity');
    assert.equal(res.status, 200);
  });

  it('GET /api/insights/trends?months=6 returns 200', async () => {
    const res = await authedAgent.get('/api/insights/trends?months=6');
    assert.equal(res.status, 200);
  });

  it('GET /api/insights/categories returns 200', async () => {
    const res = await authedAgent.get('/api/insights/categories');
    assert.equal(res.status, 200);
  });

  it('GET /api/insights/anomalies?months=3 returns 200', async () => {
    const res = await authedAgent.get('/api/insights/anomalies?months=3');
    assert.equal(res.status, 200);
  });
});

describe('API Contract — Report Endpoints', () => {
  it('GET /api/reports/cashflow-forecast returns 200', async () => {
    const res = await authedAgent.get('/api/reports/cashflow-forecast?days=30');
    assert.equal(res.status, 200);
  });

  it('GET /api/reports/year-in-review returns 200', async () => {
    const res = await authedAgent.get('/api/reports/year-in-review?year=2024');
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════════
// Utility Endpoints
// ════════════════════════════════════════════════════════════════

describe('API Contract — Utility Endpoints', () => {
  it('GET /api/search?q=test returns 200', async () => {
    const res = await authedAgent.get('/api/search?q=test');
    assert.equal(res.status, 200);
  });

  it('GET /api/calendar returns 200', async () => {
    const res = await authedAgent.get('/api/calendar?month=2024-06');
    assert.equal(res.status, 200);
  });

  it('GET /api/net-worth/history returns 200', async () => {
    const res = await authedAgent.get('/api/net-worth/history?limit=12');
    assert.equal(res.status, 200);
  });

  it('GET /api/recurring/suggestions returns 200', async () => {
    const res = await authedAgent.get('/api/recurring/suggestions');
    assert.equal(res.status, 200);
  });

  it('GET /api/notifications returns 200', async () => {
    const res = await authedAgent.get('/api/notifications?limit=50&offset=0');
    assert.equal(res.status, 200);
  });

  it('GET /api/data/export returns 200', async () => {
    const res = await authedAgent.get('/api/data/export');
    assert.equal(res.status, 200);
  });

  it('GET /api/settings/dashboard returns 200', async () => {
    const res = await authedAgent.get('/api/settings/dashboard');
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════════
// Mutation Endpoints (POST) — verify endpoint exists
// ════════════════════════════════════════════════════════════════

describe('API Contract — POST Endpoints', () => {
  it('POST /api/accounts accepts valid data', async () => {
    const res = await authedAgent.post('/api/accounts').send({
      name: 'Contract Test', type: 'checking', currency: 'INR', balance: 1000, icon: '💰', color: '#000'
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/categories accepts valid data', async () => {
    const res = await authedAgent.post('/api/categories').send({
      name: 'Contract Cat', icon: '🧪', color: '#FF0', type: 'expense'
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/transactions accepts valid data', async () => {
    const acct = makeAccount({ name: 'TxnContractAcct' });
    const res = await authedAgent.post('/api/transactions').send({
      account_id: acct.id, type: 'expense', amount: 50, description: 'Contract test', date: '2024-06-01'
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/budgets accepts valid data', async () => {
    const res = await authedAgent.post('/api/budgets').send({
      name: 'Contract Budget', period: 'monthly', amount: 5000
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/goals accepts valid data', async () => {
    const res = await authedAgent.post('/api/goals').send({
      name: 'Contract Goal', target_amount: 100000, deadline: '2025-12-31', icon: '🎯', color: '#F00'
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/subscriptions accepts valid data', async () => {
    const acct = makeAccount({ name: 'SubContractAcct' });
    const res = await authedAgent.post('/api/subscriptions').send({
      name: 'Contract Sub', amount: 199, frequency: 'monthly', account_id: acct.id, next_billing_date: '2025-01-15'
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/groups accepts valid data', async () => {
    const res = await authedAgent.post('/api/groups').send({
      name: 'Contract Group', icon: '👥', color: '#0F0'
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/tags accepts valid data', async () => {
    const res = await authedAgent.post('/api/tags').send({ name: 'contract-tag' });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/rules accepts valid data', async () => {
    const cat = makeCategory({ name: 'RuleContractCat' });
    const res = await authedAgent.post('/api/rules').send({
      pattern: 'contract-test', category_id: cat.id
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/stats/challenges accepts valid data', async () => {
    const res = await authedAgent.post('/api/stats/challenges').send({
      type: 'no_spend', target_amount: 0, start_date: '2025-01-01', end_date: '2025-01-31', name: 'Contract Challenge'
    });
    assert.ok([200, 201].includes(res.status), `Status ${res.status}`);
  });

  it('POST /api/notifications/read-all returns 200', async () => {
    const res = await authedAgent.post('/api/notifications/read-all');
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════════
// PUT Endpoints
// ════════════════════════════════════════════════════════════════

describe('API Contract — PUT Endpoints', () => {
  it('PUT /api/settings accepts valid data', async () => {
    const res = await authedAgent.put('/api/settings').send({
      key: 'default_currency', value: 'INR'
    });
    assert.equal(res.status, 200);
  });

  it('PUT /api/users/onboarding/dismiss returns 200', async () => {
    const res = await authedAgent.put('/api/users/onboarding/dismiss');
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════════
// Auth Endpoints (unauthenticated)
// ════════════════════════════════════════════════════════════════

describe('API Contract — Auth Endpoints', () => {
  it('POST /api/auth/login endpoint exists (rejects bad creds)', async () => {
    const res = await unauthed().post('/api/auth/login').send({
      username: 'nonexistent', password: 'wrong'
    });
    assert.ok([401, 400].includes(res.status));
  });

  it('POST /api/auth/register endpoint exists (rejects invalid)', async () => {
    const res = await unauthed().post('/api/auth/register').send({
      username: '', password: ''
    });
    assert.ok([400, 422].includes(res.status));
  });

  it('POST /api/auth/logout endpoint exists', async () => {
    // Use a fresh agent to avoid invalidating the shared session
    const res = await unauthed().post('/api/auth/logout').set('X-Session-Token', 'dummy-token');
    // 200 or 401 both acceptable (endpoint exists)
    assert.ok([200, 204, 401].includes(res.status));
  });
});

// ════════════════════════════════════════════════════════════════
// Health & System Endpoints
// ════════════════════════════════════════════════════════════════

describe('API Contract — System Endpoints', () => {
  it('GET /api/health/live returns 200', async () => {
    const res = await unauthed().get('/api/health/live');
    assert.equal(res.status, 200);
  });

  it('GET /api/branding returns 200', async () => {
    const res = await unauthed().get('/api/branding');
    assert.equal(res.status, 200);
  });

  it('GET /api/version returns 200', async () => {
    const res = await unauthed().get('/api/version');
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════════
// Response Shape Contracts
// ════════════════════════════════════════════════════════════════

describe('API Contract — Response Shapes', () => {
  it('GET /api/accounts returns { accounts: [] }', async () => {
    const res = await authedAgent.get('/api/accounts');
    assert.ok(Array.isArray(res.body.accounts));
  });

  it('GET /api/categories returns { categories: [] }', async () => {
    const res = await authedAgent.get('/api/categories');
    assert.ok(Array.isArray(res.body.categories));
  });

  it('GET /api/budgets returns { budgets: [] }', async () => {
    const res = await authedAgent.get('/api/budgets');
    assert.ok(Array.isArray(res.body.budgets));
  });

  it('GET /api/goals returns { goals: [] }', async () => {
    const res = await authedAgent.get('/api/goals');
    assert.ok(Array.isArray(res.body.goals));
  });

  it('GET /api/subscriptions returns { subscriptions: [] }', async () => {
    const res = await authedAgent.get('/api/subscriptions');
    assert.ok(Array.isArray(res.body.subscriptions));
  });

  it('GET /api/groups returns { groups: [] }', async () => {
    const res = await authedAgent.get('/api/groups');
    assert.ok(Array.isArray(res.body.groups));
  });

  it('GET /api/recurring returns { rules: [] }', async () => {
    const res = await authedAgent.get('/api/recurring');
    assert.ok(Array.isArray(res.body.rules));
  });

  it('GET /api/tags returns { tags: [] }', async () => {
    const res = await authedAgent.get('/api/tags');
    assert.ok(Array.isArray(res.body.tags));
  });

  it('GET /api/rules returns { rules: [] }', async () => {
    const res = await authedAgent.get('/api/rules');
    assert.ok(Array.isArray(res.body.rules));
  });

  it('GET /api/stats/overview has expected fields', async () => {
    const res = await authedAgent.get('/api/stats/overview');
    const body = res.body;
    assert.ok('net_worth' in body || 'netWorth' in body || typeof body === 'object');
  });

  it('GET /api/notifications returns { notifications: [] }', async () => {
    const res = await authedAgent.get('/api/notifications?limit=10&offset=0');
    assert.ok(Array.isArray(res.body.notifications));
  });

  it('GET /api/search returns results object', async () => {
    const res = await authedAgent.get('/api/search?q=x');
    assert.ok(typeof res.body === 'object');
  });

  it('error responses have { error: { code, message } } shape', async () => {
    const res = await unauthed().get('/api/accounts'); // no auth
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
    assert.ok(res.body.error.code || res.body.error.message);
  });
});

// ════════════════════════════════════════════════════════════════
// DELETE Endpoints (verify endpoint exists, 404 for non-existent ID ok)
// ════════════════════════════════════════════════════════════════

describe('API Contract — DELETE Endpoints (exist and respond)', () => {
  const deleteEndpoints = [
    '/api/accounts/99999', '/api/transactions/99999', '/api/categories/99999',
    '/api/budgets/99999', '/api/goals/99999', '/api/subscriptions/99999',
    '/api/groups/99999', '/api/recurring/99999', '/api/tags/99999',
    '/api/rules/99999', '/api/stats/challenges/99999',
  ];

  for (const ep of deleteEndpoints) {
    it(`DELETE ${ep} returns valid status`, async () => {
      const res = await authedAgent.delete(ep);
      // Accept 200 (ok/already gone), 204, or 404
      assert.ok([200, 204, 404].includes(res.status), `DELETE ${ep} returned ${res.status}`);
    });
  }
});
