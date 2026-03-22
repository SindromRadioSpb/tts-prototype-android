-- 002_v3_library.sql
-- Library v3.0: texts + sentences (single-user). Без BEGIN/COMMIT (раннер сам оборачивает).

CREATE TABLE IF NOT EXISTS texts (
  id TEXT PRIMARY KEY,
  text_key TEXT NOT NULL,
  title TEXT NOT NULL,
  level TEXT,
  tags_json TEXT,
  source_text TEXT NOT NULL,
  source_meta_json TEXT,
  tts_profile_json TEXT,
  table_model_meta_json TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_opened_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_texts_text_key ON texts(text_key);
CREATE INDEX IF NOT EXISTS ix_texts_archived_opened ON texts(is_archived, last_opened_at);
CREATE INDEX IF NOT EXISTS ix_texts_created_at ON texts(created_at);
CREATE INDEX IF NOT EXISTS ix_texts_updated_at ON texts(updated_at);

CREATE TABLE IF NOT EXISTS sentences (
  id TEXT PRIMARY KEY,
  text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,

  he_plain TEXT,
  he_niqqud TEXT,
  translit TEXT,
  ru TEXT,

  row_hash TEXT,
  meta_json TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  UNIQUE(text_id, order_index)
);

CREATE INDEX IF NOT EXISTS ix_sentences_text_order ON sentences(text_id, order_index);
CREATE INDEX IF NOT EXISTS ix_sentences_text_id ON sentences(text_id);
