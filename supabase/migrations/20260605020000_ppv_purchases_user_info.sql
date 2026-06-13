ALTER TABLE ppv_purchases
  ADD COLUMN IF NOT EXISTS tg_first_name TEXT,
  ADD COLUMN IF NOT EXISTS tg_username   TEXT;
