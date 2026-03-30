const { describe, it, before, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction, makeBudget, makeGoal, makeSubscription, makeRecurringRule, makeSecondUser, today, daysFromNow } = require('./helpers');

before(() => setup());
afterEach(() => cleanDb());
after(() => teardown());

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          values.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    values.push(current);
    return values;
  });
  return { headers, rows };
}

// ─── Transaction CSV Export ───

describe('GET /api/export/transactions', () => {
  it('returns CSV with headers', async () => {
    const res = await agent()
      .get('/api/export/transactions')
      .expect(200);

    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    const { headers } = parseCsv(res.text);
    assert.ok(headers.includes('date'));
    assert.ok(headers.includes('amount'));
    assert.ok(headers.includes('category_name'));
    assert.ok(headers.includes('account_name'));
    assert.ok(headers.includes('description'));
    assert.ok(headers.includes('type'));
    assert.ok(headers.includes('tags'));
  });

  it('returns headers only when no data', async () => {
    const res = await agent()
      .get('/api/export/transactions')
      .expect(200);

    const { headers, rows } = parseCsv(res.text);
    assert.ok(headers.length > 0);
    assert.equal(rows.length, 0);
  });

  it('includes category and account names', async () => {
    const acct = makeAccount({ name: 'My Checking' });
    const cat = makeCategory({ name: 'Groceries' });
    makeTransaction(acct.id, { category_id: cat.id, description: 'Walmart' });

    const res = await agent()
      .get('/api/export/transactions')
      .expect(200);

    const { headers, rows } = parseCsv(res.text);
    const catIdx = headers.indexOf('category_name');
    const acctIdx = headers.indexOf('account_name');
    assert.equal(rows.length, 1);
    assert.equal(rows[0][catIdx], 'Groceries');
    assert.equal(rows[0][acctIdx], 'My Checking');
  });

  it('filters by date range (from/to)', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { date: '2025-01-01', description: 'Old' });
    makeTransaction(acct.id, { date: '2025-06-15', description: 'Mid' });
    makeTransaction(acct.id, { date: '2025-12-31', description: 'New' });

    const res = await agent()
      .get('/api/export/transactions?from=2025-06-01&to=2025-06-30')
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 1);
  });

  it('filters by account_id', async () => {
    const acct1 = makeAccount({ name: 'Acct1' });
    const acct2 = makeAccount({ name: 'Acct2' });
    makeTransaction(acct1.id, { description: 'A' });
    makeTransaction(acct2.id, { description: 'B' });

    const res = await agent()
      .get(`/api/export/transactions?account_id=${acct1.id}`)
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 1);
  });

  it('filters by category_id', async () => {
    const acct = makeAccount();
    const cat1 = makeCategory({ name: 'Food' });
    const cat2 = makeCategory({ name: 'Transport' });
    makeTransaction(acct.id, { category_id: cat1.id, description: 'A' });
    makeTransaction(acct.id, { category_id: cat2.id, description: 'B' });

    const res = await agent()
      .get(`/api/export/transactions?category_id=${cat1.id}`)
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 1);
  });

  it('filters by type', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { type: 'income', amount: 500 });
    makeTransaction(acct.id, { type: 'expense', amount: 200 });

    const res = await agent()
      .get('/api/export/transactions?type=income')
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 1);
  });

  it('handles CSV escaping for values with commas and quotes', async () => {
    const acct = makeAccount({ name: 'My "Best" Account' });
    const cat = makeCategory({ name: 'Food, Drinks' });
    makeTransaction(acct.id, { category_id: cat.id, description: 'Dinner at "Joes"' });

    const res = await agent()
      .get('/api/export/transactions')
      .expect(200);

    // Values with commas/quotes should be properly escaped
    assert.ok(res.text.includes('"Food, Drinks"'));
    assert.ok(res.text.includes('"My ""Best"" Account"'));
  });
});

// ─── Account CSV Export ───

describe('GET /api/export/accounts', () => {
  it('returns CSV with correct headers', async () => {
    const res = await agent()
      .get('/api/export/accounts')
      .expect(200);

    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    const { headers } = parseCsv(res.text);
    assert.ok(headers.includes('id'));
    assert.ok(headers.includes('name'));
    assert.ok(headers.includes('type'));
    assert.ok(headers.includes('balance'));
  });

  it('returns account data', async () => {
    makeAccount({ name: 'Savings', type: 'savings', balance: 100000 });
    makeAccount({ name: 'Credit Card', type: 'credit_card', balance: -5000 });

    const res = await agent()
      .get('/api/export/accounts')
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 2);
  });

  it('returns headers only when no data', async () => {
    const res = await agent()
      .get('/api/export/accounts')
      .expect(200);

    const { headers, rows } = parseCsv(res.text);
    assert.ok(headers.length > 0);
    assert.equal(rows.length, 0);
  });
});

// ─── Budget CSV Export ───

describe('GET /api/export/budgets', () => {
  it('returns CSV with budget and item data', async () => {
    const cat = makeCategory({ name: 'Groceries' });
    makeBudget({
      name: 'Monthly Budget',
      items: [{ category_id: cat.id, amount: 5000 }]
    });

    const res = await agent()
      .get('/api/export/budgets')
      .expect(200);

    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    const { headers, rows } = parseCsv(res.text);
    assert.ok(headers.includes('budget_name'));
    assert.ok(headers.includes('category_name'));
    assert.ok(headers.includes('item_amount'));
    assert.equal(rows.length, 1);
  });

  it('returns headers only when no budgets', async () => {
    const res = await agent()
      .get('/api/export/budgets')
      .expect(200);

    const { headers, rows } = parseCsv(res.text);
    assert.ok(headers.length > 0);
    assert.equal(rows.length, 0);
  });

  it('includes budgets without items', async () => {
    makeBudget({ name: 'Empty Budget', items: [] });

    const res = await agent()
      .get('/api/export/budgets')
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 1);
  });
});

// ─── Full Data JSON Export ───

describe('GET /api/export/all', () => {
  it('returns JSON with all entity types', async () => {
    const acct = makeAccount({ name: 'Checking' });
    const cat = makeCategory({ name: 'Food' });
    makeTransaction(acct.id, { category_id: cat.id });
    makeBudget({ name: 'Budget' });
    makeGoal({ name: 'Save' });
    makeSubscription({ name: 'Netflix' });
    makeRecurringRule(acct.id, { description: 'Rent' });

    const res = await agent()
      .get('/api/export/all')
      .expect(200);

    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    const data = res.body;
    assert.ok(data.exported_at);
    assert.ok(Array.isArray(data.accounts));
    assert.ok(Array.isArray(data.transactions));
    assert.ok(Array.isArray(data.categories));
    assert.ok(Array.isArray(data.budgets));
    assert.ok(Array.isArray(data.goals));
    assert.ok(Array.isArray(data.subscriptions));
    assert.ok(Array.isArray(data.recurring_rules));
    assert.ok(Array.isArray(data.tags));
    assert.ok(Array.isArray(data.settings));
    assert.equal(data.accounts.length, 1);
    assert.equal(data.transactions.length, 1);
    assert.equal(data.categories.length, 1);
  });

  it('returns empty arrays when no data', async () => {
    const res = await agent()
      .get('/api/export/all')
      .expect(200);

    const data = res.body;
    assert.equal(data.accounts.length, 0);
    assert.equal(data.transactions.length, 0);
    assert.equal(data.categories.length, 0);
    assert.equal(data.budgets.length, 0);
  });

  it('includes budget items nested under budgets', async () => {
    const cat = makeCategory({ name: 'Food' });
    makeBudget({ name: 'B', items: [{ category_id: cat.id, amount: 3000 }] });

    const res = await agent()
      .get('/api/export/all')
      .expect(200);

    assert.equal(res.body.budgets.length, 1);
    assert.equal(res.body.budgets[0].items.length, 1);
  });
});

// ─── Data Isolation ───

describe('Export data isolation', () => {
  it('exports only own transactions', async () => {
    const acct = makeAccount({ name: 'Mine' });
    makeTransaction(acct.id, { description: 'My transaction' });

    const { agent: otherAgent } = makeSecondUser();

    const res = await otherAgent
      .get('/api/export/transactions')
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 0);
  });

  it('exports only own accounts', async () => {
    makeAccount({ name: 'Mine' });

    const { agent: otherAgent } = makeSecondUser();

    const res = await otherAgent
      .get('/api/export/accounts')
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 0);
  });

  it('full export only includes own data', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id);

    const { agent: otherAgent } = makeSecondUser();

    const res = await otherAgent
      .get('/api/export/all')
      .expect(200);

    assert.equal(res.body.accounts.length, 0);
    assert.equal(res.body.transactions.length, 0);
  });
});
