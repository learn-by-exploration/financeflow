-- Migration 030: Add conversion tracking columns to transactions
-- Stores original amount/currency/rate when a cross-currency transaction occurs.

ALTER TABLE transactions ADD COLUMN original_amount REAL;
ALTER TABLE transactions ADD COLUMN original_currency TEXT;
ALTER TABLE transactions ADD COLUMN exchange_rate_used REAL;
