-- Track which content type was most recently sent per bot+chat.
-- This allows correct price prompt selection when BOTH photo and video have been sent.
ALTER TABLE ppv_last_sent ADD COLUMN IF NOT EXISTS last_sent_type TEXT;
