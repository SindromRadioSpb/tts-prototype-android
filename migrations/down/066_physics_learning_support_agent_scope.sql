-- Rehearsal-only rollback. Never discard a consented derivative-text grant.
CREATE TEMP TABLE physics_learning_support_scope_down_guard(value INTEGER NOT NULL CHECK(value=0));
INSERT INTO physics_learning_support_scope_down_guard
  SELECT COUNT(*) FROM agent_connection_grants WHERE scope='reading.publication.derivative.read';
DROP TABLE physics_learning_support_scope_down_guard;

DROP INDEX IF EXISTS ix_agent_grants_user_connection;
CREATE TABLE agent_connection_grants_old (
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
                      'intent.goal.propose','goal.read',
                      'reading.publication.catalog.read','reading.publication.item.read',
                      'reading.publication.resource.read')),
  status            TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  consent_record_id TEXT NOT NULL REFERENCES consent_records(id),
  consent_version   TEXT NOT NULL CHECK(length(consent_version) BETWEEN 1 AND 64),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  revoked_at        TEXT,
  UNIQUE(connection_id,scope)
);
INSERT INTO agent_connection_grants_old
  SELECT grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at,revoked_at
    FROM agent_connection_grants;
DROP TABLE agent_connection_grants;
ALTER TABLE agent_connection_grants_old RENAME TO agent_connection_grants;
CREATE INDEX ix_agent_grants_user_connection ON agent_connection_grants(user_id,connection_id,status);
