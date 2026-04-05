-- Add currency field to budgets for multi-currency support
ALTER TABLE budgets ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
