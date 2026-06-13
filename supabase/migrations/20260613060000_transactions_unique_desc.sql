-- Remove duplicate transactions (keep earliest)
DELETE FROM transactions a
USING transactions b
WHERE a.id > b.id
  AND a.tg_user_id = b.tg_user_id
  AND a.description IS NOT NULL
  AND a.description = b.description;

-- Unique index prevents race-condition double credits
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_desc
  ON transactions(tg_user_id, description)
  WHERE description IS NOT NULL;
