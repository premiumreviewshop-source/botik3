-- Claim lock so concurrent cron/webhook instances don't double-process the same message
ALTER TABLE tg_updates ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tg_updates_locked_at ON tg_updates(locked_at) WHERE locked_at IS NOT NULL AND replied = false;

-- Rebuild trigger to be exception-safe (prevents UPDATE rollback on balance errors)
CREATE OR REPLACE FUNCTION deduct_ai_chat_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_tg_id TEXT;
  v_cost NUMERIC := 0.025;
  v_date TEXT;
BEGIN
  IF NEW.replied = TRUE AND OLD.replied = FALSE
     AND NEW.type = 'message'
     AND NEW.bot_reply IS NOT NULL
  THEN
    BEGIN
      SELECT CAST(tg_user_id AS TEXT) INTO v_owner_tg_id
      FROM bots WHERE id = NEW.bot_id;

      IF v_owner_tg_id IS NOT NULL AND v_owner_tg_id <> '' AND v_owner_tg_id <> '0' THEN
        v_date := LPAD(EXTRACT(DAY  FROM NOW())::INTEGER::TEXT, 2, '0') || '.' ||
                  LPAD(EXTRACT(MONTH FROM NOW())::INTEGER::TEXT, 2, '0') || '.' ||
                  EXTRACT(YEAR FROM NOW())::INTEGER::TEXT;
        INSERT INTO transactions (tg_user_id, type, amount, description, date, created_at)
        VALUES (v_owner_tg_id, 'spend', v_cost, 'AI Chat · 1 сообщение', v_date, NOW());
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'deduct_ai_chat_balance failed for bot % msg %: %', NEW.bot_id, NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
