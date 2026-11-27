-- Mediatheque video pipeline, stage M3 «Каналы» (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.2):
-- YouTube channels the server polls by RSS, the candidates they bring and dot's translated titles.
CREATE TABLE IF NOT EXISTS media_channels (
  channel_id TEXT PRIMARY KEY,
  title TEXT,
  handle TEXT,
  added_by TEXT,
  added_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_polled_at TEXT,
  last_ok_at TEXT,
  last_error TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media_candidates (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  published_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  title_ru TEXT,
  title_ru_by TEXT,
  title_ru_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_candidates_published ON media_candidates(published_at);
CREATE INDEX IF NOT EXISTS idx_media_candidates_channel ON media_candidates(channel_id);
-- dot's picks count per Israel day; a job remembers the channel it came from.
ALTER TABLE media_jobs ADD COLUMN pick_day TEXT;
ALTER TABLE media_jobs ADD COLUMN channel_id TEXT;
CREATE INDEX IF NOT EXISTS idx_media_jobs_pick_day ON media_jobs(pick_day) WHERE pick_day IS NOT NULL;
