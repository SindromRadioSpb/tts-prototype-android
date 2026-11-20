-- One explicit, short-lived supplemental order for an exact candidate of a closed edition.
-- Independent from scheduled edition accounting. A new id replaces only an expired, unused order.
CREATE TABLE IF NOT EXISTS news_archive_orders (
  article_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  edition_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('owner','editor')),
  actor_id TEXT NOT NULL,
  url_key TEXT NOT NULL,
  note_ru TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  draft_sha256 TEXT NOT NULL,
  file_name TEXT,
  emitted_pack_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_news_archive_order_expiry ON news_archive_orders(expires_at) WHERE file_name IS NOT NULL;
