-- 027_performance_indexes_v2.sql
-- Additional composite indexes for v2 query patterns

-- Stats: monthly trends by type
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date ON transactions(user_id, type, date);

-- Budget variance: category spending in date range
CREATE INDEX IF NOT EXISTS idx_transactions_user_cat_type_date ON transactions(user_id, category_id, type, date);

-- Savings challenges: user + active
CREATE INDEX IF NOT EXISTS idx_challenges_user_active ON savings_challenges(user_id, is_active);

-- Net worth snapshots: user + date desc
CREATE INDEX IF NOT EXISTS idx_net_worth_user_date_desc ON net_worth_snapshots(user_id, date DESC);

-- Subscription analysis: user + active + frequency
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active ON subscriptions(user_id, is_active, frequency);
