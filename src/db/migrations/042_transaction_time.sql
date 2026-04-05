-- Add optional time field to transactions (HH:MM format)
ALTER TABLE transactions ADD COLUMN time TEXT DEFAULT NULL;
