-- Migration 037: Schema fixes for scaling, integrity, and performance
-- Addresses: I5 (scheduler index), I8 (updated_at columns), M3 (duplicate check),
--            M5 (exchange rate index for cleanup), M6 (financial_todos position),
--            I4 (audit_log cleanup index)

-- I5: Index for scheduler recurring spawn query (scans is_active + next_date without user filter)
CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_next ON recurring_rules(is_active, next_date);

-- I4: Index for audit_log cleanup by date (scheduler purges >90 days)
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- M5: Index for exchange rate cleanup by date
CREATE INDEX IF NOT EXISTS idx_exchange_rates_created ON exchange_rates(created_at);

-- Notification cleanup index (for purge by user + read status + age)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);

-- M6: Add position column to financial_todos for UI reordering
ALTER TABLE financial_todos ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- I8: Add updated_at to tables missing it (use NULL default for ALTER TABLE compatibility)
ALTER TABLE budget_items ADD COLUMN updated_at TEXT DEFAULT NULL;
ALTER TABLE expense_splits ADD COLUMN updated_at TEXT DEFAULT NULL;
ALTER TABLE tags ADD COLUMN updated_at TEXT DEFAULT NULL;
ALTER TABLE category_rules ADD COLUMN updated_at TEXT DEFAULT NULL;
ALTER TABLE exchange_rates ADD COLUMN updated_at TEXT DEFAULT NULL;
ALTER TABLE api_tokens ADD COLUMN updated_at TEXT DEFAULT NULL;
ALTER TABLE lending_payments ADD COLUMN updated_at TEXT DEFAULT NULL;
