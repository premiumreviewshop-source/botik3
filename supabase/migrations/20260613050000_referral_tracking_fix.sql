-- Rename referrer_supabase_id → referrer_tg_user_id and convert to BIGINT
DO $$
BEGIN
  -- Add new column if it doesn't exist yet
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_tracking' AND column_name = 'referrer_tg_user_id'
  ) THEN
    ALTER TABLE referral_tracking ADD COLUMN referrer_tg_user_id BIGINT;
    -- Migrate existing data: cast old text column to bigint
    UPDATE referral_tracking SET referrer_tg_user_id = referrer_supabase_id::BIGINT
      WHERE referrer_supabase_id ~ '^[0-9]+$';
    ALTER TABLE referral_tracking DROP COLUMN IF EXISTS referrer_supabase_id;
    ALTER TABLE referral_tracking ALTER COLUMN referrer_tg_user_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_referral_tracking_referrer ON referral_tracking(referrer_tg_user_id);
