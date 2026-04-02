-- 029_recurring_rules_updated_at.sql
-- Add updated_at column to recurring_rules for tracking modifications

ALTER TABLE recurring_rules ADD COLUMN updated_at TEXT;
UPDATE recurring_rules SET updated_at = datetime('now') WHERE updated_at IS NULL;
