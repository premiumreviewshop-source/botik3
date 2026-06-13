-- Harden RLS on bots table: restrict anon writes.
-- All bot mutations now go through authenticated edge functions (service_role bypasses RLS).
-- Reads remain open; client queries filter by tg_user_id.

DROP POLICY IF EXISTS "anon_all_bots" ON bots;
CREATE POLICY "anon_read_bots" ON bots FOR SELECT TO anon USING (true);
