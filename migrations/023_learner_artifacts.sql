-- 023_learner_artifacts — CLG-P5.5 Artifact Sync, класс B (AI_MENTOR_RECON §5/§9 CLG-P5.5).
-- OPAQUE per-text bundle store: the client ships each OWN text («Мои тексты», non-corpus) as the
-- SAME battle-tested bundle JSON exportBundle({textIds}) produces, and other devices merge it via
-- importBundle — the server never parses learner content, it stores class-B blobs under the
-- owner's explicit consent (consent_records key 'cloud_texts'; §5: класс B — только при
-- включённом переключателе). LWW by the text's updated_at. Covered by the dynamic user_id
-- export/delete sweep automatically (§10 completeness invariant).
CREATE TABLE IF NOT EXISTS learner_artifacts (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'text_bundle',
  artifact_key TEXT NOT NULL,            -- text_key
  updated_at   TEXT NOT NULL,            -- the TEXT's updated_at (LWW; учебное время артефакта)
  payload_json TEXT NOT NULL,
  device_id    TEXT,
  ingested_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, kind, artifact_key)
);
CREATE INDEX IF NOT EXISTS ix_learner_artifacts_user ON learner_artifacts(user_id, kind, updated_at);
