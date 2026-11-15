-- News: fingerprints of the original per paragraph and the outlet's later changes
-- (docs/superpowers/specs/2026-11-15-news-editions-design.md §4.4, §5.5). The published article is never
-- changed; the change is only recorded and shown as a note.
CREATE TABLE IF NOT EXISTS news_article_fingerprints (
  article_id        TEXT PRIMARY KEY,
  url               TEXT NOT NULL,
  title_hash        TEXT NOT NULL,
  para_hashes_json  TEXT NOT NULL,
  last_seen_json    TEXT,
  checked_at        TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_article_fingerprints_created ON news_article_fingerprints(created_at);
CREATE TABLE IF NOT EXISTS news_article_changes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id         TEXT NOT NULL,
  detected_at        TEXT NOT NULL,
  edition_id         TEXT,
  source_updated_at  TEXT,
  added              INTEGER NOT NULL DEFAULT 0,
  changed            INTEGER NOT NULL DEFAULT 0,
  removed            INTEGER NOT NULL DEFAULT 0,
  title_changed      INTEGER NOT NULL DEFAULT 0,
  new_title_he       TEXT,
  significant        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_article_changes_article ON news_article_changes(article_id, detected_at);
