-- v8.0.0 Account enrichment: loan, investment, and credit fields
-- Loan account fields
ALTER TABLE accounts ADD COLUMN interest_rate REAL DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN credit_limit REAL DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN loan_amount REAL DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN tenure_months INTEGER DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN emi_amount REAL DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN emi_day INTEGER DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN start_date TEXT DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN maturity_date TEXT DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN closure_amount REAL DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN repayment_account_id INTEGER DEFAULT NULL REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN priority TEXT DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN account_notes TEXT DEFAULT NULL;
-- Investment account fields
ALTER TABLE accounts ADD COLUMN expected_return REAL DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN investment_type TEXT DEFAULT NULL;
