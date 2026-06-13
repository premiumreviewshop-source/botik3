-- myagents Telegram Mini App — Supabase PostgreSQL schema

CREATE TABLE IF NOT EXISTS bots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  handle      TEXT NOT NULL DEFAULT '',
  token       TEXT NOT NULL,
  chat_id     TEXT,
  is_active   BOOLEAN DEFAULT true,
  modules     JSONB DEFAULT '[]'::jsonb,
  tg_offset   BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tg_updates (
  id          BIGSERIAL PRIMARY KEY,
  bot_id      UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  update_id   BIGINT NOT NULL,
  type        TEXT NOT NULL,
  user_id     BIGINT,
  amount      INT,
  payload     TEXT,
  ts          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bot_id, update_id)
);

CREATE TABLE IF NOT EXISTS ppv_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id       UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  price_stars  INT NOT NULL,
  media_type   TEXT DEFAULT 'photo',
  media_url    TEXT,
  purchases    INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_models (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  status           TEXT DEFAULT 'processing',
  wavespeed_job_id TEXT,
  preview_url      TEXT,
  lora_url         TEXT,
  trigger_word     TEXT DEFAULT 'TOK',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  model_name       TEXT,
  prompt           TEXT NOT NULL,
  status           TEXT DEFAULT 'processing',
  wavespeed_job_id TEXT,
  image_url        TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url         TEXT,
  extra_urls  JSONB DEFAULT '[]'::jsonb,
  caption     TEXT DEFAULT '',
  price       NUMERIC,
  category    TEXT DEFAULT 'free',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_plan (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date         TEXT NOT NULL,
  date_obj     TEXT NOT NULL,
  time         TEXT NOT NULL,
  category     TEXT NOT NULL,
  post_id      UUID REFERENCES posts(id) ON DELETE SET NULL,
  post_url     TEXT,
  post_caption TEXT,
  price        NUMERIC,
  status       TEXT DEFAULT 'scheduled',
  bot_id       UUID REFERENCES bots(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_prompts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_footers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  text        TEXT NOT NULL,
  gap_lines   INT DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  amount      NUMERIC NOT NULL,
  description TEXT,
  date        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: enable on all tables
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppv_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_footers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- bots: SELECT only for anon (reads filtered by tg_user_id in client queries).
-- All writes (INSERT/UPDATE/DELETE) go through edge functions using service_role key.
-- MIGRATION REQUIRED: DROP POLICY "anon_all_bots" ON bots; then run these two:
CREATE POLICY "anon_read_bots"        ON bots         FOR SELECT TO anon USING (true);
-- service_role bypasses RLS, so no policy needed for edge functions.

-- Other tables: still open for anon (client-side CRUD filtered by tg_user_id).
-- TODO: migrate these to edge functions for full security in a future release.
CREATE POLICY "anon_all_tg_updates"   ON tg_updates   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ppv_items"    ON ppv_items     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ai_models"    ON ai_models     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_generations"  ON generations   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_posts"        ON posts         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_content_plan" ON content_plan  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_prompts"      ON saved_prompts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_footers"      ON saved_footers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_transactions" ON transactions   FOR ALL TO anon USING (true) WITH CHECK (true);
