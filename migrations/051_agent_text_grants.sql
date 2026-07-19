-- S-пакет S2 (LINGUISTPRO_AGENT_PERSONAL_TEXTS_S1S2_DESIGN §2.1) — standing-грант владельца на
-- чтение агентом ТЕЛ личных текстов. Решение владельца §0.1-4: сразу text_key='*' (per-text
-- ступень пропущена; kind request_text_access не строится). PERSISTENT = expires_at NULL с
-- отдельной revoke-кнопкой в панели, либо TTL по выбору на выдаче. Гашение lazy: read-предикат
-- revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now) — без UPDATE-писателей
-- (критика: слоты/dedupe как у proposals здесь не нужны). Каскады: connection revoke =
-- status-флип (FK не спасает) → явный revoke в роуте; отзыв cloud_texts → revokeAllForUser;
-- физический DELETE — GDPR-sweep (user_id) + ON DELETE CASCADE. Derivable-хэшей нет by design
-- (strip-список identityRepo).
CREATE TABLE IF NOT EXISTS agent_text_grants (
  grant_id      TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES agent_connections(connection_id) ON DELETE CASCADE,
  text_key      TEXT NOT NULL CHECK(text_key = '*'),
  granted_at    TEXT NOT NULL,
  expires_at    TEXT,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_agent_text_grants_user ON agent_text_grants(user_id, revoked_at);
