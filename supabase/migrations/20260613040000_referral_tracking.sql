CREATE TABLE IF NOT EXISTS referral_tracking (
  referee_tg_user_id BIGINT PRIMARY KEY,
  referrer_tg_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE referral_tracking DISABLE ROW LEVEL SECURITY;
