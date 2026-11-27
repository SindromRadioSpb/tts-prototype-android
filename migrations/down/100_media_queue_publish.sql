-- SQLite before 3.35 cannot drop a column; the publish fields are cleared instead.
DROP INDEX IF EXISTS idx_media_jobs_published;
UPDATE media_jobs SET dot_editor_id=NULL, dot_lease_until=NULL, archive_sha256=NULL, published_slug=NULL, published_work_id=NULL, published_at=NULL, withdrawn_at=NULL;
