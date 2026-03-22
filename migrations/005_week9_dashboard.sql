-- Week 9 (P0) Learning Dashboard foundation
-- Adds:
-- - text meta fields: source/topic + pinned
-- - history tables: history_events, recent_rows, recent_texts
-- IMPORTANT: Do NOT add BEGIN/COMMIT/ROLLBACK (runner wraps transaction).

-- 1) Extend texts meta (P0)
ALTER TABLE texts ADD COLUMN source TEXT NULL;
ALTER TABLE texts ADD COLUMN topic TEXT NULL;

ALTER TABLE texts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE texts ADD COLUMN pin_order INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_texts_pinned ON texts(is_pinned, pin_order);
CREATE INDEX IF NOT EXISTS idx_texts_level ON texts(level);

-- 2) History events (append-only)
CREATE TABLE IF NOT EXISTS history_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NULL,
  text_id TEXT NOT NULL,
  sentence_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  asset_key TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(text_id) REFERENCES texts(id) ON DELETE CASCADE,
  FOREIGN KEY(sentence_id) REFERENCES sentences(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_events_created_at ON history_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_events_text_created_at ON history_events(text_id, created_at DESC);

-- 3) Recent rows (aggregated per (text_id, sentence_id))
CREATE TABLE IF NOT EXISTS recent_rows (
  text_id TEXT NOT NULL,
  sentence_id TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  last_asset_key TEXT NULL,
  PRIMARY KEY(text_id, sentence_id),
  FOREIGN KEY(text_id) REFERENCES texts(id) ON DELETE CASCADE,
  FOREIGN KEY(sentence_id) REFERENCES sentences(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recent_rows_text_last_seen ON recent_rows(text_id, last_seen_at DESC);

-- 4) Recent texts (aggregated per text)
CREATE TABLE IF NOT EXISTS recent_texts (
  text_id TEXT NOT NULL PRIMARY KEY,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  last_sentence_id TEXT NULL,
  last_asset_key TEXT NULL,
  FOREIGN KEY(text_id) REFERENCES texts(id) ON DELETE CASCADE,
  FOREIGN KEY(last_sentence_id) REFERENCES sentences(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recent_texts_last_seen ON recent_texts(last_seen_at DESC);
