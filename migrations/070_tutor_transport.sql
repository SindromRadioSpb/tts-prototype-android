-- M1: isolated BYOA transport. No learning state, grades or provider credentials.
CREATE TABLE IF NOT EXISTS tutor_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  consent_revision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tutor_pairings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tutor_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES tutor_connections(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  context_json TEXT NOT NULL,
  question TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','completed','cancelled','failed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_hash TEXT,
  lease_until INTEGER,
  run_deadline INTEGER,
  result_json TEXT,
  result_hash TEXT,
  error_code TEXT,
  UNIQUE(user_id, request_key)
);
CREATE INDEX IF NOT EXISTS tutor_session_queue ON tutor_sessions(connection_id,state,created_at);
CREATE INDEX IF NOT EXISTS tutor_session_expiry ON tutor_sessions(expires_at);
