-- Allow users to configure financial year start month
-- Default 1 = January (calendar year), 4 = April (Indian FY)
-- Stored in settings table as key-value pair (financial_year_start)
-- No schema change needed; uses existing settings table
-- This migration is a no-op since the settings table already supports arbitrary key-value pairs
SELECT 1;
