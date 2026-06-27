-- Persistent state for the server-side carousel pipeline.
-- sync-ai-jobs cron advances stage each tick:
--   nano_banana → seedream → (wan started via wavespeed_job_id on generations) → done

CREATE TABLE IF NOT EXISTS carousel_jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id           BIGINT NOT NULL,
  model_id             UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  model_url            TEXT NOT NULL,
  ref_url              TEXT NOT NULL,
  nano_banana_prompt   TEXT NOT NULL,
  model_preview_url    TEXT,
  count                INT NOT NULL,
  stage                TEXT NOT NULL DEFAULT 'nano_banana',
  nano_banana_job_id   TEXT,
  base_photo_url       TEXT,
  pose_prompts         JSONB,
  seedream_job_ids     JSONB,
  generation_ids       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carousel_jobs_stage_idx ON carousel_jobs (stage);
