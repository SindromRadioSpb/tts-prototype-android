-- 006_w10_sentence_notes.sql
-- Notes per sentence (Library text)

CREATE TABLE IF NOT EXISTS sentence_notes (
  id TEXT PRIMARY KEY,
  text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(text_id, sentence_id)
);

CREATE INDEX IF NOT EXISTS idx_sentence_notes_text_id ON sentence_notes(text_id);
CREATE INDEX IF NOT EXISTS idx_sentence_notes_sentence_id ON sentence_notes(sentence_id);
CREATE INDEX IF NOT EXISTS idx_sentence_notes_updated_at ON sentence_notes(updated_at);
