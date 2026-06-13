CREATE TABLE IF NOT EXISTS kling_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint NOT NULL,
  model_id uuid,
  task_id text,
  status text NOT NULL DEFAULT 'pending',
  input_image_url text,
  motion_video_url text,
  result_video_url text,
  mode text DEFAULT '720p',
  character_orientation text DEFAULT 'image',
  prompt text,
  bot_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('model-videos', 'model-videos', true)
ON CONFLICT (id) DO NOTHING;
