const { describe, it, before, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeAccount, makeCategory, makeTransaction } = require('./helpers');

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

// ═══════════════════════════════════════════════
// CSV Export
// ═══════════════════════════════════════════════

describe('GET /api/export/transactions?format=csv', () => {
  it('returns valid CSV with expected headers', async () => {
    const res = await agent()
      .get('/api/export/transactions?format=csv')
      .expect(200);

    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.headers['content-disposition'].includes('transactions.csv'));
    const { headers } = parseCsv(res.text);
    assert.ok(headers.includes('date'));
    assert.ok(headers.includes('description'));
    assert.ok(headers.includes('category_name'));
    assert.ok(headers.includes('account_name'));
    assert.ok(headers.includes('type'));
    assert.ok(headers.includes('amount'));
    assert.ok(headers.includes('tags'));
  });

  it('returns headers only (no rows) when no data', async () => {
    const res = await agent()
      .get('/api/export/transactions?format=csv')
      .expect(200);

    const { headers, rows } = parseCsv(res.text);
    assert.ok(headers.length > 0);
    assert.equal(rows.length, 0);
  });

  it('properly escapes commas and quotes in CSV', async () => {
    const acct = makeAccount({ name: 'Savings, "Main"' });
    const cat = makeCategory({ name: 'Food, Drink' });
    makeTransaction(acct.id, { category_id: cat.id, description: 'Dinner at "Joe\'s"' });

    const res = await agent()
      .get('/api/export/transactions?format=csv')
      .expect(200);

    assert.ok(res.text.includes('"Food, Drink"'));
    assert.ok(res.text.includes('"Savings, ""Main"""'));
  });
});

// ═══════════════════════════════════════════════
// JSON Export
// ═══════════════════════════════════════════════

describe('GET /api/export/transactions?format=json', () => {
  it('returns JSON array', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { description: 'Test expense' });

    const res = await agent()
      .get('/api/export/transactions?format=json')
      .expect(200);

    assert.ok(res.headers['content-disposition'].includes('transactions.json'));
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].description, 'Test expense');
  });

  it('returns empty array when no data', async () => {
    const res = await agent()
      .get('/api/export/transactions?format=json')
      .expect(200);

    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });
});

// ═══════════════════════════════════════════════
// Date filter on export
// ═══════════════════════════════════════════════

describe('Export date filtering', () => {
  it('filters with start_date and end_date params', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { date: '2024-01-15', description: 'Jan' });
    makeTransaction(acct.id, { date: '2024-06-15', description: 'Jun' });
    makeTransaction(acct.id, { date: '2024-12-15', description: 'Dec' });

    const res = await agent()
      .get('/api/export/transactions?format=json&start_date=2024-06-01&end_date=2024-06-30')
      .expect(200);

    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].description, 'Jun');
  });

  it('CSV date filter with start_date/end_date works', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { date: '2024-03-01', description: 'March' });
    makeTransaction(acct.id, { date: '2024-09-01', description: 'September' });

    const res = await agent()
      .get('/api/export/transactions?format=csv&start_date=2024-09-01&end_date=2024-09-30')
      .expect(200);

    const { rows } = parseCsv(res.text);
    assert.equal(rows.length, 1);
  });

  it('defaults to CSV when format is not specified', async () => {
    const res = await agent()
      .get('/api/export/transactions')
      .expect(200);

    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
  });
});

// ═══════════════════════════════════════════════
// Year-in-Review
// ═══════════════════════════════════════════════

describe('GET /api/reports/year-in-review', () => {
  it('returns all required fields', async () => {
    const acct = makeAccount();
    const cat = makeCategory({ name: 'Groceries' });
    makeTransaction(acct.id, { type: 'income', amount: 5000, date: '2024-03-15', description: 'Salary' });
    makeTransaction(acct.id, { type: 'expense', amount: 1200, date: '2024-03-20', description: 'Rent', category_id: cat.id });
    makeTransaction(acct.id, { type: 'expense', amount: 300, date: '2024-06-10', description: 'Groceries', category_id: cat.id });

    const res = await agent()
      .get('/api/reports/year-in-review?year=2024')
      .expect(200);

    const data = res.body;
    assert.equal(data.year, '2024');
    assert.equal(typeof data.total_income, 'number');
    assert.equal(typeof data.total_expenses, 'number');
    assert.equal(typeof data.net_savings, 'number');
    assert.equal(typeof data.savings_rate, 'number');
    assert.equal(typeof data.transaction_count, 'number');
    assert.ok(Array.isArray(data.top_categories));
    assert.ok(Array.isArray(data.monthly_breakdown));
    assert.equal(data.monthly_breakdown.length, 12);
    assert.ok(data.biggest_expense !== undefined);
    assert.ok(data.most_frequent_merchant !== undefined);
    assert.equal(typeof data.average_daily_spending, 'number');
  });

  it('returns zeros when no data for year', async () => {
    const res = await agent()
      .get('/api/reports/year-in-review?year=2020')
      .expect(200);

    const data = res.body;
    assert.equal(data.total_income, 0);
    assert.equal(data.total_expenses, 0);
    assert.equal(data.net_savings, 0);
    assert.equal(data.savings_rate, 0);
    assert.equal(data.transaction_count, 0);
    assert.equal(data.top_categories.length, 0);
    assert.equal(data.biggest_expense, null);
    assert.equal(data.most_frequent_merchant, null);
    assert.equal(data.average_daily_spending, 0);
  });

  it('calculates savings rate correctly', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { type: 'income', amount: 10000, date: '2024-05-01', description: 'Salary' });
    makeTransaction(acct.id, { type: 'expense', amount: 4000, date: '2024-05-10', description: 'Rent' });

    const res = await agent()
      .get('/api/reports/year-in-review?year=2024')
      .expect(200);

    // savings_rate = (10000 - 4000) / 10000 * 100 = 60%
    assert.equal(res.body.savings_rate, 60);
    assert.equal(res.body.net_savings, 6000);
  });

  it('top categories are sorted by amount descending', async () => {
    const acct = makeAccount();
    const catA = makeCategory({ name: 'Small' });
    const catB = makeCategory({ name: 'Big' });
    const catC = makeCategory({ name: 'Medium' });
    makeTransaction(acct.id, { type: 'expense', amount: 100, date: '2024-01-01', category_id: catA.id, description: 'a' });
    makeTransaction(acct.id, { type: 'expense', amount: 500, date: '2024-02-01', category_id: catB.id, description: 'b' });
    makeTransaction(acct.id, { type: 'expense', amount: 250, date: '2024-03-01', category_id: catC.id, description: 'c' });

    const res = await agent()
      .get('/api/reports/year-in-review?year=2024')
      .expect(200);

    const cats = res.body.top_categories;
    assert.equal(cats[0].name, 'Big');
    assert.equal(cats[1].name, 'Medium');
    assert.equal(cats[2].name, 'Small');
  });

  it('identifies biggest single expense', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { type: 'expense', amount: 200, date: '2024-04-01', description: 'Small purchase' });
    makeTransaction(acct.id, { type: 'expense', amount: 5000, date: '2024-04-15', description: 'Big purchase' });
    makeTransaction(acct.id, { type: 'expense', amount: 300, date: '2024-04-20', description: 'Medium purchase' });

    const res = await agent()
      .get('/api/reports/year-in-review?year=2024')
      .expect(200);

    assert.equal(res.body.biggest_expense.description, 'Big purchase');
    assert.equal(res.body.biggest_expense.amount, 5000);
  });

  it('identifies most frequent merchant', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { type: 'expense', amount: 50, date: '2024-01-01', description: 'Coffee Shop' });
    makeTransaction(acct.id, { type: 'expense', amount: 50, date: '2024-02-01', description: 'Coffee Shop' });
    makeTransaction(acct.id, { type: 'expense', amount: 50, date: '2024-03-01', description: 'Coffee Shop' });
    makeTransaction(acct.id, { type: 'expense', amount: 200, date: '2024-04-01', description: 'Restaurant' });

    const res = await agent()
      .get('/api/reports/year-in-review?year=2024')
      .expect(200);

    assert.equal(res.body.most_frequent_merchant.description, 'Coffee Shop');
    assert.equal(res.body.most_frequent_merchant.count, 3);
  });

  it('monthly breakdown has 12 entries with correct structure', async () => {
    const acct = makeAccount();
    makeTransaction(acct.id, { type: 'income', amount: 1000, date: '2024-07-01', description: 'Jul income' });

    const res = await agent()
      .get('/api/reports/year-in-review?year=2024')
      .expect(200);

    const mb = res.body.monthly_breakdown;
    assert.equal(mb.length, 12);
    assert.equal(mb[0].month, '2024-01');
    assert.equal(mb[11].month, '2024-12');
    // July (index 6) should have income
    assert.equal(mb[6].income, 1000);
    assert.equal(mb[6].expenses, 0);
    assert.equal(mb[6].net, 1000);
    // Other months should be zero
    assert.equal(mb[0].income, 0);
    assert.equal(mb[0].expenses, 0);
  });

  it('rejects missing year parameter', async () => {
    await agent()
      .get('/api/reports/year-in-review')
      .expect(400);
  });

  it('rejects invalid year format', async () => {
    await agent()
      .get('/api/reports/year-in-review?year=abcd')
      .expect(400);
  });
});

// ═══════════════════════════════════════════════
// Auth required
// ═══════════════════════════════════════════════

describe('Auth required for export & review endpoints', () => {
  it('export transactions requires auth', async () => {
    const request = require('supertest');
    const { app } = setup();
    await request(app)
      .get('/api/export/transactions?format=csv')
      .expect(401);
  });

  it('year-in-review requires auth', async () => {
    const request = require('supertest');
    const { app } = setup();
    await request(app)
      .get('/api/reports/year-in-review?year=2024')
      .expect(401);
  });
});
