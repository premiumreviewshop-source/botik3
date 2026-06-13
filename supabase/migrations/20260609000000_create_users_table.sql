CREATE TABLE IF NOT EXISTS users (
  tg_user_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
