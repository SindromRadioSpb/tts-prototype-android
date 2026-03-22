-- 013_srs_review_events_fk_fix.sql
-- Repair SQLite FK target after 012 rebuilt srs_cards

ALTER TABLE srs_review_events RENAME TO srs_review_events_legacy_013;

CREATE TABLE srs_review_events (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  interval_before REAL,
  interval_after REAL,
  ease_before REAL,
  ease_after REAL,
  review_time_ms INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

INSERT INTO srs_review_events (
  id, card_id, rating, interval_before, interval_after,
  ease_before, ease_after, review_time_ms, reviewed_at
)
SELECT
  id, card_id, rating, interval_before, interval_after,
  ease_before, ease_after, review_time_ms, reviewed_at
FROM srs_review_events_legacy_013;

DROP TABLE srs_review_events_legacy_013;

CREATE INDEX IF NOT EXISTS ix_srs_review_events_card ON srs_review_events(card_id);
CREATE INDEX IF NOT EXISTS ix_srs_review_events_time ON srs_review_events(reviewed_at);
CREATE INDEX IF NOT EXISTS ix_srs_review_events_rating ON srs_review_events(rating);
