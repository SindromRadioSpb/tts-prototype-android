-- 024_push_subscriptions — CLG-P4.5 Web Push (AI_MENTOR_RECON §8/§9 P4.5).
-- Класс A (§5): подписка — персональные данные, каскад-delete + динамический export/delete sweep
-- покрывают её автоматически. Нудж несёт ТОЛЬКО счётчик («N слов ждут повторения») без
-- содержимого (§8). last_notified_day — суточный дедуп (единый бюджет уведомлений §8: один
-- нудж/день до появления notification_preferences-механики P7).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint           TEXT NOT NULL,
  keys_p256dh        TEXT NOT NULL,
  keys_auth          TEXT NOT NULL,
  device_id          TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_ok_at         TEXT,
  last_notified_day  TEXT,               -- 'YYYY-MM-DD' UTC
  failed_count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS ix_push_subs_user ON push_subscriptions(user_id);
