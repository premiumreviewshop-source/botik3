-- Drop the PARTIAL unique index — PostgREST upsert onConflict cannot use partial indexes.
-- This was causing silent insert failures (upsert errored, money never credited).
DROP INDEX IF EXISTS idx_transactions_user_desc;

-- Create a full (non-partial) unique index so PostgREST upsert onConflict works correctly.
-- PostgreSQL treats NULL != NULL in unique indexes, so rows with NULL description are still allowed to repeat.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_desc
  ON transactions(tg_user_id, description);
