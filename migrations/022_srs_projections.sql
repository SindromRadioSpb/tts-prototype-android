-- 022_srs_projections — CLG-P4 Server-side FSRS replay projections (AI_MENTOR_RECON §9 CLG-P4).
-- DERIVED cache, rebuildable at any time: state = fold of the user's review_log via the SAME
-- fsrs-core.js the browser runs (Node-requirable UMD; §1.3-2). Canon transition (§4.6): after
-- the CLG-P4 oracle passes, the SERVER copy of projections becomes canonical for cloud clients
-- (agent/push/Mini App); the browser's word_status.srs_* stays a local replica derived from the
-- LOCAL log replica (§4.3 ownership rule — server projections are never pushed down to OPFS).
CREATE TABLE IF NOT EXISTS srs_projections (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key     TEXT NOT NULL,
  due          TEXT,                    -- ISO UTC; product dueAt(state)
  interval_days REAL NOT NULL DEFAULT 0,
  reps         INTEGER NOT NULL DEFAULT 0,
  lapses       INTEGER NOT NULL DEFAULT 0,
  stability    REAL,
  difficulty   REAL,
  reviewed_at  TEXT,                    -- last graded review (учебное время)
  scheme       TEXT NOT NULL DEFAULT 'fsrs',
  engine       TEXT,                    -- FsrsCore.ENGINE_VERSION at compute time
  computed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, item_key)
);
CREATE INDEX IF NOT EXISTS ix_srs_proj_user_due ON srs_projections(user_id, due);
