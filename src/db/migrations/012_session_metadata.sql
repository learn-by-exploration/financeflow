-- v0.3.22 Session Management & Security Polish
-- Add metadata columns to sessions table
ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN last_used_at TEXT;
ALTER TABLE sessions ADD COLUMN device_name TEXT;
UPDATE sessions SET last_used_at = datetime('now') WHERE last_used_at IS NULL;
