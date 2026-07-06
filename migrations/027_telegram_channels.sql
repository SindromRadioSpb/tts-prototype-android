-- 027_telegram_channels.sql — CLG-P7.1a Telegram channel security + pairing
-- (TELEGRAM_P7_1_PAIRING_SPEC_2026_07_07.md v2; owner flow-decision A 2026-07-07).
--
-- Первая внешняя attack-surface поверхность продукта. Инварианты, приземлённые здесь:
--   • channel_links — класс A (telegram_user_id/chat_id ↔ user_id); user_id → авто
--     export/delete sweep identityRepo (§10). status pending|active|revoked: связка становится
--     active ТОЛЬКО после telegram-side /confirm (двусторонний confirm, readiness §5) — deep-link
--     redeem создаёт лишь pending, что закрывает confused-deputy;
--   • partial-UNIQUE только на active: telegram-аккаунт активно связан ≤1 user (анти-hijack),
--     один user = ≤1 активная связка; pending-строки не уникальны;
--   • CHECK: active-связка обязана нести telegram_user_id (иначе NULL-lookup мог бы «совпасть»);
--   • channel_pairing_tokens — одноразовые, TTL, ХЭШ токена (сам токен не хранится); session_id
--     минтера — привязка к веб-сессии;
--   • telegram_updates — dedup БЕЗ PII (update_id — глобальная последовательность бота);
--     осознанное исключение из user_id-sweep (нет PII), TTL-prune реальным setInterval-триггером;
--   • bot_action_log — журнал идентификаторами; command = ТОЛЬКО глагол (сырой токен никогда);
--     user_id nullable (команды непривязанного чата) — delete достаёт по telegram_chat_id.
-- Без BEGIN/COMMIT (раннер сам оборачивает).

CREATE TABLE IF NOT EXISTS channel_links (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL DEFAULT 'telegram',
  telegram_user_id  TEXT,
  telegram_chat_id  TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',   -- pending | active | revoked
  consent_version   TEXT,
  last_update_id    INTEGER,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  confirmed_at      TEXT,
  revoked_at        TEXT,
  CHECK (status != 'active' OR telegram_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_channel_links_user ON channel_links(user_id, status);
-- анти-hijack: активная связка уникальна по telegram-аккаунту И по user-у (partial — только active)
CREATE UNIQUE INDEX IF NOT EXISTS ux_channel_links_active_tg
  ON channel_links(channel, telegram_user_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS ux_channel_links_active_user
  ON channel_links(user_id, channel) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS channel_pairing_tokens (
  token_hash    TEXT PRIMARY KEY,                       -- sha256(сырой токен); сам токен НЕ хранится
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL DEFAULT 'telegram',
  session_id    TEXT,                                   -- сессия минтера (двусторонность)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT NOT NULL,
  consumed_at   TEXT,
  consumed_by_tg TEXT
);
CREATE INDEX IF NOT EXISTS ix_pairing_tokens_user ON channel_pairing_tokens(user_id, consumed_at);

-- Dedup БЕЗ PII: update_id — глобальная последовательность бота; исключён из user_id-sweep.
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id     INTEGER PRIMARY KEY,
  received_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS bot_action_log (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              TEXT REFERENCES users(id) ON DELETE CASCADE,   -- nullable: непривязанный чат
  channel              TEXT NOT NULL DEFAULT 'telegram',
  telegram_update_id   INTEGER,
  telegram_chat_id     TEXT,
  command              TEXT,       -- ТОЛЬКО глагол ('start'|'confirm'|'status'…), НИКОГДА токен/текст
  status               TEXT,       -- ok | error | ignored | unlinked | rejected | pending
  error_code           TEXT,
  linked_review_event_id TEXT,     -- P7.2
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_bot_action_user ON bot_action_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_bot_action_chat ON bot_action_log(telegram_chat_id);
CREATE INDEX IF NOT EXISTS ix_bot_action_created ON bot_action_log(created_at);
