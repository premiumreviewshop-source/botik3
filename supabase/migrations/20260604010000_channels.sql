CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint NOT NULL,
  username text NOT NULL,
  chat_id bigint,
  title text,
  photo_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tg_user_id, username)
);

ALTER TABLE content_plan ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE SET NULL;
