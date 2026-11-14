-- News: photos from the article itself (owner decision 2026-11-14). The Reading Room runs under
-- COEP require-corp, so outlet CDNs cannot be hotlinked there; the pack ships the files and the
-- server serves them same-origin. Removed when the article becomes a card or leaves the trash.
CREATE TABLE IF NOT EXISTS news_images (
  article_id  TEXT NOT NULL REFERENCES news_articles(article_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
  sha256      TEXT NOT NULL CHECK(length(sha256) = 64),
  bytes       BLOB NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY(article_id, name)
);
