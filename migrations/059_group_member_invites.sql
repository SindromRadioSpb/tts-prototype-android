-- One-time passwordless access links for restricted reading groups.
-- The bearer secret is never stored: only SHA-256(token) reaches SQLite.
-- JOIN creates a new member; LOGIN opens another session for the same member.

CREATE TABLE IF NOT EXISTS group_access_invites (
  invite_id          TEXT PRIMARY KEY,
  group_id           TEXT NOT NULL REFERENCES reading_groups(group_id) ON DELETE CASCADE,
  corpus_id          TEXT NOT NULL REFERENCES group_corpora(corpus_id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK(kind IN ('JOIN','LOGIN')),
  target_user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash         TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  status             TEXT NOT NULL CHECK(status IN ('ACTIVE','USED','REVOKED')),
  expires_at         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  used_at            TEXT,
  used_by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at         TEXT,
  CHECK((kind='JOIN' AND target_user_id IS NULL) OR (kind='LOGIN' AND target_user_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ix_group_access_invites_group
  ON group_access_invites(group_id,status,expires_at);
CREATE INDEX IF NOT EXISTS ix_group_access_invites_target
  ON group_access_invites(target_user_id,status,expires_at);
