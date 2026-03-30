#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');

/**
 * Seed demo data for PersonalFi.
 * Can be run standalone: node src/db/seed.js
 * Or imported and called programmatically: seedDemoData(db)
 */

function seedDemoData(db) {
  const now = new Date();

  // ─── Helper: date string N days ago ───
  function daysAgo(n) {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  // ─── Helper: random date within last N days ───
  function randomDate(maxDaysAgo) {
    const days = Math.floor(Math.random() * maxDaysAgo);
    return daysAgo(days);
  }

  // ─── Helper: random amount between min and max ───
  function randomAmount(min, max) {
    return Math.round((min + Math.random() * (max - min)) * 100) / 100;
  }

  // ─── Clean existing demo user data ───
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
  if (existingUser) {
    db.prepare('DELETE FROM users WHERE id = ?').run(existingUser.id);
  }

  // ─── Create demo user ───
  const passwordHash = bcrypt.hashSync('demo123', 4);
  const userResult = db.prepare(
    'INSERT INTO users (username, email, password_hash, display_name, default_currency) VALUES (?, ?, ?, ?, ?)'
  ).run('demo', 'demo@example.com', passwordHash, 'Demo User', 'INR');
  const userId = userResult.lastInsertRowid;

  // ─── Accounts ───
  const accountDefs = [
    { name: 'HDFC Checking', type: 'checking', balance: 85000, icon: '🏦', color: '#2563EB', institution: 'HDFC Bank' },
    { name: 'SBI Savings', type: 'savings', balance: 250000, icon: '🏦', color: '#10b981', institution: 'SBI' },
    { name: 'ICICI Credit Card', type: 'credit_card', balance: -15000, icon: '💳', color: '#ef4444', institution: 'ICICI Bank' },
    { name: 'Cash', type: 'cash', balance: 5000, icon: '💵', color: '#f59e0b' },
    { name: 'Zerodha Investment', type: 'investment', balance: 500000, icon: '📈', color: '#8b5cf6', institution: 'Zerodha' },
  ];

  const insertAccount = db.prepare(
    'INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, institution, is_active, include_in_net_worth, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)'
  );
  const accounts = [];
  for (let i = 0; i < accountDefs.length; i++) {
    const a = accountDefs[i];
    const r = insertAccount.run(userId, a.name, a.type, 'INR', a.balance, a.icon, a.color, a.institution || null, i);
    accounts.push({ id: r.lastInsertRowid, ...a });
  }

  // ─── Categories ───
  const categoryDefs = [
    { name: 'Food & Dining', icon: '🍛', color: '#ef4444', type: 'expense' },
    { name: 'Transport', icon: '🚗', color: '#f97316', type: 'expense' },
    { name: 'Rent', icon: '🏠', color: '#8b5cf6', type: 'expense' },
    { name: 'Shopping', icon: '🛍️', color: '#ec4899', type: 'expense' },
    { name: 'Entertainment', icon: '🎬', color: '#f59e0b', type: 'expense' },
    { name: 'Salary', icon: '💰', color: '#10b981', type: 'income' },
    { name: 'Freelance', icon: '💻', color: '#06b6d4', type: 'income' },
    { name: 'Groceries', icon: '🛒', color: '#84cc16', type: 'expense' },
    { name: 'Utilities', icon: '💡', color: '#6366f1', type: 'expense' },
    { name: 'Healthcare', icon: '🏥', color: '#14b8a6', type: 'expense' },
    { name: 'Education', icon: '📚', color: '#a855f7', type: 'expense' },
    { name: 'Travel', icon: '✈️', color: '#0ea5e9', type: 'expense' },
    { name: 'Gifts', icon: '🎁', color: '#e11d48', type: 'expense' },
    { name: 'Insurance', icon: '🛡️', color: '#475569', type: 'expense' },
    { name: 'Subscriptions', icon: '📺', color: '#7c3aed', type: 'expense' },
  ];

  const insertCategory = db.prepare(
    'INSERT INTO categories (user_id, name, icon, color, type, is_system, position) VALUES (?, ?, ?, ?, ?, 0, ?)'
  );
  const categories = [];
  for (let i = 0; i < categoryDefs.length; i++) {
    const c = categoryDefs[i];
    const r = insertCategory.run(userId, c.name, c.icon, c.color, c.type, i);
    categories.push({ id: r.lastInsertRowid, ...c });
  }

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const incomeCategories = categories.filter(c => c.type === 'income');

  // ─── Transactions (100+ spanning 6 months = ~180 days) ───
  const insertTransaction = db.prepare(
    'INSERT INTO transactions (user_id, account_id, category_id, type, amount, currency, description, date, payee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const expenseDescriptions = [
    { desc: 'Swiggy order', cat: 'Food & Dining', min: 150, max: 800, payee: 'Swiggy' },
    { desc: 'Zomato delivery', cat: 'Food & Dining', min: 200, max: 900, payee: 'Zomato' },
    { desc: 'Restaurant dinner', cat: 'Food & Dining', min: 500, max: 2500, payee: null },
    { desc: 'Chai & snacks', cat: 'Food & Dining', min: 50, max: 200, payee: null },
    { desc: 'Uber ride', cat: 'Transport', min: 100, max: 500, payee: 'Uber' },
    { desc: 'Ola ride', cat: 'Transport', min: 80, max: 400, payee: 'Ola' },
    { desc: 'Metro recharge', cat: 'Transport', min: 200, max: 500, payee: 'DMRC' },
    { desc: 'Petrol', cat: 'Transport', min: 500, max: 3000, payee: 'Indian Oil' },
    { desc: 'Monthly rent', cat: 'Rent', min: 15000, max: 15000, payee: 'Landlord' },
    { desc: 'Amazon purchase', cat: 'Shopping', min: 300, max: 5000, payee: 'Amazon' },
    { desc: 'Flipkart order', cat: 'Shopping', min: 200, max: 3000, payee: 'Flipkart' },
    { desc: 'Myntra clothing', cat: 'Shopping', min: 500, max: 4000, payee: 'Myntra' },
    { desc: 'Movie tickets', cat: 'Entertainment', min: 300, max: 800, payee: 'BookMyShow' },
    { desc: 'Netflix subscription', cat: 'Subscriptions', min: 199, max: 649, payee: 'Netflix' },
    { desc: 'Spotify subscription', cat: 'Subscriptions', min: 119, max: 119, payee: 'Spotify' },
    { desc: 'BigBasket groceries', cat: 'Groceries', min: 500, max: 3000, payee: 'BigBasket' },
    { desc: 'DMart shopping', cat: 'Groceries', min: 1000, max: 5000, payee: 'DMart' },
    { desc: 'Vegetable market', cat: 'Groceries', min: 200, max: 800, payee: null },
    { desc: 'Electricity bill', cat: 'Utilities', min: 800, max: 2500, payee: 'BSES' },
    { desc: 'Water bill', cat: 'Utilities', min: 200, max: 500, payee: 'DJB' },
    { desc: 'Mobile recharge', cat: 'Utilities', min: 299, max: 799, payee: 'Jio' },
    { desc: 'WiFi bill', cat: 'Utilities', min: 500, max: 1000, payee: 'Airtel' },
    { desc: 'Doctor visit', cat: 'Healthcare', min: 500, max: 2000, payee: null },
    { desc: 'Pharmacy', cat: 'Healthcare', min: 100, max: 1000, payee: 'Apollo Pharmacy' },
    { desc: 'Online course', cat: 'Education', min: 500, max: 5000, payee: 'Udemy' },
    { desc: 'Books', cat: 'Education', min: 200, max: 1500, payee: 'Amazon' },
    { desc: 'Train tickets', cat: 'Travel', min: 300, max: 3000, payee: 'IRCTC' },
    { desc: 'Hotel booking', cat: 'Travel', min: 1500, max: 8000, payee: 'MakeMyTrip' },
    { desc: 'Birthday gift', cat: 'Gifts', min: 500, max: 3000, payee: null },
    { desc: 'Health insurance premium', cat: 'Insurance', min: 1500, max: 3000, payee: 'Star Health' },
  ];

  const incomeDescriptions = [
    { desc: 'Monthly salary', cat: 'Salary', min: 75000, max: 75000, payee: 'TechCorp India' },
    { desc: 'Freelance project', cat: 'Freelance', min: 10000, max: 30000, payee: null },
    { desc: 'Freelance consulting', cat: 'Freelance', min: 5000, max: 15000, payee: null },
  ];

  // Generate ~110 transactions
  const txCount = 110;
  const checkingId = accounts[0].id;
  const savingsId = accounts[1].id;
  const creditCardId = accounts[2].id;
  const cashId = accounts[3].id;

  const spendingAccounts = [checkingId, creditCardId, cashId];

  for (let i = 0; i < txCount; i++) {
    const date = randomDate(180);

    if (i < 6) {
      // Monthly salary entries (one per month for 6 months)
      const salaryDate = daysAgo(i * 30 + 1);
      const salaryCategory = categories.find(c => c.name === 'Salary');
      insertTransaction.run(
        userId, savingsId, salaryCategory.id, 'income', 75000, 'INR',
        'Monthly salary', salaryDate, 'TechCorp India'
      );
      continue;
    }

    if (i >= 6 && i < 10) {
      // Freelance income
      const inc = incomeDescriptions[1 + (i % 2)];
      const incCategory = categories.find(c => c.name === inc.cat);
      insertTransaction.run(
        userId, checkingId, incCategory.id, 'income',
        randomAmount(inc.min, inc.max), 'INR', inc.desc, randomDate(180), inc.payee
      );
      continue;
    }

    // Expenses
    const template = expenseDescriptions[Math.floor(Math.random() * expenseDescriptions.length)];
    const cat = categories.find(c => c.name === template.cat);
    const accountId = spendingAccounts[Math.floor(Math.random() * spendingAccounts.length)];
    insertTransaction.run(
      userId, accountId, cat.id, 'expense',
      randomAmount(template.min, template.max), 'INR',
      template.desc, date, template.payee
    );
  }

  // ─── Budgets ───
  const insertBudget = db.prepare(
    'INSERT INTO budgets (user_id, name, period, is_active) VALUES (?, ?, ?, 1)'
  );
  const insertBudgetItem = db.prepare(
    'INSERT INTO budget_items (budget_id, category_id, amount) VALUES (?, ?, ?)'
  );

  const foodCat = categories.find(c => c.name === 'Food & Dining');
  const transportCat = categories.find(c => c.name === 'Transport');
  const shoppingCat = categories.find(c => c.name === 'Shopping');
  const groceriesCat = categories.find(c => c.name === 'Groceries');
  const entertainmentCat = categories.find(c => c.name === 'Entertainment');
  const utilitiesCat = categories.find(c => c.name === 'Utilities');

  // Budget 1: Monthly Essentials
  const b1 = insertBudget.run(userId, 'Monthly Essentials', 'monthly');
  insertBudgetItem.run(b1.lastInsertRowid, foodCat.id, 8000);
  insertBudgetItem.run(b1.lastInsertRowid, groceriesCat.id, 6000);
  insertBudgetItem.run(b1.lastInsertRowid, transportCat.id, 3000);
  insertBudgetItem.run(b1.lastInsertRowid, utilitiesCat.id, 4000);

  // Budget 2: Lifestyle
  const b2 = insertBudget.run(userId, 'Lifestyle', 'monthly');
  insertBudgetItem.run(b2.lastInsertRowid, shoppingCat.id, 5000);
  insertBudgetItem.run(b2.lastInsertRowid, entertainmentCat.id, 3000);

  // Budget 3: Quarterly Travel
  const b3 = insertBudget.run(userId, 'Quarterly Travel', 'quarterly');
  const travelCat = categories.find(c => c.name === 'Travel');
  insertBudgetItem.run(b3.lastInsertRowid, travelCat.id, 25000);

  // ─── Savings Goals ───
  const insertGoal = db.prepare(
    'INSERT INTO savings_goals (user_id, name, target_amount, current_amount, currency, icon, color, deadline, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertGoal.run(userId, 'Emergency Fund', 300000, 125000, 'INR', '🛡️', '#ef4444', daysAgo(-365), 0);
  insertGoal.run(userId, 'Vacation', 100000, 35000, 'INR', '🏖️', '#0ea5e9', daysAgo(-180), 1);

  // ─── Recurring Transactions ───
  const rentCat = categories.find(c => c.name === 'Rent');
  const subsCat = categories.find(c => c.name === 'Subscriptions');
  const salaryCat = categories.find(c => c.name === 'Salary');

  const insertRecurring = db.prepare(
    'INSERT INTO recurring_rules (user_id, account_id, category_id, type, amount, currency, description, payee, frequency, next_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
  );
  insertRecurring.run(userId, checkingId, rentCat.id, 'expense', 15000, 'INR', 'Monthly rent', 'Landlord', 'monthly', daysAgo(-15));
  insertRecurring.run(userId, creditCardId, subsCat.id, 'expense', 649, 'INR', 'Netflix subscription', 'Netflix', 'monthly', daysAgo(-20));
  insertRecurring.run(userId, savingsId, salaryCat.id, 'income', 75000, 'INR', 'Monthly salary', 'TechCorp India', 'monthly', daysAgo(-1));

  // ─── Additional Savings Goal ───
  insertGoal.run(userId, 'New Laptop', 80000, 22000, 'INR', '💻', '#7c3aed', daysAgo(-120), 2);

  // ─── Groups ───
  const insertGroup = db.prepare(
    'INSERT INTO groups (name, icon, color, created_by) VALUES (?, ?, ?, ?)'
  );
  const insertGroupMember = db.prepare(
    'INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)'
  );

  const g1 = insertGroup.run('Flatmates', '🏠', '#f59e0b', userId);
  insertGroupMember.run(g1.lastInsertRowid, userId, 'Demo User', 'owner');
  insertGroupMember.run(g1.lastInsertRowid, null, 'Rahul', 'member');
  insertGroupMember.run(g1.lastInsertRowid, null, 'Priya', 'member');

  const g2 = insertGroup.run('Weekend Trip', '✈️', '#0ea5e9', userId);
  insertGroupMember.run(g2.lastInsertRowid, userId, 'Demo User', 'owner');
  insertGroupMember.run(g2.lastInsertRowid, null, 'Amit', 'member');

  // ─── Notifications ───
  const insertNotification = db.prepare(
    'INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, ?, ?, ?, ?)'
  );
  insertNotification.run(userId, 'budget_overspend', 'Budget Alert', 'You have exceeded your Food & Dining budget this month.', 0);
  insertNotification.run(userId, 'goal_completed', 'Goal Milestone', 'You are 50% towards your Vacation goal!', 0);
  insertNotification.run(userId, 'system', 'Welcome to FinanceFlow', 'Start by adding your accounts and setting up budgets.', 1);

  // ─── Transaction Templates ───
  const insertTemplate = db.prepare(
    'INSERT INTO transaction_templates (user_id, name, description, amount, type, category_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertTemplate.run(userId, 'Coffee', 'Morning coffee', 150, 'expense', foodCat.id, cashId);
  insertTemplate.run(userId, 'Lunch', 'Lunch at office', 250, 'expense', foodCat.id, checkingId);
  insertTemplate.run(userId, 'Grocery Run', 'Weekly groceries', 2000, 'expense', groceriesCat.id, checkingId);
  insertTemplate.run(userId, 'Salary', 'Monthly salary credit', 75000, 'income', salaryCat.id, savingsId);

  return { userId, accounts, categories };
}

// ─── Standalone execution ───
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const config = require('../config');
  const initDatabase = require('./index');
  const { db } = initDatabase(config.dbDir);

  try {
    db.transaction(() => {
      seedDemoData(db);
    })();
    console.log('Demo data seeded successfully.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

module.exports = seedDemoData;
