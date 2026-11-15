-- News: one day, four editions (docs/superpowers/specs/2026-11-15-news-editions-design.md).
-- The server cuts the day at four times (morning, midday, evening, late), each cut is an edition with
-- its own archive for dot. An article counts as taken only once it is published; stories live across
-- editions and days; «Обзор дня» is kept by article and grows with each edition.
CREATE TABLE IF NOT EXISTS news_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news_editions (
  edition_id        TEXT PRIMARY KEY,
  day               TEXT NOT NULL,
  slot              TEXT NOT NULL CHECK(slot IN ('morning','midday','evening','late','extra')),
  trigger           TEXT NOT NULL CHECK(trigger IN ('schedule','manual')),
  status            TEXT NOT NULL CHECK(status IN ('building','archived','downloaded','published','partial','superseded','skipped','failed')),
  cutoff_at         TEXT,
  target_ready_at   TEXT,
  cut_at            TEXT,
  archive_ready_at  TEXT,
  downloaded_at     TEXT,
  lease_until       TEXT,
  first_upload_at   TEXT,
  published_at      TEXT,
  closed_at         TEXT,
  main_count        INTEGER NOT NULL DEFAULT 0,
  overview_count    INTEGER NOT NULL DEFAULT 0,
  published_count   INTEGER NOT NULL DEFAULT 0,
  rework_count      INTEGER NOT NULL DEFAULT 0,
  extras_count      INTEGER NOT NULL DEFAULT 0,
  file_name         TEXT,
  bytes             INTEGER NOT NULL DEFAULT 0,
  report_json       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_news_editions_day ON news_editions(day, slot);
CREATE TABLE IF NOT EXISTS news_stories (
  story_key       TEXT PRIMARY KEY,
  first_day       TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  last_at         TEXT NOT NULL,
  words_json      TEXT NOT NULL,
  mass            REAL NOT NULL,
  outlets_json    TEXT NOT NULL DEFAULT '[]',
  full_at         TEXT,
  full_outlets    INTEGER NOT NULL DEFAULT 0,
  full_title_he   TEXT,
  full_title_ru   TEXT,
  prev_story_key  TEXT
);
CREATE INDEX IF NOT EXISTS ix_news_stories_last ON news_stories(last_at);
CREATE TABLE IF NOT EXISTS news_overview_items (
  item_key      TEXT PRIMARY KEY,
  day           TEXT NOT NULL,
  story_key     TEXT NOT NULL,
  edition_id    TEXT,
  outlet_id     TEXT NOT NULL,
  url           TEXT NOT NULL,
  published_at  TEXT,
  section       TEXT,
  title_he      TEXT NOT NULL,
  title_ru      TEXT,
  subtitle_he   TEXT,
  subtitle_ru   TEXT,
  lead_he       TEXT,
  lead_ru       TEXT,
  paywalled     INTEGER NOT NULL DEFAULT 0,
  changed_at    TEXT,
  change_json   TEXT,
  pack_id       TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_overview_items_day ON news_overview_items(day, story_key);
CREATE INDEX IF NOT EXISTS ix_news_overview_items_edition ON news_overview_items(edition_id);
-- Accounting of each harvested article across editions.
ALTER TABLE news_harvest_items ADD COLUMN story_key TEXT;
ALTER TABLE news_harvest_items ADD COLUMN edition_id TEXT;
ALTER TABLE news_harvest_items ADD COLUMN overview_state TEXT NOT NULL DEFAULT 'todo';
ALTER TABLE news_harvest_items ADD COLUMN main_state TEXT NOT NULL DEFAULT 'none';
ALTER TABLE news_harvest_items ADD COLUMN main_edition_id TEXT;
ALTER TABLE news_harvest_items ADD COLUMN main_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_harvest_items ADD COLUMN main_reason TEXT;
ALTER TABLE news_harvest_items ADD COLUMN selected_by TEXT;
ALTER TABLE news_harvest_items ADD COLUMN selection_note_ru TEXT;
ALTER TABLE news_harvest_items ADD COLUMN draft_images_json TEXT;
ALTER TABLE news_harvest_items ADD COLUMN lease_until TEXT;
CREATE INDEX IF NOT EXISTS ix_news_harvest_items_story ON news_harvest_items(story_key);
CREATE INDEX IF NOT EXISTS ix_news_harvest_items_main ON news_harvest_items(main_state, main_edition_id);
-- Articles taken before editions (run_id set by the v2 morning build) count as done.
UPDATE news_harvest_items SET overview_state='done' WHERE run_id IS NOT NULL;
