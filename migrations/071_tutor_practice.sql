-- M2 source-recall practice is advisory. It never writes review_log/FSRS/mastery.
CREATE TABLE IF NOT EXISTS tutor_practice (
 session_id TEXT PRIMARY KEY REFERENCES tutor_sessions(id) ON DELETE CASCADE,
 challenge_json TEXT NOT NULL,
 hint_seen INTEGER NOT NULL DEFAULT 0,
 attempt_key TEXT,
 attempt_hash TEXT,
 receipt_json TEXT
);
