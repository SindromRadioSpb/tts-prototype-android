-- GROUP_SONG_CORPUS_P0 — one restricted server corpus shared by an explicit
-- learning group. Content metadata lives here; work bundles and MP3 files live
-- on the persistent volume. Learner truth (review_log/word_status/FSRS) is not
-- copied into these tables.

CREATE TABLE IF NOT EXISTS reading_groups (
  group_id       TEXT PRIMARY KEY,
  owner_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 200),
  status         TEXT NOT NULL CHECK(status IN ('ACTIVE','ARCHIVED')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_group_members (
  group_id    TEXT NOT NULL REFERENCES reading_groups(group_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('OWNER','MEMBER')),
  status      TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  revoked_at  TEXT,
  PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS ix_reading_group_members_user
  ON reading_group_members(user_id,status,group_id);

CREATE TABLE IF NOT EXISTS group_corpora (
  corpus_id      TEXT PRIMARY KEY,
  group_id       TEXT NOT NULL REFERENCES reading_groups(group_id) ON DELETE CASCADE,
  slug           TEXT NOT NULL CHECK(slug GLOB '[a-z0-9-]*' AND length(slug) BETWEEN 1 AND 80),
  title          TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 240),
  visibility     TEXT NOT NULL CHECK(visibility='GROUP_RESTRICTED'),
  version        INTEGER NOT NULL CHECK(version >= 1),
  status         TEXT NOT NULL CHECK(status IN ('DRAFT','PILOT','ACTIVE','ARCHIVED')),
  rights_basis   TEXT NOT NULL CHECK(rights_basis IN ('EDUCATIONAL_GROUP_RESTRICTED_REVIEW_REQUIRED','LICENSED','PUBLIC_DOMAIN')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE(group_id,slug)
);
CREATE INDEX IF NOT EXISTS ix_group_corpora_group_status
  ON group_corpora(group_id,status);

CREATE TABLE IF NOT EXISTS group_corpus_works (
  corpus_id       TEXT NOT NULL REFERENCES group_corpora(corpus_id) ON DELETE CASCADE,
  work_id         TEXT NOT NULL,
  text_key        TEXT NOT NULL CHECK(length(text_key) BETWEEN 1 AND 200),
  position_no     INTEGER,
  title           TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 500),
  artist          TEXT,
  source_url      TEXT,
  rights_status   TEXT NOT NULL CHECK(rights_status IN ('REVIEW_REQUIRED','APPROVED','REMOVED')),
  bundle_path     TEXT NOT NULL CHECK(length(bundle_path) BETWEEN 1 AND 500),
  bundle_sha256   TEXT NOT NULL CHECK(bundle_sha256 GLOB '[0-9a-f]*' AND length(bundle_sha256)=64),
  rows_count      INTEGER NOT NULL CHECK(rows_count >= 0),
  audio_count     INTEGER NOT NULL CHECK(audio_count >= 0),
  notes_count     INTEGER NOT NULL CHECK(notes_count >= 0),
  morph_count     INTEGER NOT NULL CHECK(morph_count >= 0),
  source_updated_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY(corpus_id,work_id),
  UNIQUE(corpus_id,text_key)
);
CREATE INDEX IF NOT EXISTS ix_group_corpus_works_order
  ON group_corpus_works(corpus_id,position_no,work_id);

CREATE TABLE IF NOT EXISTS group_corpus_audio (
  corpus_id     TEXT NOT NULL,
  work_id       TEXT NOT NULL,
  asset_key     TEXT NOT NULL CHECK(asset_key GLOB '[0-9a-f]*' AND length(asset_key)=64),
  relative_path TEXT NOT NULL CHECK(length(relative_path) BETWEEN 1 AND 500),
  bytes         INTEGER NOT NULL CHECK(bytes >= 0),
  sha256        TEXT NOT NULL CHECK(sha256 GLOB '[0-9a-f]*' AND length(sha256)=64),
  mime          TEXT NOT NULL CHECK(mime='audio/mpeg'),
  created_at    TEXT NOT NULL,
  PRIMARY KEY(corpus_id,work_id,asset_key),
  FOREIGN KEY(corpus_id,work_id)
    REFERENCES group_corpus_works(corpus_id,work_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_group_corpus_audio_lookup
  ON group_corpus_audio(corpus_id,asset_key);
