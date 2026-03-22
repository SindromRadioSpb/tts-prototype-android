-- 011_srs_sessions.sql
-- PATCH-04: SRS trainer sessions

CREATE TABLE IF NOT EXISTS srs_session_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active', -- active, finished, abandoned
  mode TEXT NOT NULL DEFAULT 'today',
  source TEXT,

  queue_json TEXT NOT NULL DEFAULT '[]',
  current_index INTEGER NOT NULL DEFAULT 0,
  cards_total INTEGER NOT NULL DEFAULT 0,
  cards_seen INTEGER NOT NULL DEFAULT 0,
  reviews_done INTEGER NOT NULL DEFAULT 0,
  stats_json TEXT NOT NULL DEFAULT '{}',

  started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_srs_session_runs_status ON srs_session_runs(status);
CREATE INDEX IF NOT EXISTS ix_srs_session_runs_started_at ON srs_session_runs(started_at);
