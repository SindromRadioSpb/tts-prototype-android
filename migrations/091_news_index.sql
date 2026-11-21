-- News findability (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.1): one row per
-- article of the news section — a slice article from the hourly harvest or a study article — so that
-- the day overview and every outlet are one query with filters, sort and search. Derived data: rebuilt
-- by db/newsIndex.js from news_harvest_items, news_overview_items and news_articles.
CREATE TABLE IF NOT EXISTS news_index (
  rid           INTEGER PRIMARY KEY,
  item_key      TEXT NOT NULL UNIQUE,
  day           TEXT NOT NULL,
  outlet_id     TEXT NOT NULL,
  section       TEXT,
  story_key     TEXT,
  edition_slot  TEXT,
  edition_published_at TEXT,
  published_at  TEXT,
  fresh_at      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK(kind IN ('learn','slice')),
  work_id       TEXT,
  selected_by   TEXT,
  paywalled     INTEGER NOT NULL DEFAULT 0,
  full_ok       INTEGER NOT NULL DEFAULT 0,
  title_he      TEXT NOT NULL,
  title_ru      TEXT,
  subtitle_he   TEXT,
  subtitle_ru   TEXT,
  lead_he       TEXT,
  lead_ru       TEXT,
  url           TEXT,
  body_until    TEXT,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_index_day ON news_index(day, kind, fresh_at DESC);
CREATE INDEX IF NOT EXISTS ix_news_index_outlet_day ON news_index(outlet_id, day, kind, fresh_at DESC);
CREATE INDEX IF NOT EXISTS ix_news_index_story ON news_index(story_key);
-- Search: normalized Hebrew (he), Hebrew without proclitics (stems), Russian (ru). rowid = news_index.rid.
CREATE VIRTUAL TABLE IF NOT EXISTS news_search USING fts5(he, stems, ru, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0');
