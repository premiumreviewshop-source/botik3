CREATE TABLE IF NOT EXISTS saved_emojis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint NOT NULL,
  sticker_id text NOT NULL,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_emojis_tg_user_id_idx ON saved_emojis(tg_user_id);
