CREATE TABLE IF NOT EXISTS admins (
  tg_user_id TEXT PRIMARY KEY,
  granted_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
