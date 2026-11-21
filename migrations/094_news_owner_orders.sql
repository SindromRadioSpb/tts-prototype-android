-- News findability W5 (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.7, §7.2, §7.4): the owner's
-- orders for dot — «make this article a study material», one row per article (a tag order expands into
-- articles). dot takes an order with its own key (the draft is built by the server from the kept full
-- text) and the order closes when the article is published, or fails with a reason everyone can see.
CREATE TABLE IF NOT EXISTS news_owner_orders (
  order_id          TEXT PRIMARY KEY,
  item_key          TEXT NOT NULL,
  tag               TEXT,
  day_from          TEXT,
  day_to            TEXT,
  note_ru           TEXT NOT NULL,
  status            TEXT NOT NULL CHECK(status IN ('open','taken','done','failed','expired')),
  reason            TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  edition_id        TEXT,
  archive_order_id  TEXT,
  work_id           TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_news_owner_orders_live ON news_owner_orders(item_key) WHERE status IN ('open','taken');
CREATE INDEX IF NOT EXISTS ix_news_owner_orders_status ON news_owner_orders(status, created_at);
