-- H2.1 get_word_morphology — widen agent_connection_grants CHECK from 15 to 16
-- scopes by adding morphology.read. Owner explicitly approved this correction
-- to the original no-migration rollback assumption on 2026-07-23.
-- Pattern: 049 shadow table -> lossless copy -> drop -> rename -> recreate index.
-- The wider CHECK is rollback-compatible with an older server (a strict superset).
-- Runs inside the migration runner transaction; no BEGIN/COMMIT here.

CREATE TABLE agent_connection_grants_new (
  grant_id          TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL REFERENCES agent_connections(connection_id) ON DELETE CASCADE,
  scope             TEXT NOT NULL CHECK(scope IN (
                      'learning.brief.read','review.summary.read','reading.public.search',
                      'explanations.metadata.read','agent.connection.read',
                      'review.items.read','profile.read','explanations.body.read',
                      'reading.corpus.read','reading.handoff.create','intent.propose',
                      'review.activity.read','review.handoff.create',
                      'personal.texts.metadata.read','personal.texts.content.read',
                      'morphology.read')),
  status            TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  consent_record_id TEXT NOT NULL REFERENCES consent_records(id),
  consent_version   TEXT NOT NULL CHECK(length(consent_version) BETWEEN 1 AND 64),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  revoked_at        TEXT,
  UNIQUE(connection_id,scope)
);

INSERT INTO agent_connection_grants_new
  (grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at,revoked_at)
  SELECT grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at,revoked_at
    FROM agent_connection_grants;

DROP TABLE agent_connection_grants;
ALTER TABLE agent_connection_grants_new RENAME TO agent_connection_grants;

CREATE INDEX IF NOT EXISTS ix_agent_grants_user_connection ON agent_connection_grants(user_id,connection_id,status);
