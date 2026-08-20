-- MASS-ACCESS I1 — dedicated public-corpus publication aggregate.
-- This domain is deliberately separate from GROUP_RESTRICTED corpora and from
-- learner truth. Drafts are mutable under optimistic versioning; editions,
-- edition items/assets, rights assertions and publication events are append-only.

CREATE TABLE IF NOT EXISTS publication_publishers (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK(role IN ('PUBLISHER')),
  status       TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  granted_by   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS published_corpora (
  corpus_id           TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE CHECK(slug GLOB '[a-z0-9-]*' AND length(slug) BETWEEN 1 AND 80),
  title               TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 500),
  description         TEXT NOT NULL DEFAULT '' CHECK(length(CAST(description AS BLOB)) <= 4000),
  status              TEXT NOT NULL CHECK(status IN ('DRAFT_ACTIVE','PUBLISHED','WITHDRAWN','ARCHIVED')),
  current_edition_id  TEXT,
  created_by          TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by          TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_corpus_publishers (
  corpus_id    TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK(role IN ('OWNER','EDITOR')),
  status       TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY(corpus_id,user_id)
);
CREATE INDEX IF NOT EXISTS ix_publication_corpus_publishers_user
  ON publication_corpus_publishers(user_id,status,corpus_id);

CREATE TABLE IF NOT EXISTS publication_drafts (
  draft_id       TEXT PRIMARY KEY,
  corpus_id      TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE CASCADE,
  draft_number   INTEGER NOT NULL CHECK(draft_number >= 1),
  version        INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  state          TEXT NOT NULL CHECK(state IN ('ACTIVE','PUBLISHED','ARCHIVED')),
  based_on_edition_id TEXT,
  created_by     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE(corpus_id,draft_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_publication_one_active_draft
  ON publication_drafts(corpus_id) WHERE state='ACTIVE';

CREATE TABLE IF NOT EXISTS publication_draft_items (
  item_id                TEXT PRIMARY KEY,
  draft_id               TEXT NOT NULL REFERENCES publication_drafts(draft_id) ON DELETE CASCADE,
  position_no            INTEGER NOT NULL CHECK(position_no >= 1),
  source_domain          TEXT NOT NULL CHECK(source_domain IN ('GROUP_CORPUS','MY_TEXTS')),
  source_corpus_id       TEXT,
  source_work_id         TEXT NOT NULL,
  source_revision        TEXT,
  source_hash            TEXT NOT NULL CHECK(source_hash GLOB '[0-9a-f]*' AND length(source_hash)=64),
  snapshot_json          TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  snapshot_sha256        TEXT NOT NULL CHECK(snapshot_sha256 GLOB '[0-9a-f]*' AND length(snapshot_sha256)=64),
  title                  TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 500),
  creator                TEXT,
  expected_audio_count   INTEGER NOT NULL DEFAULT 0 CHECK(expected_audio_count >= 0),
  validation_json        TEXT CHECK(validation_json IS NULL OR json_valid(validation_json)),
  copied_at              TEXT NOT NULL,
  validated_at           TEXT,
  UNIQUE(draft_id,source_domain,source_corpus_id,source_work_id)
);
CREATE INDEX IF NOT EXISTS ix_publication_draft_items_order
  ON publication_draft_items(draft_id,position_no,item_id);

CREATE TABLE IF NOT EXISTS publication_rights_facts (
  fact_id       TEXT PRIMARY KEY,
  item_id       TEXT NOT NULL REFERENCES publication_draft_items(item_id) ON DELETE CASCADE,
  permission    TEXT NOT NULL CHECK(permission IN ('PUBLIC_READ','PUBLIC_STREAM','PACKAGE_DOWNLOAD')),
  allowed       INTEGER NOT NULL CHECK(allowed IN (0,1)),
  basis         TEXT NOT NULL CHECK(length(basis) BETWEEN 1 AND 200),
  asserted_at   TEXT NOT NULL,
  asserted_by   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_publication_rights_latest
  ON publication_rights_facts(item_id,permission,created_at,fact_id);

CREATE TABLE IF NOT EXISTS published_corpus_editions (
  edition_id       TEXT PRIMARY KEY,
  corpus_id        TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE RESTRICT,
  edition_number   INTEGER NOT NULL CHECK(edition_number >= 1),
  source_draft_id  TEXT NOT NULL REFERENCES publication_drafts(draft_id) ON DELETE RESTRICT,
  manifest_json    TEXT NOT NULL CHECK(json_valid(manifest_json)),
  manifest_sha256  TEXT NOT NULL CHECK(manifest_sha256 GLOB '[0-9a-f]*' AND length(manifest_sha256)=64),
  item_count       INTEGER NOT NULL CHECK(item_count >= 1),
  asset_count      INTEGER NOT NULL CHECK(asset_count >= 0),
  asset_missing    INTEGER NOT NULL DEFAULT 0 CHECK(asset_missing >= 0),
  package_complete INTEGER NOT NULL CHECK(package_complete IN (0,1)),
  package_path     TEXT NOT NULL CHECK(length(package_path) BETWEEN 1 AND 700),
  package_bytes    INTEGER NOT NULL CHECK(package_bytes >= 0),
  package_sha256   TEXT NOT NULL CHECK(package_sha256 GLOB '[0-9a-f]*' AND length(package_sha256)=64),
  published_by     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at     TEXT NOT NULL,
  UNIQUE(corpus_id,edition_number),
  UNIQUE(corpus_id,manifest_sha256)
);
CREATE INDEX IF NOT EXISTS ix_published_corpus_editions_corpus
  ON published_corpus_editions(corpus_id,edition_number DESC);

CREATE TABLE IF NOT EXISTS published_corpus_edition_items (
  edition_item_id          TEXT PRIMARY KEY,
  edition_id               TEXT NOT NULL REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  source_item_id           TEXT NOT NULL,
  public_work_id           TEXT NOT NULL,
  position_no              INTEGER NOT NULL CHECK(position_no >= 1),
  title                    TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 500),
  creator                  TEXT,
  snapshot_json            TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  snapshot_sha256          TEXT NOT NULL CHECK(snapshot_sha256 GLOB '[0-9a-f]*' AND length(snapshot_sha256)=64),
  public_read_allowed      INTEGER NOT NULL CHECK(public_read_allowed IN (0,1)),
  public_stream_allowed    INTEGER NOT NULL CHECK(public_stream_allowed IN (0,1)),
  package_download_allowed INTEGER NOT NULL CHECK(package_download_allowed IN (0,1)),
  rights_basis             TEXT NOT NULL,
  rights_asserted_at       TEXT NOT NULL,
  expected_audio_count     INTEGER NOT NULL CHECK(expected_audio_count >= 0),
  included_audio_count     INTEGER NOT NULL CHECK(included_audio_count >= 0),
  asset_missing            INTEGER NOT NULL CHECK(asset_missing >= 0),
  package_complete         INTEGER NOT NULL CHECK(package_complete IN (0,1)),
  UNIQUE(edition_id,public_work_id),
  UNIQUE(edition_id,position_no)
);
CREATE INDEX IF NOT EXISTS ix_published_corpus_edition_items_order
  ON published_corpus_edition_items(edition_id,position_no,edition_item_id);

CREATE TABLE IF NOT EXISTS published_corpus_assets (
  edition_asset_id          TEXT PRIMARY KEY,
  edition_id                TEXT NOT NULL REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  edition_item_id           TEXT NOT NULL REFERENCES published_corpus_edition_items(edition_item_id) ON DELETE RESTRICT,
  asset_key                 TEXT NOT NULL CHECK(asset_key GLOB '[0-9a-f]*' AND length(asset_key)=64),
  storage_path              TEXT NOT NULL CHECK(length(storage_path) BETWEEN 1 AND 700),
  bytes                     INTEGER NOT NULL CHECK(bytes >= 0),
  sha256                    TEXT NOT NULL CHECK(sha256 GLOB '[0-9a-f]*' AND length(sha256)=64),
  mime                      TEXT NOT NULL,
  public_stream_allowed     INTEGER NOT NULL CHECK(public_stream_allowed IN (0,1)),
  package_download_allowed  INTEGER NOT NULL CHECK(package_download_allowed IN (0,1)),
  created_at                TEXT NOT NULL,
  UNIQUE(edition_id,asset_key)
);
CREATE INDEX IF NOT EXISTS ix_published_corpus_assets_item
  ON published_corpus_assets(edition_item_id,asset_key);

CREATE TABLE IF NOT EXISTS publication_events (
  event_seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         TEXT NOT NULL UNIQUE,
  corpus_id        TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE RESTRICT,
  edition_id       TEXT REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  actor_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type       TEXT NOT NULL CHECK(event_type IN ('DRAFT_CREATED','ITEMS_COPIED','RIGHTS_PRESET_APPLIED','PUBLISHED','POINTER_ROLLED_BACK','WITHDRAWN','RESTORED')),
  idempotency_key  TEXT,
  reason_code      TEXT,
  detail_json      TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  occurred_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_publication_events_corpus
  ON publication_events(corpus_id,event_seq);

CREATE TABLE IF NOT EXISTS publication_idempotency (
  actor_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation        TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  request_sha256   TEXT NOT NULL CHECK(request_sha256 GLOB '[0-9a-f]*' AND length(request_sha256)=64),
  result_json      TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at       TEXT NOT NULL,
  PRIMARY KEY(actor_user_id,operation,idempotency_key)
);

CREATE TRIGGER IF NOT EXISTS trg_published_corpora_pointer_same_corpus_insert
BEFORE INSERT ON published_corpora
WHEN NEW.current_edition_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM published_corpus_editions e
     WHERE e.edition_id=NEW.current_edition_id AND e.corpus_id=NEW.corpus_id
  ) THEN RAISE(ABORT,'PUBLICATION_POINTER_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_published_corpora_pointer_same_corpus_update
BEFORE UPDATE OF current_edition_id ON published_corpora
WHEN NEW.current_edition_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM published_corpus_editions e
     WHERE e.edition_id=NEW.current_edition_id AND e.corpus_id=NEW.corpus_id
  ) THEN RAISE(ABORT,'PUBLICATION_POINTER_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_publication_rights_facts_no_update
BEFORE UPDATE ON publication_rights_facts BEGIN SELECT RAISE(ABORT,'PUBLICATION_RIGHTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_publication_rights_facts_no_delete
BEFORE DELETE ON publication_rights_facts BEGIN SELECT RAISE(ABORT,'PUBLICATION_RIGHTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_publication_events_no_update
BEFORE UPDATE ON publication_events BEGIN SELECT RAISE(ABORT,'PUBLICATION_EVENTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_publication_events_no_delete
BEFORE DELETE ON publication_events BEGIN SELECT RAISE(ABORT,'PUBLICATION_EVENTS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_published_editions_no_update
BEFORE UPDATE ON published_corpus_editions BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_published_editions_no_delete
BEFORE DELETE ON published_corpus_editions BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_published_edition_items_no_update
BEFORE UPDATE ON published_corpus_edition_items BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_ITEM_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_published_edition_items_no_delete
BEFORE DELETE ON published_corpus_edition_items BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_ITEM_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_published_assets_no_update
BEFORE UPDATE ON published_corpus_assets BEGIN SELECT RAISE(ABORT,'PUBLICATION_ASSET_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_published_assets_no_delete
BEFORE DELETE ON published_corpus_assets BEGIN SELECT RAISE(ABORT,'PUBLICATION_ASSET_IMMUTABLE'); END;
