-- News findability W4 (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.6, §7.1, §8а п.1, п.5):
-- personal tags and ★ (the tag '★') on articles and stories, per signed-in user; reads per user; the set
-- of articles the owner's marks keep beyond every retention, and the photos kept for them.
CREATE TABLE IF NOT EXISTS news_marks (
  item_key    TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  tag         TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (item_key, actor_id, tag)
);
CREATE INDEX IF NOT EXISTS ix_news_marks_actor_tag ON news_marks(actor_id, tag);
CREATE TABLE IF NOT EXISTS news_reads (
  item_key  TEXT NOT NULL,
  actor_id  TEXT NOT NULL,
  at        TEXT NOT NULL,
  PRIMARY KEY (item_key, actor_id)
);
-- source: 'item' (the owner marked the article) or 'story:<key>' (the owner marked its story: text only).
CREATE TABLE IF NOT EXISTS news_pins (
  item_key   TEXT NOT NULL,
  source     TEXT NOT NULL,
  pinned_at  TEXT NOT NULL,
  PRIMARY KEY (item_key, source)
);
CREATE TABLE IF NOT EXISTS news_pin_images (
  item_key  TEXT NOT NULL,
  name      TEXT NOT NULL,
  mime      TEXT NOT NULL,
  sha256    TEXT NOT NULL,
  bytes     BLOB NOT NULL,
  PRIMARY KEY (item_key, name)
);
