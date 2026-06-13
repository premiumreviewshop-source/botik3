SELECT cron.schedule(
  'auto-publish',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://lrvzczxxjwrhywkalbiu.supabase.co/functions/v1/auto-publish',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxydnpjenh4andyaHl3a2FsYml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDg4OTQsImV4cCI6MjA5NTU4NDg5NH0.k5p4biZK34LZBRLq5mB5yxIFvIMzM4oI5CrLtqmyJSY'
    ),
    body    := '{}'::jsonb
  );
  $$
);
