-- Wave 2 F1 — bounded, correctable learner continuity.
-- This store is advisory only: it never owns review_log, FSRS, profile, grading,
-- linguistic truth or consent. Raw source bodies and prompts are prohibited.

CREATE TABLE IF NOT EXISTS learner_memory_records (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL CHECK(kind IN ('declared_goal','unfinished_thread')),
  authority_class      TEXT NOT NULL CHECK(authority_class IN ('USER_DECLARED','DERIVED_CANDIDATE','USER_CONFIRMED_DERIVED')),
  status               TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','SUPPRESSED','EXPIRED','ANNULLED','RESOLVED')),
  use_enabled          INTEGER NOT NULL DEFAULT 0 CHECK(use_enabled IN (0,1)),
  priority             INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 9),
  current_revision_id  TEXT,
  dedupe_key           TEXT,
  schema_version       TEXT NOT NULL,
  policy_version       TEXT NOT NULL,
  consent_snapshot_ref TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  review_at            TEXT,
  expires_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_memory_records_user_state
  ON learner_memory_records(user_id,status,kind,expires_at);
CREATE INDEX IF NOT EXISTS ix_memory_records_user_use
  ON learner_memory_records(user_id,use_enabled,status,priority,updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_memory_records_live_dedupe
  ON learner_memory_records(user_id,dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('PENDING','ACTIVE','SUPPRESSED');

CREATE TABLE IF NOT EXISTS learner_memory_revisions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id      TEXT NOT NULL REFERENCES learner_memory_records(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 16),
  operation      TEXT NOT NULL CHECK(operation IN ('CREATE','KEEP','CORRECT','SUPPRESS','UNSUPPRESS','RECONFIRM','RESOLVE','ANNUL')),
  actor_class    TEXT NOT NULL CHECK(actor_class IN ('USER','DETERMINISTIC_POLICY')),
  payload_json   TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB)) <= 2048),
  payload_digest TEXT NOT NULL,
  reason_code    TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE(memory_id,ordinal)
);
CREATE INDEX IF NOT EXISTS ix_memory_revisions_user_memory
  ON learner_memory_revisions(user_id,memory_id,ordinal);

CREATE TABLE IF NOT EXISTS learner_memory_source_links (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id           TEXT NOT NULL REFERENCES learner_memory_records(id) ON DELETE CASCADE,
  revision_id         TEXT NOT NULL REFERENCES learner_memory_revisions(id) ON DELETE CASCADE,
  source_kind         TEXT NOT NULL CHECK(source_kind IN ('USER_ACTION','AGENT_TASK','AGENT_EXPLANATION','PUBLIC_CORPUS_ANCHOR','PERSONAL_TEXT_ANCHOR','CANONICAL_EVENT_REF')),
  relation_kind       TEXT NOT NULL CHECK(relation_kind IN ('DECLARED_AT','CONTINUES','EVIDENCED_BY','DERIVED_FROM')),
  source_ref          TEXT NOT NULL,
  source_revision_ref TEXT,
  source_authority    TEXT NOT NULL CHECK(source_authority IN ('USER_ACTION','DERIVED','PUBLIC_ASSERTED','PRIVATE_SELECTED','CANONICAL_REF')),
  anchor_json         TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(anchor_json AS BLOB)) <= 1024),
  keyed_digest        TEXT,
  source_status       TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(source_status IN ('AVAILABLE','DRIFTED','REVOKED','PURGED')),
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_memory_sources_user_memory
  ON learner_memory_source_links(user_id,memory_id,source_status);

CREATE TABLE IF NOT EXISTS memory_context_queries (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose               TEXT NOT NULL CHECK(purpose IN ('MENTOR_HOME_CONTINUE','MEMORY_MANAGEMENT_VIEW')),
  surface               TEXT NOT NULL CHECK(surface='pwa'),
  policy_version        TEXT NOT NULL,
  consent_snapshot_ref  TEXT NOT NULL,
  eligible_count        INTEGER NOT NULL CHECK(eligible_count BETWEEN 0 AND 100),
  selected_ids_json     TEXT NOT NULL DEFAULT '[]' CHECK(length(CAST(selected_ids_json AS BLOB)) <= 1024),
  exclusion_counts_json TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(exclusion_counts_json AS BLOB)) <= 2048),
  source_checks_json    TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(source_checks_json AS BLOB)) <= 1024),
  terminal_code         TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  expires_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_memory_queries_user_created
  ON memory_context_queries(user_id,created_at);
CREATE INDEX IF NOT EXISTS ix_memory_queries_expires
  ON memory_context_queries(expires_at);

-- Deliberately no FK: this content-free journal survives per-memory deletion
-- and is replayed after an old backup restore. Account deletion transfers
-- anti-resurrection authority to deletion_journal and removes these rows.
CREATE TABLE IF NOT EXISTS memory_erasure_journal (
  user_id    TEXT NOT NULL,
  memory_id  TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  PRIMARY KEY(user_id,memory_id,deleted_at)
);
CREATE INDEX IF NOT EXISTS ix_memory_erasure_user
  ON memory_erasure_journal(user_id,deleted_at);
