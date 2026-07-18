-- Agent Access AA3 slice-1: widen the granted-scope allowlist.
-- SQLite cannot ALTER a CHECK constraint, so agent_connection_grants is
-- rebuilt (shadow table with the widened CHECK -> copy -> drop -> rename ->
-- recreate index). No table references agent_connection_grants, so no
-- PRAGMA foreign_keys toggle is required; the outgoing FKs are re-satisfied
-- by copying already-valid rows. Runs inside the migration runner's single
-- BEGIN IMMEDIATE (no BEGIN/COMMIT here).

CREATE TABLE agent_connection_grants_new (
  grant_id          TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL REFERENCES agent_connections(connection_id) ON DELETE CASCADE,
  scope             TEXT NOT NULL CHECK(scope IN (
                      'learning.brief.read','review.summary.read','reading.public.search',
                      'explanations.metadata.read','agent.connection.read',
                      'review.items.read','profile.read','explanations.body.read',
                      'reading.corpus.read','reading.handoff.create','intent.propose')),
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
