const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeAccount, makeTransaction, agent } = require('./helpers');
const { detectRecurringPatterns, computePatternHash } = require('../src/services/recurring-detector');

before(() => setup());
after(() => teardown());

// ─── Unit tests for recurring-detector service ───

describe('recurring-detector service', () => {
  it('should detect monthly pattern (same desc+amount across 3+ months)', () => {
    const transactions = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date('2025-01-15');
      d.setUTCMonth(d.getUTCMonth() + i);
      transactions.push({
        description: 'Netflix',
        amount: 199,
        account_id: 1,
        date: d.toISOString().slice(0, 10),
        type: 'expense',
      });
    }
    const suggestions = detectRecurringPatterns(transactions);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].frequency, 'monthly');
    assert.equal(suggestions[0].description, 'Netflix');
    assert.equal(suggestions[0].amount, 199);
    assert.equal(suggestions[0].occurrence_count, 4);
  });

  it('should detect weekly pattern', () => {
    const transactions = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date('2025-01-06');
      d.setUTCDate(d.getUTCDate() + i * 7);
      transactions.push({
        description: 'Weekly groceries',
        amount: 500,
        account_id: 1,
        date: d.toISOString().slice(0, 10),
        type: 'expense',
      });
    }
    const suggestions = detectRecurringPatterns(transactions);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].frequency, 'weekly');
  });

  it('should not suggest patterns with random transactions', () => {
    const transactions = [
      { description: 'Coffee', amount: 80, account_id: 1, date: '2025-01-05', type: 'expense' },
      { description: 'Lunch', amount: 250, account_id: 1, date: '2025-01-10', type: 'expense' },
      { description: 'Uber', amount: 180, account_id: 1, date: '2025-02-03', type: 'expense' },
      { description: 'Books', amount: 999, account_id: 1, date: '2025-03-21', type: 'expense' },
    ];
    const suggestions = detectRecurringPatterns(transactions);
    assert.equal(suggestions.length, 0);
  });

  it('should require minimum 3 occurrences', () => {
    const transactions = [
      { description: 'Rent', amount: 15000, account_id: 1, date: '2025-01-01', type: 'expense' },
      { description: 'Rent', amount: 15000, account_id: 1, date: '2025-02-01', type: 'expense' },
    ];
    const suggestions = detectRecurringPatterns(transactions);
    assert.equal(suggestions.length, 0);
  });

  it('should filter dismissed patterns', () => {
    const transactions = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date('2025-01-15');
      d.setUTCMonth(d.getUTCMonth() + i);
      transactions.push({
        description: 'Netflix',
        amount: 199,
        account_id: 1,
        date: d.toISOString().slice(0, 10),
        type: 'expense',
      });
    }
    const hash = computePatternHash('netflix', '199', '1');
    const suggestions = detectRecurringPatterns(transactions, [hash]);
    assert.equal(suggestions.length, 0);
  });

  it('should compute pattern hash consistently', () => {
    const hash1 = computePatternHash('Netflix', '199', '1');
    const hash2 = computePatternHash('netflix', '199', '1');
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64); // SHA-256 hex
  });
});

// ─── API integration tests ───

describe('GET /api/recurring/suggestions', () => {
  beforeEach(() => cleanDb());

  it('should return detected monthly recurring patterns', async () => {
    const acct = makeAccount();
    // Create 4 monthly transactions
    for (let i = 0; i < 4; i++) {
      const d = new Date('2025-01-15');
      d.setUTCMonth(d.getUTCMonth() + i);
      makeTransaction(acct.id, {
        description: 'Spotify',
        amount: 119,
        date: d.toISOString().slice(0, 10),
        type: 'expense',
      });
    }

    const res = await agent().get('/api/recurring/suggestions');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.suggestions));
    assert.equal(res.body.suggestions.length, 1);
    assert.equal(res.body.suggestions[0].frequency, 'monthly');
    assert.equal(res.body.suggestions[0].description, 'Spotify');
    assert.equal(res.body.suggestions[0].amount, 119);
    assert.ok(res.body.suggestions[0].confidence > 0);
    assert.ok(res.body.suggestions[0].pattern_hash);
  });

  it('should return empty suggestions for non-recurring transactions', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { description: 'Random purchase', amount: 500 });
    makeTransaction(acct.id, { description: 'Other thing', amount: 200 });

    const res = await agent().get('/api/recurring/suggestions');
    assert.equal(res.status, 200);
    assert.equal(res.body.suggestions.length, 0);
  });
});

describe('POST /api/recurring/suggestions/accept', () => {
  beforeEach(() => cleanDb());

  it('should create a recurring rule from accepted suggestion', async () => {
    const acct = makeAccount();
    // Create transactions to generate a pattern
    for (let i = 0; i < 3; i++) {
      const d = new Date('2025-01-15');
      d.setUTCMonth(d.getUTCMonth() + i);
      makeTransaction(acct.id, {
        description: 'Gym membership',
        amount: 2000,
        date: d.toISOString().slice(0, 10),
        type: 'expense',
      });
    }

    // Get suggestions first
    const sugRes = await agent().get('/api/recurring/suggestions');
    assert.equal(sugRes.body.suggestions.length, 1);
    const suggestion = sugRes.body.suggestions[0];

    // Accept the suggestion
    const res = await agent().post('/api/recurring/suggestions/accept').send({
      pattern_hash: suggestion.pattern_hash,
      description: suggestion.description,
      amount: suggestion.amount,
      account_id: suggestion.account_id,
      frequency: suggestion.frequency,
      type: suggestion.type,
      next_date: '2025-05-15',
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.rule);
    assert.equal(res.body.rule.description, 'Gym membership');
    assert.equal(res.body.rule.amount, 2000);
    assert.equal(res.body.rule.frequency, 'monthly');

    // Verify it shows up in recurring rules
    const rulesRes = await agent().get('/api/recurring');
    assert.ok(rulesRes.body.rules.some(r => r.description === 'Gym membership'));
  });

  it('should return 400 for missing required fields', async () => {
    const res = await agent().post('/api/recurring/suggestions/accept').send({});
    assert.equal(res.status, 400);
  });
});

describe('POST /api/recurring/suggestions/dismiss', () => {
  beforeEach(() => cleanDb());

  it('should dismiss a suggestion', async () => {
    const acct = makeAccount();
    for (let i = 0; i < 3; i++) {
      const d = new Date('2025-01-15');
      d.setUTCMonth(d.getUTCMonth() + i);
      makeTransaction(acct.id, {
        description: 'Magazine sub',
        amount: 299,
        date: d.toISOString().slice(0, 10),
        type: 'expense',
      });
    }

    // Get suggestions
    const sugRes = await agent().get('/api/recurring/suggestions');
    assert.equal(sugRes.body.suggestions.length, 1);
    const pattern_hash = sugRes.body.suggestions[0].pattern_hash;

    // Dismiss it
    const res = await agent().post('/api/recurring/suggestions/dismiss').send({ pattern_hash });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('should return 400 for missing pattern_hash', async () => {
    const res = await agent().post('/api/recurring/suggestions/dismiss').send({});
    assert.equal(res.status, 400);
  });
});

describe('dismissed patterns should not reappear', () => {
  beforeEach(() => cleanDb());

  it('should not return dismissed patterns in suggestions', async () => {
    const acct = makeAccount();
    for (let i = 0; i < 4; i++) {
      const d = new Date('2025-01-15');
      d.setUTCMonth(d.getUTCMonth() + i);
      makeTransaction(acct.id, {
        description: 'Dismissed service',
        amount: 499,
        date: d.toISOString().slice(0, 10),
        type: 'expense',
      });
    }

    // Verify suggestion exists
    let sugRes = await agent().get('/api/recurring/suggestions');
    assert.equal(sugRes.body.suggestions.length, 1);
    const pattern_hash = sugRes.body.suggestions[0].pattern_hash;

    // Dismiss
    await agent().post('/api/recurring/suggestions/dismiss').send({ pattern_hash });

    // Verify it's gone
    sugRes = await agent().get('/api/recurring/suggestions');
    assert.equal(sugRes.body.suggestions.length, 0);
  });
});
