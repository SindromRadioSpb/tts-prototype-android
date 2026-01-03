-- W10-NOTES-01: Notes per sentence
-- One note per (text_id, sentence_id)
-- Safe minimal schema (PRO): FK + index + upsert-ready unique

CREATE TABLE IF NOT EXISTS sentence_notes (
  id TEXT PRIMARY KEY,
  text_id TEXT NOT NULL,
  sentence_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
  FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,

  UNIQUE(text_id, sentence_id)
);

CREATE INDEX IF NOT EXISTS idx_sentence_notes_sentence_id ON sentence_notes(sentence_id);
