CREATE TABLE IF NOT EXISTS platform_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tg_user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'balance',
  amount DECIMAL,
  message TEXT,
  seen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_notif_user_seen
  ON platform_notifications(tg_user_id, seen);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('maintenance_message', 'Идут технические работы. Скоро вернёмся!')
ON CONFLICT (key) DO NOTHING;
