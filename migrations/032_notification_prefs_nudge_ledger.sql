-- 032_notification_prefs_nudge_ledger.sql — CLG-P7.3a proactive nudge foundation.
-- Единый КРОСС-КАНАЛЬНЫЙ бюджет уведомлений (push + Telegram-бот) — канон AI_MENTOR_RECON §673-677.
--
-- Инварианты (критика wf_f60b0e58, 3 BLOCKER):
--   • ОБЕ таблицы имеют first-class user_id → авто-покрыты structural delete/export (identityRepo
--     listUserScopedTables по колонке 'user_id'; иначе PII переживёт GDPR-erasure — BLOCKER).
--   • nudge_ledger UNIQUE(user_id, local_day) = ЕДИНЫЙ ключ бюджета по ЛОКАЛЬНОМУ дню пользователя для
--     ОБОИХ каналов (push=UTC-day и бот=local-day были бы несовместимы — BLOCKER). Claim-BEFORE-send:
--     INSERT OR IGNORE → changes===1 ⇒ можно слать; кто первый (push ИЛИ бот) занял день — второй skip.
--     at-most-once (потерянный нудж честнее дубля для премиум-канала).
--   • notification_preferences: opt-out = явный enabled=false (durable); отсутствие строки = enabled
--     (pairing-consent покрывает «напоминания»). tz/quiet = класс A (user-provided). Без BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled            INTEGER NOT NULL DEFAULT 1,                    -- глобальный opt-out (0 = все нуджи off)
  telegram_enabled   INTEGER NOT NULL DEFAULT 1,                    -- канал Telegram (/stop → 0, /resume → 1)
  timezone           TEXT NOT NULL DEFAULT 'Asia/Jerusalem',        -- IANA tz (DST-safe через Intl); валидируется на write
  window             TEXT NOT NULL DEFAULT 'morning',               -- 'morning' | 'evening' — начало окна доставки
  quiet_start_local  INTEGER NOT NULL DEFAULT 22,                   -- час [0..23] начала тишины (local)
  quiet_end_local    INTEGER NOT NULL DEFAULT 8,                    -- час [0..23] конца тишины (wrap-around ок)
  -- суточный cap = 1 нудж-событие/local_day (push+бот суммарно), захардкожен ключом nudge_ledger
  -- PK(user_id, local_day) через INSERT OR IGNORE — отдельная колонка-«knob» была бы мёртвой (>1/день
  -- требует иного дизайна ключа; критика wf_858259da: не выставлять ложно-настраиваемое).
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- nudge_ledger: ЕДИНЫЙ per-(user, local_day) claim бюджета + runtime/backoff-состояние. ЕДИНСТВЕННЫЙ
-- писатель = sweep (engaged/ignored ВЫВОДИТСЯ из review_log, не пишется webhook'ом — нет two-writer
-- гонки). Очищается revoke-каскадом (backoff не переживает re-pair). last_nudge_at — для derived-engagement.
CREATE TABLE IF NOT EXISTS nudge_ledger (
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_day           TEXT NOT NULL,                                -- 'YYYY-MM-DD' по tz пользователя (Intl)
  channel             TEXT NOT NULL,                                -- 'telegram' | 'push' — кто занял день
  reason              TEXT,                                          -- детерминированный reason-код (DUE_READY…)
  last_nudge_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  consecutive_ignored INTEGER NOT NULL DEFAULT 0,                    -- backoff-счётчик (P7.3c; derived-обновляется sweep'ом)
  PRIMARY KEY (user_id, local_day)                                   -- claim-ключ: INSERT OR IGNORE
);
CREATE INDEX IF NOT EXISTS idx_nudge_ledger_user ON nudge_ledger(user_id, last_nudge_at);
