-- Deduplicate ai_chat_config: keep only the most recent row per bot_id
-- Then add UNIQUE constraint so upsert onConflict:'bot_id' works correctly.

DELETE FROM ai_chat_config
WHERE id NOT IN (
  SELECT DISTINCT ON (bot_id) id
  FROM ai_chat_config
  ORDER BY bot_id, updated_at DESC NULLS LAST, id DESC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ai_chat_config'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'ai_chat_config_bot_id_key'
  ) THEN
    ALTER TABLE ai_chat_config ADD CONSTRAINT ai_chat_config_bot_id_key UNIQUE (bot_id);
  END IF;
END $$;
