-- Run in Supabase SQL Editor to create storage bucket for model training images

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'model-images',
  'model-images',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/jpg']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read model-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'model-images');

CREATE POLICY "Anon upload model-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'model-images');

CREATE POLICY "Anon delete model-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'model-images');
