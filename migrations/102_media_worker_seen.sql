-- Mediatheque video pipeline, stage M4 (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.6):
-- when the home PC last asked for work and with which yt-dlp, so the owner sees «ПК не выходил на связь с …».
CREATE TABLE IF NOT EXISTS media_worker_seen (
  key_id TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL,
  ytdlp_version TEXT
);
