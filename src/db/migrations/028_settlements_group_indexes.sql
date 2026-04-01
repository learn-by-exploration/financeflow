-- 028_settlements_group_indexes.sql
-- Add missing indexes for settlements and group_members composite

-- Settlements: queries by group_id (currently full table scan)
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);

-- Group members: composite for user+group lookups
CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members(group_id, user_id);

-- Settlements: user-specific settlement queries
CREATE INDEX IF NOT EXISTS idx_settlements_from_member ON settlements(from_member);
CREATE INDEX IF NOT EXISTS idx_settlements_to_member ON settlements(to_member);
