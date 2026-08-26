-- All-Corpora Agent Access MCP R: additive publication-local rights and scopes.
-- Public publication rights do not imply agent rights. Facts are edition-pinned,
-- append-only and absent means deny. The migration runner owns the transaction.

DROP INDEX IF EXISTS ix_agent_grants_user_connection;
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
INSERT INTO agent_connection_grants_new
  SELECT grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at,revoked_at
    FROM agent_connection_grants;
DROP TABLE agent_connection_grants;
ALTER TABLE agent_connection_grants_new RENAME TO agent_connection_grants;
CREATE INDEX ix_agent_grants_user_connection ON agent_connection_grants(user_id,connection_id,status);

CREATE TABLE published_corpus_agent_rights_facts (
  fact_seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_id        TEXT NOT NULL UNIQUE,
  edition_id     TEXT NOT NULL REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  target_kind    TEXT NOT NULL CHECK(target_kind IN ('EDITION_ITEM','EDITION_ASSET','PACKAGE')),
  target_id      TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 160),
  use_class      TEXT NOT NULL CHECK(use_class IN ('DISCOVER','SOURCE_TEXT','SOURCE_BINARY','DERIVATIVE_TEXT')),
  allowed        INTEGER NOT NULL CHECK(allowed IN (0,1)),
  basis          TEXT NOT NULL CHECK(length(CAST(basis AS BLOB)) BETWEEN 1 AND 500),
  asserted_at    TEXT NOT NULL CHECK(length(asserted_at) BETWEEN 10 AND 40),
  asserted_by    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TEXT NOT NULL
);
CREATE INDEX ix_published_agent_rights_latest
  ON published_corpus_agent_rights_facts(edition_id,target_kind,target_id,use_class,fact_seq);

CREATE TABLE publication_agent_rights_events (
  event_seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         TEXT NOT NULL UNIQUE,
  edition_id       TEXT NOT NULL REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  actor_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type       TEXT NOT NULL CHECK(event_type IN ('RIGHTS_FACTS_ASSERTED')),
  idempotency_key  TEXT NOT NULL,
  fact_count       INTEGER NOT NULL CHECK(fact_count BETWEEN 1 AND 500),
  detail_json      TEXT NOT NULL CHECK(json_valid(detail_json) AND length(CAST(detail_json AS BLOB)) <= 4096),
  occurred_at      TEXT NOT NULL
);
CREATE INDEX ix_publication_agent_rights_events_edition
  ON publication_agent_rights_events(edition_id,event_seq);

CREATE TABLE publication_agent_rights_idempotency (
  actor_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation        TEXT NOT NULL CHECK(operation='APPLY_FACTS'),
  idempotency_key  TEXT NOT NULL,
  request_sha256   TEXT NOT NULL CHECK(request_sha256 GLOB '[0-9a-f]*' AND length(request_sha256)=64),
  result_json      TEXT NOT NULL CHECK(json_valid(result_json) AND length(CAST(result_json AS BLOB)) <= 8192),
  created_at       TEXT NOT NULL,
  PRIMARY KEY(actor_user_id,operation,idempotency_key)
);

CREATE TRIGGER trg_published_agent_rights_target_valid
BEFORE INSERT ON published_corpus_agent_rights_facts
BEGIN
  SELECT CASE
    WHEN NEW.target_kind='EDITION_ITEM' AND NOT EXISTS (
      SELECT 1 FROM published_corpus_edition_items i
       WHERE i.edition_item_id=NEW.target_id AND i.edition_id=NEW.edition_id
    ) THEN RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_TARGET_INVALID')
    WHEN NEW.target_kind='EDITION_ASSET' AND NOT EXISTS (
      SELECT 1 FROM published_corpus_assets a
       WHERE a.edition_asset_id=NEW.target_id AND a.edition_id=NEW.edition_id
    ) THEN RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_TARGET_INVALID')
    WHEN NEW.target_kind='PACKAGE' AND NEW.target_id<>NEW.edition_id
      THEN RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_TARGET_INVALID')
    WHEN NEW.target_kind='EDITION_ASSET' AND NEW.use_class<>'SOURCE_BINARY'
      THEN RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_USE_CLASS_INVALID')
    WHEN NEW.target_kind='PACKAGE' AND NEW.use_class<>'SOURCE_BINARY'
      THEN RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_USE_CLASS_INVALID')
  END;
END;

CREATE TRIGGER trg_published_agent_rights_no_update
BEFORE UPDATE ON published_corpus_agent_rights_facts BEGIN SELECT RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_APPEND_ONLY'); END;
CREATE TRIGGER trg_published_agent_rights_no_delete
BEFORE DELETE ON published_corpus_agent_rights_facts BEGIN SELECT RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_APPEND_ONLY'); END;
CREATE TRIGGER trg_publication_agent_rights_events_no_update
BEFORE UPDATE ON publication_agent_rights_events BEGIN SELECT RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_EVENTS_APPEND_ONLY'); END;
CREATE TRIGGER trg_publication_agent_rights_events_no_delete
BEFORE DELETE ON publication_agent_rights_events BEGIN SELECT RAISE(ABORT,'PUBLICATION_AGENT_RIGHTS_EVENTS_APPEND_ONLY'); END;
