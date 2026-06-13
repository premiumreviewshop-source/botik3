# Supabase Deployment

## 1. Create Supabase project
Go to supabase.com → New project. Note your **Project URL** and **anon key** (Project Settings → API).

## 2. Run schema
SQL Editor → paste `schema.sql` → Run.

## 3. Set Edge Function secrets
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set \
  XAI_API_KEY=xai-... \
  XAI_MODEL=grok-4.3 \
  WAVESPEED_API_KEY=wsk_live_... \
  WAVESPEED_BASE_URL=https://api.wavespeed.ai/api/v2 \
  SEEDREAM_MODEL_ID=bytedance/seedream-v4-edit \
  WAN_MODEL_ID=alibaba/wan2.7-image-edit-pro
```

## 4. Deploy Edge Functions
```bash
supabase functions deploy add-bot
supabase functions deploy generate-caption
supabase functions deploy create-model
supabase functions deploy generate-photo
supabase functions deploy poll-telegram
supabase functions deploy sync-ai-jobs
supabase functions deploy analytics
supabase functions deploy publish-post
```

## 5. Set up cron jobs
Edit `cron.sql` — replace `PROJECT_REF` and `ANON_KEY`, then run in SQL Editor.

## 6. Set Vercel env vars
In Vercel → Project → Settings → Environment Variables:
```
VITE_SUPABASE_URL   = https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY = your-anon-key
```
Then redeploy the frontend.
