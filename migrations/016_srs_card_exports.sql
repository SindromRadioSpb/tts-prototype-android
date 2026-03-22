-- PATCH-08 Anki Export v1
-- Stable local metadata for SRS card exports.

CREATE TABLE IF NOT EXISTS srs_card_exports (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  card_id TEXT NOT NULL,
  deck_name TEXT,
  model_name TEXT,
  template_code TEXT,
  external_note_id TEXT,
  external_card_ids_json TEXT NOT NULL DEFAULT '[]',
  export_hash TEXT NOT NULL,
  last_sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  exported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(card_id) REFERENCES srs_cards(id) ON DELETE CASCADE,
  UNIQUE(provider, card_id)
);

CREATE INDEX IF NOT EXISTS idx_srs_card_exports_provider_card
  ON srs_card_exports(provider, card_id);

CREATE INDEX IF NOT EXISTS idx_srs_card_exports_note_id
  ON srs_card_exports(external_note_id);
