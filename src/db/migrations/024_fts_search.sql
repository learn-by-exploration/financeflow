-- Full-text search for transactions
CREATE VIRTUAL TABLE IF NOT EXISTS transactions_fts USING fts5(
  description,
  payee,
  note,
  content='transactions',
  content_rowid='id'
);

-- Populate FTS from existing data
INSERT INTO transactions_fts(rowid, description, payee, note)
  SELECT id, COALESCE(description, ''), COALESCE(payee, ''), COALESCE(note, '')
  FROM transactions;

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS transactions_ai AFTER INSERT ON transactions BEGIN
  INSERT INTO transactions_fts(rowid, description, payee, note)
  VALUES (new.id, COALESCE(new.description, ''), COALESCE(new.payee, ''), COALESCE(new.note, ''));
END;

CREATE TRIGGER IF NOT EXISTS transactions_ad AFTER DELETE ON transactions BEGIN
  INSERT INTO transactions_fts(transactions_fts, rowid, description, payee, note)
  VALUES ('delete', old.id, COALESCE(old.description, ''), COALESCE(old.payee, ''), COALESCE(old.note, ''));
END;

CREATE TRIGGER IF NOT EXISTS transactions_au AFTER UPDATE ON transactions BEGIN
  INSERT INTO transactions_fts(transactions_fts, rowid, description, payee, note)
  VALUES ('delete', old.id, COALESCE(old.description, ''), COALESCE(old.payee, ''), COALESCE(old.note, ''));
  INSERT INTO transactions_fts(rowid, description, payee, note)
  VALUES (new.id, COALESCE(new.description, ''), COALESCE(new.payee, ''), COALESCE(new.note, ''));
END;
