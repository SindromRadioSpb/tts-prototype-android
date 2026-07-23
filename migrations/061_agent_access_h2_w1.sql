-- H2.3 W1 family. Owner-approved correction (2026-07-23): import/track
-- proposals execute in the first-party browser against OPFS through a
-- single-use server ticket; a proposal becomes CONFIRMED only after receipt.
-- Goals remain server-authoritative. Migration runner owns the transaction.

CREATE TABLE agent_proposals_new (
  proposal_id     TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_client_id TEXT NOT NULL,
  connection_id   TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK(kind IN (
                    'open_reading','note','suggestion',
                    'import_text','track_word','goal')),
  payload_json    TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB)) <= 16384),
  display_title   TEXT CHECK(display_title IS NULL OR length(CAST(display_title AS BLOB)) <= 220),
  authority       TEXT NOT NULL CHECK(authority IN ('AGENT_ASSERTED','USER_CONFIRMED_AGENT_ASSERTED')),
  dedupe_key      TEXT,
  status          TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','DENIED','REJECTED','EXPIRED')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  decided_at      TEXT,
  FOREIGN KEY(connection_id,user_id,oauth_client_id)
    REFERENCES agent_connections(connection_id,user_id,oauth_client_id) ON DELETE CASCADE
);

INSERT INTO agent_proposals_new
  (proposal_id,user_id,oauth_client_id,connection_id,kind,payload_json,display_title,
   authority,dedupe_key,status,created_at,updated_at,expires_at,decided_at)
  SELECT proposal_id,user_id,oauth_client_id,connection_id,kind,payload_json,display_title,
         authority,dedupe_key,status,created_at,updated_at,expires_at,decided_at
    FROM agent_proposals;

DROP TABLE agent_proposals;
ALTER TABLE agent_proposals_new RENAME TO agent_proposals;
CREATE INDEX ix_agent_proposals_user_status
  ON agent_proposals(user_id,status,expires_at);
CREATE UNIQUE INDEX ux_agent_proposals_pending_dedupe
  ON agent_proposals(user_id,connection_id,dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status='PENDING';

CREATE TABLE weekly_goals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start    TEXT NOT NULL,
  period_days   INTEGER NOT NULL CHECK(period_days BETWEEN 7 AND 14),
  statement     TEXT NOT NULL CHECK(length(CAST(statement AS BLOB)) BETWEEN 1 AND 280),
  goal_type     TEXT NOT NULL CHECK(goal_type IN ('PROCESS','OUTCOME')),
  anchor        TEXT CHECK(anchor IS NULL OR length(CAST(anchor AS BLOB)) <= 280),
  source        TEXT NOT NULL CHECK(source IN ('OWNER','AGENT_PROPOSED_OWNER_CONFIRMED')),
  proposal_id   TEXT UNIQUE REFERENCES agent_proposals(proposal_id) ON DELETE SET NULL,
  status        TEXT NOT NULL CHECK(status IN ('ACTIVE','COMPLETED_SELF_REPORT','DROPPED')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  closed_at     TEXT
);
CREATE INDEX ix_weekly_goals_user_status ON weekly_goals(user_id,status,created_at DESC);
CREATE UNIQUE INDEX ux_weekly_goals_one_active ON weekly_goals(user_id) WHERE status='ACTIVE';

CREATE TABLE agent_proposal_execution_tickets (
  proposal_id       TEXT NOT NULL REFERENCES agent_proposals(proposal_id) ON DELETE CASCADE,
  item_index        INTEGER NOT NULL CHECK(item_index BETWEEN 0 AND 9),
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  action_digest     TEXT NOT NULL CHECK(length(action_digest)=64),
  issued_at         TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  consumed_at       TEXT,
  receipt_json      TEXT CHECK(receipt_json IS NULL OR length(CAST(receipt_json AS BLOB)) <= 2048),
  PRIMARY KEY(proposal_id,item_index)
);
CREATE INDEX ix_agent_proposal_tickets_user ON agent_proposal_execution_tickets(user_id,expires_at);

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
                      'morphology.read','learner.coverage.read',
                      'reading.group_corpus.read','learner.group_coverage.read',
                      'intent.import_text.propose','intent.track_word.propose',
                      'intent.goal.propose','goal.read')),
  status            TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  consent_record_id TEXT NOT NULL REFERENCES consent_records(id),
  consent_version   TEXT NOT NULL CHECK(length(consent_version) BETWEEN 1 AND 64),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  revoked_at        TEXT,
  UNIQUE(connection_id,scope)
);
INSERT INTO agent_connection_grants_new
  SELECT grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at,revoked_at
    FROM agent_connection_grants;
DROP TABLE agent_connection_grants;
ALTER TABLE agent_connection_grants_new RENAME TO agent_connection_grants;
CREATE INDEX ix_agent_grants_user_connection ON agent_connection_grants(user_id,connection_id,status);
