-- Mediatheque video queue, stage M2 (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.4–5.5):
-- dot takes a job with ASR ready, uploads its learning archive, the server publishes it into «Видео дня».
ALTER TABLE media_jobs ADD COLUMN dot_editor_id TEXT;
ALTER TABLE media_jobs ADD COLUMN dot_lease_until TEXT;
ALTER TABLE media_jobs ADD COLUMN upload_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media_jobs ADD COLUMN archive_sha256 TEXT;
ALTER TABLE media_jobs ADD COLUMN published_slug TEXT;
ALTER TABLE media_jobs ADD COLUMN published_work_id TEXT;
ALTER TABLE media_jobs ADD COLUMN published_at TEXT;
ALTER TABLE media_jobs ADD COLUMN withdrawn_at TEXT;
CREATE INDEX IF NOT EXISTS idx_media_jobs_published ON media_jobs(published_at) WHERE published_at IS NOT NULL;
