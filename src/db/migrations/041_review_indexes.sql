-- 041_review_indexes.sql
-- Add missing indexes identified during expert review

-- D1: Index on transactions(recurring_rule_id) for FK lookups
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_rule ON transactions(recurring_rule_id);

-- D2: Index on transactions(transfer_transaction_id) for self-referential FK lookups
CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(transfer_transaction_id);

-- D3: Index on group_invites(group_id) for group-scoped invite queries
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id);
