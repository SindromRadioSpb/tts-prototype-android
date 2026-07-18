-- AA4 slice 4b-final — review-handoff («открой мне повторение»).
-- (a) agent_connection_grants CHECK rebuild → 13 scopes (044/046 pattern; no
--     table references agent_connection_grants — verified again).
-- (b) handoff_tokens rebuild → text_key NULLABLE: an open_review token carries
--     NO anchor. Adversarial-review BLOCKER fix: the new DDL must carry ALL
--     current columns — including work_id added by migration 045 (mint INSERTs
--     an explicit list with work_id on EVERY surface; dropping it would break
--     miniapp + corpus + review mints silently) — and preserve the created_at
--     DEFAULT. COPY (not drop-empty): a token minted seconds before deploy is
--     a delivered URL in the owner's chat; copy is race-safe under SQLite
--     write serialization. No table references handoff_tokens (verified).
-- Runs inside the runner's single BEGIN IMMEDIATE (no BEGIN/COMMIT here).

CREATE TABLE agent_connection_grants_new (
  grant_id          TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL REFERENCES agent_connections(connection_id) ON DELETE CASCADE,
  scope             TEXT NOT NULL CHECK(scope IN (
                      'learning.brief.read','review.summary.read','reading.public.search',
                      'explanations.metadata.read','agent.connection.read',
                      'review.items.read','profile.read','explanations.body.read',
                      'reading.corpus.read','reading.handoff.create','intent.propose',
                      'review.activity.read','review.handoff.create')),
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

CREATE TABLE handoff_tokens_new (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_key    TEXT,
  order_index INTEGER,
  action      TEXT NOT NULL DEFAULT 'open_reader',
  work_id     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

INSERT INTO handoff_tokens_new
  (token_hash,user_id,text_key,order_index,action,work_id,created_at,expires_at,used_at)
  SELECT token_hash,user_id,text_key,order_index,action,work_id,created_at,expires_at,used_at
    FROM handoff_tokens;

DROP TABLE handoff_tokens;
ALTER TABLE handoff_tokens_new RENAME TO handoff_tokens;
