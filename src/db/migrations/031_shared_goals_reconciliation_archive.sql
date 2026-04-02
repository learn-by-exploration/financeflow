-- Phase 4: Shared goals, reconciliation, account archiving
ALTER TABLE savings_goals ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN reconciled_at TEXT;
