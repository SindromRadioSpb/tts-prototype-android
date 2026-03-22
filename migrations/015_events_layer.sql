-- PATCH-07 analytics-alignment
-- Forward-compatible unified analytics event layer.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  session_id TEXT,
  text_id TEXT,
  sentence_id TEXT,
  note_id TEXT,
  card_id TEXT,
  source TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_ts
  ON events(ts);

CREATE INDEX IF NOT EXISTS idx_events_type_ts
  ON events(event_type, ts);

CREATE INDEX IF NOT EXISTS idx_events_session_id
  ON events(session_id);

CREATE INDEX IF NOT EXISTS idx_events_text_id
  ON events(text_id);

CREATE INDEX IF NOT EXISTS idx_events_sentence_id
  ON events(sentence_id);

CREATE INDEX IF NOT EXISTS idx_events_card_id
  ON events(card_id);
