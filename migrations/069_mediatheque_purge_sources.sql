-- Source files of a purged work, recorded BEFORE its snapshots are overwritten. A retry of the
-- deletion (new request key, snapshots already purged) still knows which files to clean up.
CREATE TABLE IF NOT EXISTS published_corpus_purge_sources (
  corpus_id      TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE RESTRICT,
  public_work_id TEXT NOT NULL CHECK(length(public_work_id) BETWEEN 1 AND 160),
  title          TEXT,
  package_sha256 TEXT CHECK(package_sha256 IS NULL OR (package_sha256 GLOB '[0-9a-f]*' AND length(package_sha256)=64)),
  media_sha256   TEXT CHECK(media_sha256 IS NULL OR (media_sha256 GLOB '[0-9a-f]*' AND length(media_sha256)=64)),
  content_root   TEXT CHECK(content_root IS NULL OR (content_root GLOB '[0-9a-f]*' AND length(content_root)=64)),
  recorded_at    TEXT NOT NULL,
  PRIMARY KEY(corpus_id, public_work_id)
);
