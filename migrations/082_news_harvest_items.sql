-- News harvester v2 (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §17, owner decision 2026-11-15):
-- the feeds are read every hour and every new article is kept here until the morning build groups the
-- day's articles into stories, picks the main ones for the full study treatment and lists all of them
-- in «Обзор дня». The full body (data_json) is dropped after 3 days; the row itself after 45 days
-- (it keeps an article from being taken twice).
CREATE TABLE IF NOT EXISTS news_harvest_items (
  url_key        TEXT PRIMARY KEY,
  outlet_id      TEXT NOT NULL,
  url            TEXT NOT NULL,
  feed_title     TEXT,
  feed_section   TEXT,
  feed_image     TEXT,
  feed_pub_at    TEXT,
  first_seen_at  TEXT NOT NULL,
  status         TEXT NOT NULL CHECK(status IN ('queued','ready','failed')),
  reason         TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  canonical_key  TEXT,
  published_at   TEXT,
  section        TEXT,
  content_type   TEXT,
  title_he       TEXT,
  subtitle_he    TEXT,
  lead_he        TEXT,
  paywalled      INTEGER NOT NULL DEFAULT 0,
  full_ok        INTEGER NOT NULL DEFAULT 0,
  chars          INTEGER NOT NULL DEFAULT 0,
  images         INTEGER NOT NULL DEFAULT 0,
  data_json      TEXT,
  run_id         TEXT
);
CREATE INDEX IF NOT EXISTS ix_news_harvest_items_queue ON news_harvest_items(status, first_seen_at);
CREATE INDEX IF NOT EXISTS ix_news_harvest_items_run ON news_harvest_items(run_id, first_seen_at);
CREATE INDEX IF NOT EXISTS ix_news_harvest_items_canonical ON news_harvest_items(canonical_key);
-- «Обзор дня» as published: all of the day's articles grouped by story, with dot's translation.
CREATE TABLE IF NOT EXISTS news_overviews (
  day         TEXT PRIMARY KEY,
  pack_id     TEXT,
  body_json   TEXT NOT NULL,
  stories     INTEGER NOT NULL DEFAULT 0,
  items       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
