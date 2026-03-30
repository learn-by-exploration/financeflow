-- Add UPI/payment reference ID field to transactions
ALTER TABLE transactions ADD COLUMN reference_id TEXT;
