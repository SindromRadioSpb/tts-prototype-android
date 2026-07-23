-- GROUP_SONG_CORPUS_P1 — additive catalog metadata used by the premium
-- restricted-corpus library surface. The protected work bundle remains the
-- content source of truth; these columns are a small searchable projection.

ALTER TABLE group_corpus_works ADD COLUMN level TEXT;
ALTER TABLE group_corpus_works ADD COLUMN topic TEXT;
ALTER TABLE group_corpus_works ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE group_corpus_works ADD COLUMN source_created_at TEXT;
