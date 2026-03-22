-- 014_srs_attempts.sql
-- PATCH-06: trainer attempts / answer checking log

CREATE TABLE IF NOT EXISTS srs_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NULL REFERENCES srs_session_runs(id) ON DELETE SET NULL,
  card_id TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL, -- typing | listening | cloze
  user_answer TEXT,
  normalized_answer TEXT,
  normalized_expected TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS ix_srs_attempts_card ON srs_attempts(card_id);
CREATE INDEX IF NOT EXISTS ix_srs_attempts_session ON srs_attempts(session_id);
CREATE INDEX IF NOT EXISTS ix_srs_attempts_type ON srs_attempts(attempt_type);
CREATE INDEX IF NOT EXISTS ix_srs_attempts_created ON srs_attempts(created_at);
