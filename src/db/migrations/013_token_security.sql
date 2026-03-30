-- v0.3.27 Token Security: API token expiry & is_active for rotation
ALTER TABLE api_tokens ADD COLUMN expires_at TEXT;
ALTER TABLE api_tokens ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
