-- Mediatheque video queue, stage M1 (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.1):
-- one row per YouTube video; the owner's home PC leases a job, downloads the audio, runs ASR and hands in the ASR ZIP.
CREATE TABLE IF NOT EXISTS media_jobs (
  job_id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('owner','dot','channel')),
  priority INTEGER NOT NULL,
  status TEXT NOT NULL,
  step_detail TEXT,
  progress REAL,
  title TEXT,
  duration_sec INTEGER,
  channel_title TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_key_id TEXT,
  lease_until TEXT,
  error_code TEXT,
  error_detail TEXT,
  asr_zip_sha256 TEXT,
  asr_zip_bytes INTEGER,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_jobs_queue ON media_jobs(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_media_jobs_video ON media_jobs(video_id);
