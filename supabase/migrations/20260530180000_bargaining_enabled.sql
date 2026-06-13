alter table ai_chat_config
  add column if not exists bargaining_enabled boolean default true;
