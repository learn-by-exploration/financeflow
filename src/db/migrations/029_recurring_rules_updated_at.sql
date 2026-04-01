-- 029_recurring_rules_updated_at.sql
-- Add updated_at column to recurring_rules for tracking modifications

ALTER TABLE recurring_rules ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
