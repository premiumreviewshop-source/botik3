-- The existing unique index on (tg_user_id, description) accidentally blocks
-- repeated spend transactions with the same description (e.g., second faceswap,
-- second carousel run with the same count). It was intended only to prevent
-- double-crediting the same payment invoice.
--
-- Fix: drop the all-type index; add a partial one covering only 'topup' rows.
-- The payments edge function will be updated to use INSERT + ON CONFLICT
-- instead of upsert so it works with the partial index.

DROP INDEX IF EXISTS idx_transactions_user_desc;

-- Only prevent duplicate topup credits (same invoice credited twice)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_topup_desc
  ON transactions(tg_user_id, description)
  WHERE type = 'topup';
