-- Run this in Supabase SQL Editor AFTER deploying your Edge Functions.
-- Replace lrvzczxxjwrhywkalbiu with your project ref (e.g. abcdefghijklmnop)
-- Replace eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxydnpjenh4andyaHl3a2FsYml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDg4OTQsImV4cCI6MjA5NTU4NDg5NH0.k5p4biZK34LZBRLq5mB5yxIFvIMzM4oI5CrLtqmyJSY with your anon key from Project Settings > API

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Poll active Telegram bots every minute
SELECT cron.schedule(
  'poll-telegram',
  '* * * * *',
  $$
  SELECT net.http_post(
    url    := 'https://lrvzczxxjwrhywkalbiu.supabase.co/functions/v1/poll-telegram',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxydnpjenh4andyaHl3a2FsYml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDg4OTQsImV4cCI6MjA5NTU4NDg5NH0.k5p4biZK34LZBRLq5mB5yxIFvIMzM4oI5CrLtqmyJSY'
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- Sync pending Wavespeed AI jobs every minute
SELECT cron.schedule(
  'sync-ai-jobs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url    := 'https://lrvzczxxjwrhywkalbiu.supabase.co/functions/v1/sync-ai-jobs',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxydnpjenh4andyaHl3a2FsYml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDg4OTQsImV4cCI6MjA5NTU4NDg5NH0.k5p4biZK34LZBRLq5mB5yxIFvIMzM4oI5CrLtqmyJSY'
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- Run AI replies every minute
SELECT cron.schedule(
  'ai-reply',
  '* * * * *',
  $$
  SELECT net.http_post(
    url    := 'https://lrvzczxxjwrhywkalbiu.supabase.co/functions/v1/ai-reply',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxydnpjenh4andyaHl3a2FsYml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDg4OTQsImV4cCI6MjA5NTU4NDg5NH0.k5p4biZK34LZBRLq5mB5yxIFvIMzM4oI5CrLtqmyJSY'
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- To remove jobs later:
-- SELECT cron.unschedule('poll-telegram');
-- SELECT cron.unschedule('sync-ai-jobs');
-- SELECT cron.unschedule('ai-reply');

