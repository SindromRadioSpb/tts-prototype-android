-- Wave 2 S3 CP0 — bounded, content-free observe-only records.
-- Detail rows are user-scoped so identityRepo dynamic export/delete covers them.
-- Boot rows contain process-level counters only and never carry user/domain IDs.
CREATE TABLE IF NOT EXISTS cp0_observations (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id                  TEXT NOT NULL,
  request_id              TEXT NOT NULL,
  parent_run_id           TEXT,
  process_boot_id         TEXT NOT NULL,
  sequence                INTEGER NOT NULL CHECK(sequence >= 0),
  record_kind             TEXT NOT NULL CHECK(record_kind IN ('RUN_STARTED','RUN_TERMINAL')),
  role_id                 TEXT NOT NULL,
  scenario_id             TEXT NOT NULL,
  surface                 TEXT NOT NULL,
  workflow_version        TEXT NOT NULL,
  role_registry_version   TEXT NOT NULL,
  observer_schema_version TEXT NOT NULL,
  terminal_status         TEXT,
  live_outcome_code       TEXT,
  shadow_decision         TEXT,
  manifest_json           TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(manifest_json AS BLOB)) <= 3072),
  latency_bucket_ms       INTEGER,
  created_at              TEXT NOT NULL,
  expires_at              TEXT NOT NULL,
  UNIQUE(run_id, record_kind)
);

CREATE INDEX IF NOT EXISTS ix_cp0_observations_user_created
  ON cp0_observations(user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_cp0_observations_expires
  ON cp0_observations(expires_at);
CREATE INDEX IF NOT EXISTS ix_cp0_observations_boot_sequence
  ON cp0_observations(process_boot_id, sequence);

CREATE TABLE IF NOT EXISTS cp0_observer_boots (
  process_boot_id         TEXT PRIMARY KEY,
  observer_schema_version TEXT NOT NULL,
  started_at              TEXT NOT NULL,
  last_checkpoint_at      TEXT NOT NULL,
  finished_at             TEXT,
  clean_shutdown          INTEGER NOT NULL DEFAULT 0 CHECK(clean_shutdown IN (0,1)),
  eligible_runs_total     INTEGER NOT NULL DEFAULT 0,
  start_enqueued_total    INTEGER NOT NULL DEFAULT 0,
  start_persisted_total   INTEGER NOT NULL DEFAULT 0,
  terminal_expected_total INTEGER NOT NULL DEFAULT 0,
  terminal_enqueued_total INTEGER NOT NULL DEFAULT 0,
  terminal_persisted_total INTEGER NOT NULL DEFAULT 0,
  dropped_total           INTEGER NOT NULL DEFAULT 0,
  rejected_total          INTEGER NOT NULL DEFAULT 0,
  circuit_open_total      INTEGER NOT NULL DEFAULT 0,
  counters_json           TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(counters_json AS BLOB)) <= 8192),
  expires_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_cp0_observer_boots_expires
  ON cp0_observer_boots(expires_at);
