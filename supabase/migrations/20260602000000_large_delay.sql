ALTER TABLE ai_chat_config
  ADD COLUMN IF NOT EXISTS large_delay_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS large_delay_seconds int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS inactivity_reset_minutes int NOT NULL DEFAULT 10;
