-- Balance deduction moved to application code (pre-Grok INSERT in edge functions).
-- Trigger was unreliable due to SECURITY DEFINER / RLS timing issues.
DROP TRIGGER IF EXISTS trg_deduct_ai_chat ON tg_updates;
