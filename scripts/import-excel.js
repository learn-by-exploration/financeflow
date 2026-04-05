#!/usr/bin/env node
// scripts/import-excel.js — Import data from Excel for vishalmimani08@gmail.com
// Usage: node scripts/import-excel.js

const BASE = 'http://localhost:3457/api';

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['X-Session-Token'] = token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) {
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(data.error || data));
    return null;
  }
  return data;
}

async function main() {
  console.log('=== FinanceFlow Data Import ===\n');

  // 1. Login to existing user account
  console.log('1. Logging in...');
  let token;
  const login = await api('POST', '/auth/login', {
    username: 'vishalmimani08',
    password: 'Vishal@123',
  });
  if (!login) { console.error('  ✗ Cannot authenticate. Aborting.'); process.exit(1); }
  token = login.token;
  console.log(`  ✓ Logged in as ${login.user.username} (id: ${login.user.id})`);

  // 2. Fetch existing categories and create only missing ones
  console.log('\n2. Setting up categories...');
  const existingCats = await api('GET', '/categories', null, token);
  const categories = {};
  if (existingCats && existingCats.categories) {
    for (const c of existingCats.categories) {
      categories[c.name] = c.id;
    }
    console.log(`  ✓ Found ${existingCats.categories.length} existing categories`);
  }

  // Map our needed names to existing or new categories
  const categoryMapping = {
    'Loan Payment': 'EMI & Loans',         // existing system cat
    'Insurance': 'Insurance',               // existing system cat
    'Education': 'Education',               // existing system cat
    'Rent': 'Housing',                      // existing system cat
    'Groceries': 'Groceries',               // existing system cat
    'Dining Out': 'Food & Dining',          // existing system cat
    'Transportation': 'Transport',           // existing system cat
    'Utilities': 'Utilities',               // existing system cat
    'Mobile & Internet': 'Utilities',        // reuse Utilities
    'Entertainment': 'Entertainment',        // existing system cat
    'Household Staff': null,                 // will create
    'Medical': 'Healthcare',                 // existing system cat
    'Home Maintenance': null,                // will create
    'Subscriptions': 'Subscriptions',        // existing system cat
    'Food & Kitchen': 'Groceries',           // reuse Groceries
    'Salary': 'Salary',                      // existing system cat
    'Interest Income': 'Investments',        // existing system cat
    'Freelance': 'Freelance',                // existing system cat
  };

  // Create missing categories
  const customCats = [
    { name: 'Household Staff', type: 'expense', icon: '🧹', nature: 'need' },
    { name: 'Home Maintenance', type: 'expense', icon: '🔧', nature: 'need' },
  ];
  for (const cat of customCats) {
    if (!categories[cat.name]) {
      const r = await api('POST', '/categories', cat, token);
      if (r) {
        categories[cat.name] = r.id;
        console.log(`  ✓ Created: ${cat.icon} ${cat.name} (id: ${r.id})`);
      }
    }
  }

  // Build a resolver: given our internal name, returns the actual category ID
  function catId(name) {
    const mapped = categoryMapping[name] || name;
    return categories[mapped] || null;
  }

  // 3. Create bank accounts
  console.log('\n3. Creating accounts...');
  const accountDefs = [
    // Regular accounts
    { name: 'Axis Bank Savings', type: 'savings', currency: 'INR', balance: 0, icon: '🏦', institution: 'Axis Bank' },
    { name: 'ICICI Bank', type: 'savings', currency: 'INR', balance: 0, icon: '🏦', institution: 'ICICI Bank' },
    { name: 'HDFC Bank', type: 'savings', currency: 'INR', balance: 0, icon: '🏦', institution: 'HDFC Bank' },
    { name: 'PNB Account', type: 'savings', currency: 'INR', balance: 0, icon: '🏦', institution: 'Punjab National Bank' },
    { name: 'JP Debit Card (Japan)', type: 'checking', currency: 'JPY', balance: 0, icon: '💳', institution: 'Japan Post Bank' },
    { name: 'Cash (INR)', type: 'cash', currency: 'INR', balance: 0, icon: '💵' },
    { name: 'UPI Wallet', type: 'wallet', currency: 'INR', balance: 0, icon: '📲' },

    // Loan accounts
    {
      name: 'ICICI Personal Loan', type: 'loan', currency: 'INR', balance: -84000,
      icon: '🏦', institution: 'ICICI Bank',
      loan_amount: 89000, interest_rate: 15.01, tenure_months: 72,
      emi_amount: 1894, emi_day: 5,
      start_date: '2024-02-02', maturity_date: '2030-01-01',
      closure_amount: 85230, priority: 'high',
      account_notes: 'LPNOD00049499711 | Repayment via NACH Axis | Close this first',
    },
    {
      name: 'HDFC Personal Loan', type: 'loan', currency: 'INR', balance: -378216,
      icon: '🏦', institution: 'HDFC Bank',
      loan_amount: 1600000, interest_rate: 10.8, tenure_months: 60,
      emi_amount: 34629, emi_day: 6,
      start_date: '2024-12-06', maturity_date: '2029-11-10',
      closure_amount: 1489047, priority: 'medium',
      account_notes: 'Home debt, renovation | Repayment via NACH Axis | Consider transfer to lower rate',
    },
    {
      name: 'PNB Education Loan', type: 'loan', currency: 'INR', balance: -722533,
      icon: '📚', institution: 'PNB Rattinamangalam',
      loan_amount: 885000, interest_rate: 8.75, tenure_months: 252,
      emi_amount: 9500,
      start_date: '2018-08-08', maturity_date: '2039-04-20',
      closure_amount: 1501000, priority: 'low',
      account_notes: '980500JB00000552 | Education loan IIITDM Kancheepuram | Low interest - pay off last | If paid in 5 yrs EMI = 14911',
    },
  ];

  const accounts = {};
  for (const acct of accountDefs) {
    const r = await api('POST', '/accounts', acct, token);
    if (r) {
      accounts[acct.name] = r.id;
      console.log(`  ✓ ${acct.icon} ${acct.name} (id: ${r.id})`);
    }
  }

  // 4. Create subscriptions / recurring expenses
  console.log('\n4. Creating subscriptions...');
  const subDefs = [
    { name: 'Mobile Bill', amount: 3000, frequency: 'monthly', category_id: catId('Mobile & Internet'), notes: 'Personal mobile recharge' },
    { name: 'Netflix + Spotify + Google One', amount: 1000, frequency: 'monthly', category_id: catId('Subscriptions'), notes: 'Entertainment subscriptions bundle' },
    { name: 'Self Health Insurance', amount: 2069, frequency: 'monthly', category_id: catId('Insurance'), notes: 'Personal health insurance premium' },
    { name: 'Family Health Insurance', amount: 1431, frequency: 'monthly', category_id: catId('Insurance'), notes: 'Family health insurance premium' },
    { name: 'Scooty EMI', amount: 4600, frequency: 'monthly', category_id: catId('Loan Payment'), notes: 'Family scooty EMI' },
    { name: 'Solar EMI', amount: 2100, frequency: 'monthly', category_id: catId('Utilities'), notes: 'Home solar panel EMI' },
  ];

  for (const sub of subDefs) {
    const r = await api('POST', '/subscriptions', sub, token);
    if (r) console.log(`  ✓ ${sub.name}: ₹${sub.amount}/mo`);
  }

  // 5. Create recurring expenses
  console.log('\n5. Creating recurring expenses...');
  const axisId = accounts['Axis Bank Savings'] || Object.values(accounts)[0];
  const recurringDefs = [
    // Home fixed expenditures
    { description: 'Ram & Santoshi School Fee', amount: 5000, type: 'expense', frequency: 'monthly', category_id: catId('Education'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Shyam School Fee', amount: 1000, type: 'expense', frequency: 'monthly', category_id: catId('Education'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Home Electricity', amount: 3000, type: 'expense', frequency: 'monthly', category_id: catId('Utilities'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Maid Salary', amount: 1200, type: 'expense', frequency: 'monthly', category_id: catId('Household Staff'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Home Grocery', amount: 10000, type: 'expense', frequency: 'monthly', category_id: catId('Groceries'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Milk', amount: 3000, type: 'expense', frequency: 'monthly', category_id: catId('Food & Kitchen'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'LPG Cylinder', amount: 1600, type: 'expense', frequency: 'monthly', category_id: catId('Food & Kitchen'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Oil and Ghee', amount: 2400, type: 'expense', frequency: 'monthly', category_id: catId('Food & Kitchen'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Wheat Flour', amount: 1000, type: 'expense', frequency: 'monthly', category_id: catId('Food & Kitchen'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Vegetables', amount: 3000, type: 'expense', frequency: 'monthly', category_id: catId('Groceries'), account_id: axisId, next_date: '2026-05-01' },
    // Personal fixed
    { description: 'Office Food', amount: 3000, type: 'expense', frequency: 'monthly', category_id: catId('Dining Out'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Office Commute', amount: 1500, type: 'expense', frequency: 'monthly', category_id: catId('Transportation'), account_id: axisId, next_date: '2026-05-01' },
    { description: 'Rent Sakura House', amount: 36000, type: 'expense', frequency: 'monthly', category_id: catId('Rent'), account_id: axisId, next_date: '2026-05-01', payee: 'Sakura House' },
    // Loan EMIs
    { description: 'ICICI Personal Loan EMI', amount: 1894, type: 'expense', frequency: 'monthly', category_id: catId('Loan Payment'), account_id: axisId, next_date: '2026-05-05' },
    { description: 'HDFC Personal Loan EMI', amount: 34629, type: 'expense', frequency: 'monthly', category_id: catId('Loan Payment'), account_id: axisId, next_date: '2026-05-06' },
    { description: 'PNB Education Loan EMI', amount: 9500, type: 'expense', frequency: 'monthly', category_id: catId('Loan Payment'), account_id: axisId, next_date: '2026-05-01' },
    // Salary income
    { description: 'Monthly Salary', amount: 126000, type: 'income', frequency: 'monthly', account_id: axisId, next_date: '2026-05-01' },
  ];

  for (const rec of recurringDefs) {
    const r = await api('POST', '/recurring', rec, token);
    if (r) console.log(`  ✓ ${rec.description}: ₹${rec.amount}/mo (${rec.type})`);
  }

  // 6. Create financial goals
  console.log('\n6. Creating financial goals...');
  const goalDefs = [
    { name: 'Term Life Insurance (Self)', target_amount: 30000, current_amount: 0, icon: '🛡️', color: '#ef4444', deadline: '2026-06-30' },
    { name: 'Term Life Insurance (Mother)', target_amount: 30000, current_amount: 0, icon: '🛡️', color: '#f97316' },
    { name: 'Term Life Insurance (Father)', target_amount: 30000, current_amount: 0, icon: '🛡️', color: '#f59e0b' },
    { name: 'Ram First Year College Fee', target_amount: 100000, current_amount: 0, icon: '📚', color: '#3b82f6', deadline: '2026-12-31' },
    { name: 'Ram Laptop for Study', target_amount: 100000, current_amount: 0, icon: '💻', color: '#8b5cf6', deadline: '2026-12-31' },
    { name: 'Santoshi NID Prep (11th)', target_amount: 50000, current_amount: 0, icon: '🎨', color: '#ec4899', deadline: '2026-12-31' },
    { name: 'Santoshi NID Prep (12th)', target_amount: 100000, current_amount: 0, icon: '🎨', color: '#d946ef', deadline: '2027-04-01' },
    { name: 'Mom & Nani Kedarnath Trip', target_amount: 25000, current_amount: 0, icon: '⛰️', color: '#10b981', deadline: '2026-06-30' },
    { name: 'Emergency Fund (6 months)', target_amount: 474000, current_amount: 100000, icon: '🆘', color: '#ef4444' },
    { name: 'Close ICICI Loan Early', target_amount: 85230, current_amount: 0, icon: '🏦', color: '#f59e0b', deadline: '2027-06-30' },
    { name: 'Start Mutual Fund SIP', target_amount: 100000, current_amount: 1500, icon: '📈', color: '#10b981' },
  ];

  for (const goal of goalDefs) {
    const r = await api('POST', '/goals', goal, token);
    if (r) console.log(`  ✓ ${goal.icon} ${goal.name}: ₹${goal.target_amount}`);
  }

  // 7. Create lending entries (borrowing FROM others — money owed TO them)
  console.log('\n7. Creating lending/borrowing records...');

  // Friends borrowed FROM (you owe them)
  const friendBorrowings = [
    { person_name: 'Ayush', type: 'borrowed', amount: 20000, outstanding: 20000, priority: 'high', purpose: 'Clearing PNB house loan', mode: 'Mom submitted money to bank' },
    { person_name: 'Saikat', type: 'borrowed', amount: 2500, outstanding: 2500 },
    { person_name: 'Vishnu', type: 'borrowed', amount: 1500, outstanding: 1500 },
    { person_name: 'Jagdeeshan', type: 'borrowed', amount: 13000, outstanding: 13000 },
    { person_name: 'Vijay Meena', type: 'borrowed', amount: 10000, outstanding: 10000 },
    { person_name: 'Ravi Kattakwal', type: 'borrowed', amount: 45000, outstanding: 45000 },
    { person_name: 'Yuva Laxmi (RR)', type: 'borrowed', amount: 12000, outstanding: 12000 },
    { person_name: 'Niveditha S (RR)', type: 'borrowed', amount: 13000, outstanding: 13000 },
    { person_name: 'Amit Singh (JP)', type: 'borrowed', amount: 24000, outstanding: 24000 },
    { person_name: 'Raj Sen (RR)', type: 'borrowed', amount: 18000, outstanding: 18000 },
    { person_name: 'Sahil P (MARS)', type: 'borrowed', amount: 20000, outstanding: 20000 },
    { person_name: 'Manas Kumar (IIITDM)', type: 'borrowed', amount: 5000, outstanding: 5000 },
    { person_name: 'Akshat Shah (Addverb)', type: 'borrowed', amount: 2000, outstanding: 2000 },
    { person_name: 'Arunima Gupta (Addverb)', type: 'borrowed', amount: 2000, outstanding: 2000 },
  ];

  // Family/Goodwill borrowings (more significant debts)
  const familyBorrowings = [
    { person_name: 'Jagseer Uncle (Soni)', type: 'borrowed', amount: 200000, outstanding: 60000, interest_rate: 1.5, priority: 'high', purpose: 'Clearing PNB house loan', mode: 'Mom submitted money to bank' },
    { person_name: 'Arun Ki Mata Ji (Siliguri)', type: 'borrowed', amount: 15000, outstanding: 8000, priority: 'medium', purpose: 'Education Challan', mode: 'Account transfer' },
    { person_name: 'Sant Kabir School (Santoshi fees)', type: 'borrowed', amount: 6000, outstanding: 3000, priority: 'high', purpose: 'Pending school fee' },
    { person_name: 'Sanwariya Water Fitting', type: 'borrowed', amount: 5000, outstanding: 5000, priority: 'medium', purpose: 'Water fitting work at home' },
    { person_name: 'Radha Maasi', type: 'borrowed', amount: 12000, outstanding: 4500, priority: 'low' },
    { person_name: 'Dukaan GNG Nani (Pawan)', type: 'borrowed', amount: 170000, outstanding: 90000, interest_rate: 2.0, priority: 'high', purpose: 'Family matter between nani and dad', mode: 'Cash payment' },
    { person_name: 'Patwaari Uncle Goluwala', type: 'borrowed', amount: 50000, outstanding: 50000, priority: 'low', purpose: 'COVID food and necessities', mode: 'Cash payment' },
    { person_name: 'Bana', type: 'borrowed', amount: 70000, outstanding: 10000, purpose: 'Family debt', mode: 'Cash payment' },
    { person_name: 'Fridge EMI (Goluwala shop)', type: 'borrowed', amount: 6000, outstanding: 6000, purpose: 'Buying fridge', mode: 'Cash payment' },
    { person_name: 'Pawan Bijli Fitting', type: 'borrowed', amount: 15000, outstanding: 15000, purpose: 'Electricity fitting in house' },
  ];

  // Money lent out (others owe you)
  const lentOut = [
    { person_name: 'Vijay Masa Ji', type: 'lent', amount: 30000, outstanding: 30000, interest_rate: 5.0, start_date: '2024-07-13', purpose: 'Money pending from their end', mode: 'Account transfer' },
  ];

  const allLending = [...friendBorrowings, ...familyBorrowings, ...lentOut];
  for (const entry of allLending) {
    const r = await api('POST', '/lending', entry, token);
    if (r) console.log(`  ✓ ${entry.type === 'lent' ? '→' : '←'} ${entry.person_name}: ₹${entry.amount} (outstanding: ₹${entry.outstanding || entry.amount})`);
  }

  // 8. Create a monthly budget
  console.log('\n8. Creating monthly budget...');
  const budgetItems = [];
  const budgetMapping = [
    ['Loan Payment', 46023],       // Total EMIs
    ['Insurance', 3500],           // Health insurance
    ['Education', 6000],           // School fees
    ['Rent', 36000],               // Sakura House
    ['Groceries', 13000],          // Home grocery + vegetables
    ['Dining Out', 3000],          // Office food
    ['Transportation', 1500],     // Commute
    ['Utilities', 5100],           // Electricity + solar
    ['Mobile & Internet', 3000],  // Mobile bill
    ['Subscriptions', 1000],      // Netflix etc.
    ['Household Staff', 1200],    // Maid
    ['Food & Kitchen', 8000],     // Milk + LPG + oil + wheat
  ];

  for (const [catName, amount] of budgetMapping) {
    const cid = catId(catName);
    if (cid) {
      budgetItems.push({ category_id: cid, amount });
    }
  }

  const budget = await api('POST', '/budgets', {
    name: 'Monthly Budget',
    period: 'monthly',
    currency: 'INR',
    items: budgetItems,
  }, token);
  if (budget) console.log(`  ✓ Monthly budget created with ${budgetItems.length} categories, total: ₹${budgetItems.reduce((s, i) => s + i.amount, 0)}`);

  // 9. Add a couple of sample transactions from the "Monthly Expense - personal" sheet
  console.log('\n9. Adding sample transactions...');
  const jpAccountId = accounts['JP Debit Card (Japan)'];
  if (jpAccountId) {
    const txns = [
      { account_id: jpAccountId, type: 'expense', amount: 60000, currency: 'JPY', description: 'Rent Sakura House', date: '2025-11-28', category_id: catId('Rent'), payee: 'Sakura House', payment_mode: 'debit_card', note: 'Monthly rent' },
      { account_id: jpAccountId, type: 'expense', amount: 10000, currency: 'JPY', description: 'Monthly grocery - Ok Store', date: '2025-11-29', category_id: catId('Groceries'), payee: 'Ok Store', payment_mode: 'debit_card', note: 'Monthly food expense' },
    ];

    for (const txn of txns) {
      const r = await api('POST', '/transactions', txn, token);
      if (r) console.log(`  ✓ ${txn.date} ${txn.description}: ${txn.currency} ${txn.amount}`);
    }
  }

  // Summary
  console.log('\n══════════════════════════════════════');
  console.log('  IMPORT COMPLETE');
  console.log('══════════════════════════════════════');
  console.log(`  Username: vishalmimani08`);
  console.log(`  Password: Vishal@123`);
  console.log(`  Email:    vishalmimani08@gmail.com`);
  console.log(`  Categories:   ${Object.keys(categories).length}`);
  console.log(`  Accounts:     ${Object.keys(accounts).length}`);
  console.log(`  Subscriptions: ${subDefs.length}`);
  console.log(`  Recurring:    ${recurringDefs.length}`);
  console.log(`  Goals:        ${goalDefs.length}`);
  console.log(`  Lending:      ${allLending.length}`);
  console.log('══════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
