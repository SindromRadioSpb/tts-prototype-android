-- Mediatheque «Разложить» (docs/superpowers/specs/2026-11-28-mediatheque-daily-sorting-design.md): when a material
-- first appeared in «Видео дня», so the hourly sweep moves it out after 5 days (unplaced ones into «Нераспределённые»).
CREATE TABLE IF NOT EXISTS media_daily_seen (
  item_key TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);
