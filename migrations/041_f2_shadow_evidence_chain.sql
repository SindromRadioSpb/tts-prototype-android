-- Wave 2 F2 — bounded shadow evidence chain.
-- Advisory artifacts only: no trigger/FK/write into review_log, FSRS, profiles,
-- consent, learner memory, resolver truth or CP0.

CREATE TABLE IF NOT EXISTS f2_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  construct_id TEXT NOT NULL CHECK(construct_id IN ('UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION','READING_TO_NEW_CONTEXT_TRANSFER')),
  item_key TEXT NOT NULL,
  authority_class TEXT NOT NULL CHECK(authority_class IN ('CANONICAL_PATTERN','SELF_REPORTED_RETRIEVAL')),
  canonical_event_refs_json TEXT NOT NULL CHECK(length(CAST(canonical_event_refs_json AS BLOB)) <= 2048),
  source_a_json TEXT NOT NULL CHECK(length(CAST(source_a_json AS BLOB)) <= 2048),
  predicate_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ELIGIBLE','INELIGIBLE','EXPIRED','SUPPRESSED')),
  reason_code TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_observation_user_state ON f2_observations(user_id,construct_id,status,expires_at);
CREATE INDEX IF NOT EXISTS ix_f2_observation_item ON f2_observations(user_id,item_key,observed_at);

CREATE TABLE IF NOT EXISTS f2_hypotheses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  observation_id TEXT NOT NULL REFERENCES f2_observations(id) ON DELETE CASCADE,
  construct_id TEXT NOT NULL CHECK(construct_id IN ('UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION','READING_TO_NEW_CONTEXT_TRANSFER')),
  item_key TEXT NOT NULL,
  claim_code TEXT NOT NULL CHECK(claim_code IN ('H_B1_PRODUCTION_TRANSFER_UNVERIFIED','H_B2_READING_TRANSFER_UNVERIFIED')),
  confidence_band TEXT NOT NULL CHECK(confidence_band='UNVERIFIED'),
  status TEXT NOT NULL CHECK(status IN ('ELIGIBLE','OFFERED','TESTED','SUPPRESSED','EXPIRED','ANNULLED','RESOLVED_SHADOW')),
  rule_version TEXT NOT NULL,
  consent_snapshot_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_hypothesis_user_state ON f2_hypotheses(user_id,status,construct_id,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_f2_hypothesis_live ON f2_hypotheses(user_id,construct_id,item_key)
  WHERE status IN ('ELIGIBLE','OFFERED','TESTED','SUPPRESSED');

CREATE TABLE IF NOT EXISTS f2_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES f2_hypotheses(id) ON DELETE CASCADE,
  construct_id TEXT NOT NULL CHECK(construct_id IN ('UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION','READING_TO_NEW_CONTEXT_TRANSFER')),
  request_kind TEXT NOT NULL CHECK(request_kind IN ('dictate_shadow_v1','new_context_cloze_shadow_v1')),
  state TEXT NOT NULL CHECK(state IN ('PENDING','OFFERED','ACCEPTED','DEFERRED','SUBMITTED','SKIPPED','EXPIRED','ABANDONED','UNAVAILABLE','COMPLETED','SUPPRESSED','ANNULLED')),
  source_a_json TEXT NOT NULL CHECK(length(CAST(source_a_json AS BLOB)) <= 2048),
  source_b_json TEXT NOT NULL CHECK(length(CAST(source_b_json AS BLOB)) <= 2048),
  stimulus_json TEXT NOT NULL CHECK(length(CAST(stimulus_json AS BLOB)) <= 4096),
  expected_json TEXT NOT NULL CHECK(length(CAST(expected_json AS BLOB)) <= 2048),
  expected_digest TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  predicate_version TEXT NOT NULL,
  not_before TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  defer_count INTEGER NOT NULL DEFAULT 0 CHECK(defer_count BETWEEN 0 AND 2),
  offered_at TEXT,
  accepted_at TEXT,
  terminal_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_f2_request_offer ON f2_requests(user_id,state,not_before,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_f2_request_open_construct ON f2_requests(user_id,construct_id)
  WHERE state IN ('PENDING','OFFERED','ACCEPTED','DEFERRED','SUBMITTED');

CREATE TABLE IF NOT EXISTS f2_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL UNIQUE REFERENCES f2_requests(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK(state IN ('SUBMITTED','SKIPPED','DEFERRED','EXPIRED','ABANDONED','UNAVAILABLE')),
  input_mode TEXT,
  assistance_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(length(CAST(assistance_codes_json AS BLOB)) <= 512),
  answer_json TEXT CHECK(answer_json IS NULL OR length(CAST(answer_json AS BLOB)) <= 1024),
  answer_digest TEXT,
  mnar_code TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 2),
  created_at TEXT NOT NULL,
  finalized_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_attempt_user_state ON f2_attempts(user_id,state,expires_at);

CREATE TABLE IF NOT EXISTS f2_evaluations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES f2_attempts(id) ON DELETE CASCADE,
  evaluator_kind TEXT NOT NULL CHECK(evaluator_kind IN ('DETERMINISTIC_DICTATION','DETERMINISTIC_CONTEXT_CLOZE')),
  evaluator_version TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  normalizer_version TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('EXACT','BOUNDED','UNCERTAIN','ABSTAIN')),
  uncertainty_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(length(CAST(uncertainty_codes_json AS BLOB)) <= 1024),
  rationale_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(length(CAST(rationale_codes_json AS BLOB)) <= 1024),
  status TEXT NOT NULL CHECK(status IN ('VALID','DISPUTED','ANNULLED')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_evaluation_user_status ON f2_evaluations(user_id,status,expires_at);

CREATE TABLE IF NOT EXISTS f2_shadow_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES f2_hypotheses(id) ON DELETE CASCADE,
  evaluation_id TEXT NOT NULL REFERENCES f2_evaluations(id) ON DELETE CASCADE,
  decision_rule_version TEXT NOT NULL,
  decision_code TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(length(CAST(reason_codes_json AS BLOB)) <= 1024),
  status TEXT NOT NULL CHECK(status IN ('VALID','DISPUTED','ANNULLED','SUPERSEDED')),
  supersedes_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_decision_user_status ON f2_shadow_decisions(user_id,status,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_f2_decision_current ON f2_shadow_decisions(user_id,hypothesis_id)
  WHERE status IN ('VALID','DISPUTED');

CREATE TABLE IF NOT EXISTS f2_source_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('OBSERVATION','HYPOTHESIS','REQUEST','ATTEMPT','EVALUATION','DECISION')),
  artifact_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('CANONICAL_REVIEW_EVENT','PUBLIC_CORPUS_ANCHOR','AUDIO_ASSET','USER_ACTION')),
  relation_kind TEXT NOT NULL CHECK(relation_kind IN ('OBSERVED_FROM','TESTS_WITH','SUBMITTED_BY','EVALUATED_FROM','DECIDED_FROM')),
  source_ref TEXT NOT NULL,
  source_revision_ref TEXT,
  authority_class TEXT NOT NULL,
  anchor_json TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(anchor_json AS BLOB)) <= 1024),
  keyed_digest TEXT,
  source_status TEXT NOT NULL CHECK(source_status IN ('AVAILABLE','DRIFTED','REVOKED','PURGED')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_source_artifact ON f2_source_links(user_id,artifact_type,artifact_id,source_status);

CREATE TABLE IF NOT EXISTS f2_audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_class TEXT NOT NULL CHECK(actor_class IN ('USER','DETERMINISTIC_POLICY','SYSTEM_LIFECYCLE')),
  prior_revision TEXT,
  new_revision TEXT,
  reason_code TEXT,
  terminal_code TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_audit_user_created ON f2_audit_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS ix_f2_audit_expiry ON f2_audit_events(expires_at);

CREATE TABLE IF NOT EXISTS f2_context_queries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('F2_OFFER','F2_MANAGEMENT','F2_PLANNER_HANDOFF_PREVIEW')),
  surface TEXT NOT NULL CHECK(surface='pwa'),
  policy_version TEXT NOT NULL,
  consent_snapshot_ref TEXT NOT NULL,
  eligible_count INTEGER NOT NULL CHECK(eligible_count BETWEEN 0 AND 100),
  selected_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(length(CAST(selected_ids_json AS BLOB)) <= 1024),
  exclusion_counts_json TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(exclusion_counts_json AS BLOB)) <= 2048),
  terminal_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_f2_query_user_created ON f2_context_queries(user_id,created_at);
CREATE INDEX IF NOT EXISTS ix_f2_query_expiry ON f2_context_queries(expires_at);

-- Content-free tombstone survives per-chain deletion and old-backup restore.
CREATE TABLE IF NOT EXISTS f2_erasure_journal (
  user_id TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  PRIMARY KEY(user_id,chain_id,deleted_at)
);
CREATE INDEX IF NOT EXISTS ix_f2_erasure_user ON f2_erasure_journal(user_id,deleted_at);
