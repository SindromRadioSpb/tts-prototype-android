-- CLG-P8.1 — scoped Telegram Mini App session (TELEGRAM_MINI_APP_P8_1_SPEC_2026_07_09.md §1).
-- Additive only (no table rebuild): the agent_challenges.surface generalization is deferred to
-- 035 at P8.3 (that one needs a rebuild for nullable telegram_chat_id). The runner wraps this file
-- in its own transaction; do NOT add explicit transaction statements here.

-- One user_sessions table, fixed session_kind enum (validated in code, not a CHECK, to stay additive
-- and future-proof: pwa | telegram_miniapp | future_mobile | future_teacher). Existing rows default
-- to 'pwa' so the PWA path is unchanged; validateSession additionally rejects non-'pwa' kinds.
ALTER TABLE user_sessions ADD COLUMN session_kind         TEXT NOT NULL DEFAULT 'pwa';
ALTER TABLE user_sessions ADD COLUMN auth_method          TEXT;                      -- 'password_bootstrap' | 'telegram_init_data'
ALTER TABLE user_sessions ADD COLUMN channel_link_id      TEXT;                      -- plain ref (validated live), no FK on ADD COLUMN
ALTER TABLE user_sessions ADD COLUMN auth_context_version INTEGER NOT NULL DEFAULT 0;-- snapshot at mint
ALTER TABLE user_sessions ADD COLUMN absolute_expires_at  TEXT;                      -- hard cap; NULL = none (PWA). expires_at = idle.

-- Per-user current auth-context version. Bumped by unlink / consent revoke / consent-version bump /
-- channel-link deactivation / security logout / account delete → all sessions whose snapshot differs
-- become invalid on next request WITHOUT a physical row sweep (structural revoke).
ALTER TABLE users ADD COLUMN auth_context_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_user_sessions_kind ON user_sessions(user_id, session_kind);

-- Short-TTL replay ledger. Stores sha256 of the initData hash (dedup key only, not a secret) so a
-- captured initData replayed within the auth window returns the SAME session, never a second mint.
-- Carries user_id → auto-covered by the export/delete sweep (identityRepo.listUserScopedTables).
CREATE TABLE IF NOT EXISTS miniapp_initdata_seen (
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_hash  TEXT    NOT NULL,
  auth_date  INTEGER NOT NULL,
  seen_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, auth_hash)
);
