-- Link bounded follow-up turns without changing the existing session/result contract.
ALTER TABLE tutor_sessions ADD COLUMN previous_session_id TEXT REFERENCES tutor_sessions(id) ON DELETE SET NULL;
ALTER TABLE tutor_sessions ADD COLUMN local_history_json TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS tutor_session_previous ON tutor_sessions(previous_session_id);
