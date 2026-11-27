-- SQLite before 3.35 cannot drop a column; the pick fields are cleared instead.
DROP INDEX IF EXISTS idx_media_jobs_pick_day;
UPDATE media_jobs SET pick_day=NULL, channel_id=NULL;
DROP TABLE IF EXISTS media_candidates;
DROP TABLE IF EXISTS media_channels;
