-- Allow anyone with anon key to upload to model-videos
CREATE POLICY "allow anon insert model-videos"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'model-videos');

-- Allow anyone to read from model-videos (public bucket)
CREATE POLICY "allow public select model-videos"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'model-videos');

-- Allow anyone to delete their uploads from model-videos
CREATE POLICY "allow anon delete model-videos"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'model-videos');
