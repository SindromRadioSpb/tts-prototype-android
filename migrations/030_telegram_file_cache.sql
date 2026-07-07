-- 030_telegram_file_cache.sql — CLG-P7.2c dictate:tg. Кеш Telegram file_id по assetKey слова-диктанта.
-- Первая отправка аудио диктанта = sendAudio с публичным URL (Telegram сам фетчит keyless-раздачу
-- /api/audio/:key) → из ответа берём result.audio.file_id и кешируем. Повторная отправка того же
-- слова → sendAudio с file_id (БЕЗ повторной загрузки/URL-фетча).
--
-- Инварианты:
--   • file_id привязан к БОТУ (bot_id из токена), не к пользователю — класс A (assetKey = TTS
--     словарной формы, НЕ PII; file_id общий на бота). Составной PK (asset_key, bot_id): ротация
--     токена → другой bot_id → старые file_id не берутся (битый кеш чужого бота не используется).
--   • битый/просроченный file_id (Telegram 400) → строка удаляется + retry через URL (api.js).
--   • НЕ ссылается на users → не участвует в per-user export/delete sweep (класс A, не PII). Без BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS telegram_file_cache (
  asset_key   TEXT NOT NULL,                                                   -- content-addressed sha256 диктант-ассета
  bot_id      TEXT NOT NULL,                                                   -- id бота (префикс токена до ':')
  file_id     TEXT NOT NULL,                                                   -- Telegram file_id (reuse без загрузки)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (asset_key, bot_id)
);
