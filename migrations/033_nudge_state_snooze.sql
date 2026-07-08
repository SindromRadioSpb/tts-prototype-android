-- 033_nudge_state_snooze.sql — CLG-P7.3c adaptive backoff + /notoday + /mute.
--
-- Разделение писателей (критика wf_e9b7e615 2 BLOCKER): backoff-состояние НЕ на общем кросс-канальном
-- nudge_ledger (push/notoday-строки чужого канала сбрасывали бы telegram-backoff через lastNudge). Две
-- таблицы, каждая ОДИН писатель:
--   • notification_preferences (WEBHOOK-писатель) += muted_until — /notoday//mute пишут в phase-1 txn
--     (как telegram_enabled); sweep ЧИТАЕТ как КРОСС-КАНАЛЬНЫЙ skip-предикат (и Telegram, и push).
--   • nudge_state (SWEEP-ЕДИНСТВЕННЫЙ писатель) — telegram backoff-состояние, мутируется каждый tick
--     (не только на send → reset не теряется в дни без нуджа: push занял/окно закрыто/due=0).
-- Backoff-RESET = ТОЛЬКО реальная учёба (review_log/learner_events), НЕ /mute//notoday (иначе mute
-- сокращал бы backoff — критика; mute нейтрален к счётчику). GDPR: обе с user_id → авто-delete/export.
-- Без BEGIN/COMMIT.

ALTER TABLE notification_preferences ADD COLUMN muted_until TEXT;         -- UTC-Z instant конца тишины (tz-aware, DST-safe); NULL = не muted

CREATE TABLE IF NOT EXISTS nudge_state (
  user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consecutive_ignored INTEGER NOT NULL DEFAULT 0,                          -- подряд проигнорированных нуджей (лестница {1,2,4,7})
  last_nudge_at       TEXT,                                                 -- когда последний telegram-нудж УШЁЛ (граница engagement)
  last_engaged_at     TEXT,                                                 -- последняя обнаруженная активность (для RETURN_AFTER_GAP порога)
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
