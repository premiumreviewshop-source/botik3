-- Add tg_user_id to transactions if it doesn't exist yet
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tg_user_id TEXT;

-- Function: deduct $0.025 from bot owner when a message is marked as replied
CREATE OR REPLACE FUNCTION deduct_ai_chat_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_tg_id TEXT;
  v_cost NUMERIC := 0.025;
  v_date TEXT;
BEGIN
  -- Only fire when: message type, replied just switched false→true, AI reply present
  IF NEW.replied = TRUE
     AND OLD.replied = FALSE
     AND NEW.type = 'message'
     AND NEW.bot_reply IS NOT NULL
  THEN
    SELECT CAST(tg_user_id AS TEXT)
    INTO v_owner_tg_id
    FROM bots
    WHERE id = NEW.bot_id;

    IF v_owner_tg_id IS NOT NULL AND v_owner_tg_id <> '' AND v_owner_tg_id <> '0' THEN
      v_date := LPAD(EXTRACT(DAY FROM NOW())::INTEGER::TEXT, 2, '0') || '.' ||
                LPAD(EXTRACT(MONTH FROM NOW())::INTEGER::TEXT, 2, '0') || '.' ||
                EXTRACT(YEAR FROM NOW())::INTEGER::TEXT;

      INSERT INTO transactions (tg_user_id, type, amount, description, date, created_at)
      VALUES (v_owner_tg_id, 'spend', v_cost, 'AI Chat · 1 сообщение', v_date, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_deduct_ai_chat ON tg_updates;
CREATE TRIGGER trg_deduct_ai_chat
  AFTER UPDATE OF replied ON tg_updates
  FOR EACH ROW
  EXECUTE FUNCTION deduct_ai_chat_balance();
