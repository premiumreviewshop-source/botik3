alter table ai_chat_config
  add column if not exists photo_price int default 250,
  add column if not exists photo_min_price int default 150,
  add column if not exists video_price int default 1400,
  add column if not exists video_min_price int default 900;
