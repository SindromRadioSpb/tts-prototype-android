-- PHYSICS-SOLUTION-DOCUMENTS-R2 — bounded immutable task resources.
-- Separate aggregate from public-corpus editions, learner truth, groups and UGC.

CREATE TABLE IF NOT EXISTS physics_task_resources (
  resource_id          TEXT PRIMARY KEY,
  corpus_id            TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE RESTRICT,
  public_work_id       TEXT NOT NULL,
  logical_key          TEXT NOT NULL CHECK(logical_key GLOB '[a-z0-9-]*' AND length(logical_key) BETWEEN 1 AND 80),
  status               TEXT NOT NULL CHECK(status IN ('PUBLISHED','WITHDRAWN','ARCHIVED')),
  current_revision_id  TEXT REFERENCES physics_task_resource_revisions(revision_id) ON DELETE RESTRICT,
  created_by           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE(corpus_id,public_work_id,logical_key)
);
CREATE INDEX IF NOT EXISTS ix_physics_task_resources_work
  ON physics_task_resources(corpus_id,public_work_id,status,resource_id);

CREATE TABLE IF NOT EXISTS physics_task_resource_revisions (
  revision_id          TEXT PRIMARY KEY,
  resource_id          TEXT NOT NULL REFERENCES physics_task_resources(resource_id) ON DELETE RESTRICT,
  revision_no          INTEGER NOT NULL CHECK(revision_no >= 1),
  edition_id           TEXT NOT NULL REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  edition_item_id      TEXT NOT NULL REFERENCES published_corpus_edition_items(edition_item_id) ON DELETE RESTRICT,
  public_work_id       TEXT NOT NULL,
  work_snapshot_sha256 TEXT NOT NULL CHECK(work_snapshot_sha256 GLOB '[0-9a-f]*' AND length(work_snapshot_sha256)=64),
  resource_kind        TEXT NOT NULL CHECK(resource_kind IN ('PDF','EXTERNAL_LINK')),
  content_kind         TEXT NOT NULL CHECK(content_kind IN ('CONDITION_ONLY','CONDITION_AND_SOLUTION','SOLUTION_ONLY','SUPPLEMENT')),
  title                TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 500),
  language             TEXT NOT NULL CHECK(language IN ('HE','RU','EN','MULTI','UND')),
  storage_path         TEXT CHECK(storage_path IS NULL OR length(storage_path) BETWEEN 1 AND 700),
  external_url         TEXT CHECK(external_url IS NULL OR length(external_url) BETWEEN 1 AND 2000),
  bytes                INTEGER CHECK(bytes IS NULL OR bytes BETWEEN 1 AND 26214400),
  sha256               TEXT CHECK(sha256 IS NULL OR (sha256 GLOB '[0-9a-f]*' AND length(sha256)=64)),
  mime                 TEXT,
  quality_status       TEXT NOT NULL CHECK(quality_status IN ('ORIGINAL','QUALITY_LIMITED','VERIFIED_DERIVATIVE')),
  provenance_json      TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance_json)),
  created_by           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at           TEXT NOT NULL,
  UNIQUE(resource_id,revision_no),
  UNIQUE(resource_id,sha256),
  CHECK((resource_kind='PDF' AND storage_path IS NOT NULL AND external_url IS NULL AND bytes IS NOT NULL AND sha256 IS NOT NULL AND mime='application/pdf')
     OR (resource_kind='EXTERNAL_LINK' AND storage_path IS NULL AND external_url IS NOT NULL AND bytes IS NULL AND sha256 IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_physics_task_resource_revisions_anchor
  ON physics_task_resource_revisions(edition_id,public_work_id,work_snapshot_sha256,revision_id);

CREATE TABLE IF NOT EXISTS physics_task_resource_rights_facts (
  fact_id       TEXT PRIMARY KEY,
  revision_id   TEXT NOT NULL REFERENCES physics_task_resource_revisions(revision_id) ON DELETE RESTRICT,
  permission    TEXT NOT NULL CHECK(permission IN ('PUBLIC_READ','AGENT_READ')),
  allowed       INTEGER NOT NULL CHECK(allowed IN (0,1)),
  basis         TEXT NOT NULL CHECK(length(basis) BETWEEN 1 AND 200),
  asserted_at   TEXT NOT NULL,
  asserted_by   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_physics_task_resource_rights_latest
  ON physics_task_resource_rights_facts(revision_id,permission,created_at,fact_id);

CREATE TABLE IF NOT EXISTS physics_task_resource_events (
  event_seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         TEXT NOT NULL UNIQUE,
  resource_id      TEXT NOT NULL REFERENCES physics_task_resources(resource_id) ON DELETE RESTRICT,
  revision_id      TEXT REFERENCES physics_task_resource_revisions(revision_id) ON DELETE RESTRICT,
  actor_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type       TEXT NOT NULL CHECK(event_type IN ('PUBLISHED','WITHDRAWN','RESTORED')),
  idempotency_key  TEXT,
  reason_code      TEXT,
  detail_json      TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  occurred_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_physics_task_resource_events_resource
  ON physics_task_resource_events(resource_id,event_seq);

CREATE TABLE IF NOT EXISTS physics_task_resource_idempotency (
  actor_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation        TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  request_sha256   TEXT NOT NULL CHECK(request_sha256 GLOB '[0-9a-f]*' AND length(request_sha256)=64),
  result_json      TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at       TEXT NOT NULL,
  PRIMARY KEY(actor_user_id,operation,idempotency_key)
);

CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_pointer_insert
BEFORE INSERT ON physics_task_resources
WHEN NEW.current_revision_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'PHYSICS_RESOURCE_POINTER_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_pointer_update
BEFORE UPDATE OF current_revision_id ON physics_task_resources
WHEN NEW.current_revision_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM physics_task_resource_revisions r
     WHERE r.revision_id=NEW.current_revision_id AND r.resource_id=NEW.resource_id
  ) THEN RAISE(ABORT,'PHYSICS_RESOURCE_POINTER_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_revisions_no_update
BEFORE UPDATE ON physics_task_resource_revisions BEGIN SELECT RAISE(ABORT,'PHYSICS_RESOURCE_REVISION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_revisions_no_delete
BEFORE DELETE ON physics_task_resource_revisions BEGIN SELECT RAISE(ABORT,'PHYSICS_RESOURCE_REVISION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_rights_no_update
BEFORE UPDATE ON physics_task_resource_rights_facts BEGIN SELECT RAISE(ABORT,'PHYSICS_RESOURCE_RIGHTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_rights_no_delete
BEFORE DELETE ON physics_task_resource_rights_facts BEGIN SELECT RAISE(ABORT,'PHYSICS_RESOURCE_RIGHTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_events_no_update
BEFORE UPDATE ON physics_task_resource_events BEGIN SELECT RAISE(ABORT,'PHYSICS_RESOURCE_EVENTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_physics_task_resource_events_no_delete
BEFORE DELETE ON physics_task_resource_events BEGIN SELECT RAISE(ABORT,'PHYSICS_RESOURCE_EVENTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_physics_task_resources_no_delete
BEFORE DELETE ON physics_task_resources BEGIN SELECT RAISE(ABORT,'PHYSICS_RESOURCE_DELETE_FORBIDDEN'); END;
