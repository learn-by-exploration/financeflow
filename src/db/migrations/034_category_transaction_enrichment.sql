-- v8.0.0 Category nature classification + Transaction payment mode
ALTER TABLE categories ADD COLUMN nature TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN payment_mode TEXT DEFAULT NULL;
