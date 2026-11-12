-- News section v1 (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md): learning paraphrases of
-- Israeli outlets, delivered as .lpnews.zip packs by a news editor and published automatically.
CREATE TABLE IF NOT EXISTS news_articles (
  article_id        TEXT PRIMARY KEY CHECK(article_id GLOB 'na_*'),
  outlet_id         TEXT NOT NULL,
  canonical_url     TEXT NOT NULL,
  revision          INTEGER NOT NULL CHECK(revision >= 1),
  section           TEXT NOT NULL,
  section_original_he TEXT NOT NULL,
  content_type      TEXT NOT NULL,
  published_at      TEXT NOT NULL,
  retrieved_at      TEXT NOT NULL,
  title_he          TEXT NOT NULL,
  title_ru          TEXT NOT NULL,
  summary_ru        TEXT NOT NULL,
  title_norm        TEXT NOT NULL,
  original_title_he TEXT NOT NULL,
  author            TEXT,
  story_key         TEXT,
  heavy             INTEGER NOT NULL DEFAULT 0 CHECK(heavy IN (0,1)),
  levels_json       TEXT NOT NULL,
  image_json        TEXT NOT NULL,
  provenance_json   TEXT NOT NULL,
  body_json         TEXT,
  tier              TEXT NOT NULL CHECK(tier IN ('fresh','archive','card','withdrawn')),
  overlap           REAL NOT NULL DEFAULT 0,
  flagged           INTEGER NOT NULL DEFAULT 0 CHECK(flagged IN (0,1)),
  pack_id           TEXT NOT NULL,
  withdrawn_reason  TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE(outlet_id, canonical_url)
);
CREATE INDEX IF NOT EXISTS ix_news_articles_feed ON news_articles(outlet_id, tier, published_at DESC);
CREATE INDEX IF NOT EXISTS ix_news_articles_section ON news_articles(outlet_id, section, published_at DESC);
CREATE INDEX IF NOT EXISTS ix_news_articles_story ON news_articles(story_key);
CREATE INDEX IF NOT EXISTS ix_news_articles_pack ON news_articles(pack_id);
CREATE INDEX IF NOT EXISTS ix_news_articles_tier_time ON news_articles(tier, published_at);

CREATE TABLE IF NOT EXISTS news_works (
  work_id          TEXT PRIMARY KEY,
  article_id       TEXT NOT NULL REFERENCES news_articles(article_id) ON DELETE CASCADE,
  level            TEXT NOT NULL,
  position_no      INTEGER NOT NULL,
  snapshot_json    TEXT NOT NULL,
  snapshot_sha256  TEXT NOT NULL CHECK(length(snapshot_sha256) = 64)
);
CREATE INDEX IF NOT EXISTS ix_news_works_article ON news_works(article_id, position_no);

CREATE TABLE IF NOT EXISTS news_packs (
  pack_id        TEXT PRIMARY KEY,
  uploaded_by    TEXT NOT NULL,
  uploaded_at    TEXT NOT NULL,
  producer_json  TEXT NOT NULL,
  receipt_json   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_packs_time ON news_packs(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS news_events (
  event_id     TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  actor_id     TEXT NOT NULL,
  pack_id      TEXT,
  article_id   TEXT,
  type         TEXT NOT NULL,
  detail_json  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_news_events_time ON news_events(at DESC);

CREATE TABLE IF NOT EXISTS news_editors (
  editor_id   TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  key_sha256  TEXT NOT NULL UNIQUE CHECK(length(key_sha256) = 64),
  status      TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE TABLE IF NOT EXISTS news_editor_sessions (
  session_sha256  TEXT PRIMARY KEY CHECK(length(session_sha256) = 64),
  editor_id       TEXT NOT NULL REFERENCES news_editors(editor_id) ON DELETE CASCADE,
  csrf            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_editor_sessions_editor ON news_editor_sessions(editor_id);
