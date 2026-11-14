-- News: the daily article harvester (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16). The server
-- reads the outlets' feeds once a day, takes the new articles one-to-one with their photos and makes an
-- archive of drafts for dot. A run is one archive; `seen` keeps an article from coming back next day.
CREATE TABLE IF NOT EXISTS news_harvest_runs (
  run_id       TEXT PRIMARY KEY,
  day          TEXT NOT NULL,
  trigger      TEXT NOT NULL CHECK(trigger IN ('schedule','manual')),
  status       TEXT NOT NULL CHECK(status IN ('running','done','failed')),
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  articles     INTEGER NOT NULL DEFAULT 0,
  images       INTEGER NOT NULL DEFAULT 0,
  bytes        INTEGER NOT NULL DEFAULT 0,
  file_name    TEXT,
  report_json  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_news_harvest_runs_day ON news_harvest_runs(day, started_at DESC);
CREATE TABLE IF NOT EXISTS news_harvest_seen (
  url_key    TEXT PRIMARY KEY,
  outlet_id  TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  seen_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_harvest_seen_at ON news_harvest_seen(seen_at);
