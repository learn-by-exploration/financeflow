const { z } = require('zod');

const VALID_TYPES = ['checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'wallet', 'other'];

const VALID_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SGD', 'AED', 'SAR', 'BRL', 'KRW', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'ZAR', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'MXN', 'RUB', 'HKD', 'TWD', 'ILS', 'CLP', 'ARS', 'COP', 'PEN', 'EGP', 'NGN', 'KES', 'BDT', 'PKR', 'LKR', 'NPR', 'MMK'];

const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_INVESTMENT_TYPES = ['mutual_fund', 'fixed_deposit', 'stocks', 'gold', 'real_estate', 'bonds', 'ppf', 'nps', 'crypto', 'lending', 'other'];

// Optional loan/investment/credit enrichment fields
const enrichmentFields = {
  interest_rate: z.number().min(0).max(100).optional().nullable(),
  credit_limit: z.number().min(0).max(1e15).optional().nullable(),
  loan_amount: z.number().min(0).max(1e15).optional().nullable(),
  tenure_months: z.number().int().min(1).max(600).optional().nullable(),
  emi_amount: z.number().min(0).max(1e15).optional().nullable(),
  emi_day: z.number().int().min(1).max(31).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  maturity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  closure_amount: z.number().min(0).max(1e15).optional().nullable(),
  repayment_account_id: z.number().int().positive().optional().nullable(),
  priority: z.enum(VALID_PRIORITIES).optional().nullable(),
  account_notes: z.string().max(2000).optional().nullable(),
  expected_return: z.number().min(-100).max(1000).optional().nullable(),
  investment_type: z.enum(VALID_INVESTMENT_TYPES).optional().nullable(),
};

const createAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  type: z.enum(VALID_TYPES).optional().default('checking'),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters').optional(),
  balance: z.number().min(-1e15).max(1e15).optional().default(0),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  institution: z.string().max(100).optional().nullable(),
  account_number_last4: z.string().max(4).regex(/^\d{0,4}$/, 'Must be up to 4 digits').optional().nullable(),
  ...enrichmentFields,
});

const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(VALID_TYPES).optional(),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters').optional(),
  balance: z.number().min(-1e15).max(1e15).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  institution: z.string().max(100).optional().nullable(),
  account_number_last4: z.string().max(4).regex(/^\d{0,4}$/, 'Must be up to 4 digits').optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
  include_in_net_worth: z.number().int().min(0).max(1).optional(),
  ...enrichmentFields,
});

module.exports = { createAccountSchema, updateAccountSchema, VALID_TYPES, VALID_CURRENCIES, VALID_PRIORITIES, VALID_INVESTMENT_TYPES };
