-- AA3 commit 3c — propose-then-confirm (W1) + corpus handoff work_id.
--
-- 1) handoff_tokens.work_id: a corpus handoff must carry the public catalog
--    work id so library-ui can open the work via openCorpusWork (the personal
--    OPFS 'texts' lookup cannot resolve a not-yet-materialized corpus work).
--    Nullable: personal open_reader tokens (miniapp path) keep NULL.
ALTER TABLE handoff_tokens ADD COLUMN work_id TEXT;

-- 2) agent_proposals: PENDING proposals from the external agent (Hermes) that
--    ONLY the owner can confirm/deny in the first-party panel. This store is
--    advisory and terminal: it never owns review_log, FSRS, grading, word_status
--    or any learning truth, and its rows are never re-served as mentor content
--    (R17 fence). Adversarial-review decisions baked in:
--    - oauth_client_id/connection_id NOT NULL + composite FK (R15: connection
--      delete + restore-erasure-replay must cascade agent-authored payloads);
--    - authority is explicit, and owner confirm relabels to
--      USER_CONFIRMED_AGENT_ASSERTED — never to a user-authored class (R9);
--    - dedupe unique index is per (user_id,connection_id) and PENDING-only
--      (R14/R17: no cross-connection id leak; server derives dedupe_key);
--    - display_title resolved once at create time (R14: no sync-IO fan-out on
--      owner GET);
--    - decided_at drives retention (agent/access/proposalPolicy.js: DENIED and
--      EXPIRED purge after 90d, CONFIRMED payload blanks after 180d, skeleton
--      purges after 365d — consent presentation mirrors these bounds).
CREATE TABLE IF NOT EXISTS agent_proposals (
  proposal_id     TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_client_id TEXT NOT NULL,
  connection_id   TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK(kind IN ('open_reading','note','suggestion')),
  payload_json    TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB)) <= 4096),
  display_title   TEXT CHECK(display_title IS NULL OR length(CAST(display_title AS BLOB)) <= 220),
  authority       TEXT NOT NULL CHECK(authority IN ('AGENT_ASSERTED','USER_CONFIRMED_AGENT_ASSERTED')),
  dedupe_key      TEXT,
  status          TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','DENIED','EXPIRED')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  decided_at      TEXT,
  FOREIGN KEY(connection_id,user_id,oauth_client_id)
    REFERENCES agent_connections(connection_id,user_id,oauth_client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_agent_proposals_user_status
  ON agent_proposals(user_id,status,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_proposals_pending_dedupe
  ON agent_proposals(user_id,connection_id,dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status='PENDING';
