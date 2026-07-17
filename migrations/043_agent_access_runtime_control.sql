-- Agent Access AA2-CP1: runtime control plane journal.
-- Append-only owner-action log for the two window flags (clients/mcp) and
-- static-client status transitions. Current state = latest event per subject;
-- no projection table, no dual-write. A restore appends RESTORE_FAIL_CLOSED
-- rows instead of trusting rolled-back state.

CREATE TABLE IF NOT EXISTS agent_access_control_events (
  event_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL,
  actor_user_id TEXT NOT NULL CHECK(length(actor_user_id) BETWEEN 1 AND 128),
  action        TEXT NOT NULL CHECK(action IN ('FLAG_SET','CLIENT_STATUS_SET','WINDOW_OPEN','WINDOW_CLOSE','RESTORE_FAIL_CLOSED')),
  subject       TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 128),
  value         TEXT NOT NULL CHECK(value IN ('0','1','ACTIVE','SUSPENDED')),
  expires_at    TEXT CHECK(expires_at IS NULL OR (length(expires_at) BETWEEN 20 AND 30 AND expires_at LIKE '____-__-__T__:__:__%Z')),
  reason        TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 240)
);

CREATE INDEX IF NOT EXISTS ix_aa_control_events_subject
  ON agent_access_control_events(subject, event_id DESC);
