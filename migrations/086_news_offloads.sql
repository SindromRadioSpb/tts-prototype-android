-- News: archived days offloaded to the owner's PC and brought back
-- (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11). The card of an offloaded article stays;
-- its body, study snapshots and photos live in the owner's archive file until restored.
CREATE TABLE IF NOT EXISTS news_offloads (
  day          TEXT PRIMARY KEY,
  sha256       TEXT NOT NULL,
  state        TEXT NOT NULL CHECK(state IN ('exported','released','restored')),
  articles     INTEGER NOT NULL DEFAULT 0,
  photos       INTEGER NOT NULL DEFAULT 0,
  bytes        INTEGER NOT NULL DEFAULT 0,
  exported_at  TEXT,
  released_at  TEXT,
  restored_at  TEXT
);
ALTER TABLE news_articles ADD COLUMN offloaded_day TEXT;
CREATE INDEX IF NOT EXISTS ix_news_articles_offloaded ON news_articles(offloaded_day);
