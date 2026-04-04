-- 040_financial_plans.sql
-- AI Financial Planner: plans, scenarios, milestones, AI interaction log

-- Main plans table
CREATE TABLE IF NOT EXISTS financial_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL CHECK(goal_type IN (
    'home_purchase', 'vehicle', 'wedding', 'education', 'retirement',
    'emergency_fund', 'travel', 'business', 'debt_payoff', 'custom'
  )),
  target_amount REAL NOT NULL,
  target_date TEXT,
  current_saved REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  selected_scenario TEXT DEFAULT 'moderate',
  risk_tolerance TEXT DEFAULT 'moderate' CHECK(risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
  monthly_savings_target REAL DEFAULT 0,
  constraints TEXT, -- JSON: max_monthly_savings, include_tax_optimization, etc.
  plan_data TEXT,   -- JSON: full computed plan output
  ai_narrative TEXT, -- AI-generated plan explanation
  linked_goal_id INTEGER REFERENCES savings_goals(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_financial_plans_user ON financial_plans(user_id, status);

-- Plan scenarios (conservative / moderate / aggressive)
CREATE TABLE IF NOT EXISTS plan_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES financial_plans(id) ON DELETE CASCADE,
  scenario_type TEXT NOT NULL CHECK(scenario_type IN ('conservative', 'moderate', 'aggressive')),
  monthly_savings REAL NOT NULL,
  duration_months INTEGER NOT NULL,
  total_saved REAL NOT NULL DEFAULT 0,
  total_interest REAL NOT NULL DEFAULT 0,
  inflation_adjusted_target REAL NOT NULL DEFAULT 0,
  assumptions TEXT, -- JSON: inflation_rate, return_rate, etc.
  action_items TEXT, -- JSON: list of specific actions
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_scenarios_plan ON plan_scenarios(plan_id);

-- Plan milestones
CREATE TABLE IF NOT EXISTS plan_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES financial_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_amount REAL NOT NULL,
  target_date TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_milestones_plan ON plan_milestones(plan_id);

-- AI interaction log (conversations, replanning events)
CREATE TABLE IF NOT EXISTS plan_ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER REFERENCES financial_plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK(interaction_type IN ('create', 'replan', 'what_if', 'narrative', 'conversation')),
  user_input TEXT,
  ai_output TEXT,
  provider TEXT DEFAULT 'template',
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_ai_log_user ON plan_ai_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_plan_ai_log_plan ON plan_ai_log(plan_id);
