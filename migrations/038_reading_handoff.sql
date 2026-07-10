-- CLG-P8.5 — opaque one-time reading-handoff (SECURITY_SPEC §9, fork-5=B): «Открыть в Зале» из
-- Mini App ведёт в ТОЧНОЕ предложение БЕЗ утечки text_key/order_index в URL/history. Токен =
-- capability: sha256 в БД (raw никогда), single-use (used_at), короткий TTL. user_id →
-- авто-покрытие GDPR-sweep; token_hash стрипается в export (identityRepo).
CREATE TABLE IF NOT EXISTS handoff_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_key    TEXT NOT NULL,
  order_index INTEGER,
  action      TEXT NOT NULL DEFAULT 'open_reader',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
