-- GROUP_SONG_CORPUS_P0.1 — replaceable immutable audio editions.
-- Existing pilot audio becomes revision 1. New revisions append files/rows;
-- the work pointer flips only after the complete MP3+timing edition is ready.

ALTER TABLE group_corpus_works ADD COLUMN audio_revision INTEGER NOT NULL DEFAULT 1 CHECK(audio_revision >= 1);
ALTER TABLE group_corpus_works ADD COLUMN audio_profile_json TEXT;
ALTER TABLE group_corpus_works ADD COLUMN audio_published_at TEXT;

ALTER TABLE group_corpus_audio ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1);
ALTER TABLE group_corpus_audio ADD COLUMN timing_relative_path TEXT;
ALTER TABLE group_corpus_audio ADD COLUMN timing_bytes INTEGER CHECK(timing_bytes IS NULL OR timing_bytes >= 0);
ALTER TABLE group_corpus_audio ADD COLUMN timing_sha256 TEXT CHECK(timing_sha256 IS NULL OR (timing_sha256 GLOB '[0-9a-f]*' AND length(timing_sha256)=64));

CREATE INDEX IF NOT EXISTS ix_group_corpus_audio_revision
  ON group_corpus_audio(corpus_id,work_id,revision);
