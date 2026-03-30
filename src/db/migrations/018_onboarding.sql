-- Add onboarding tracking to users
ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0;
