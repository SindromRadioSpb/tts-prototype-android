-- 010_srs_tables.sql
-- PATCH-06: SRS (Spaced Repetition System) tables + review events

-- SRS Cards: current state of each card
CREATE TABLE IF NOT EXISTS srs_cards (
  id TEXT PRIMARY KEY,
  
  -- Entity reference (sentence, note, etc.)
  entity_type TEXT NOT NULL,   -- 'sentence', 'note', 'text'
  entity_id TEXT NOT NULL,
  
  -- SRS state
  state TEXT NOT NULL DEFAULT 'new',  -- 'new', 'learning', 'review', 'relearning', 'suspended'
  due_date TEXT,                       -- ISO date when next review is due
  interval_days REAL NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  lapses INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_review_at TEXT,
  
  UNIQUE(entity_type, entity_id)
);

-- Indexes for SRS cards
CREATE INDEX IF NOT EXISTS ix_srs_cards_due ON srs_cards(due_date);
CREATE INDEX IF NOT EXISTS ix_srs_cards_state ON srs_cards(state);
CREATE INDEX IF NOT EXISTS ix_srs_cards_entity ON srs_cards(entity_type, entity_id);

-- SRS Review Events: log of all reviews (for analytics)
CREATE TABLE IF NOT EXISTS srs_review_events (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
  
  -- Review data
  rating INTEGER NOT NULL,  -- 1=Again, 2=Hard, 3=Good, 4=Easy
  
  -- State before/after (for analytics)
  interval_before REAL,
  interval_after REAL,
  ease_before REAL,
  ease_after REAL,
  
  -- Review context
  review_time_ms INTEGER,   -- time spent on review (ms)
  
  -- Timestamp
  reviewed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Indexes for review events
CREATE INDEX IF NOT EXISTS ix_srs_review_events_card ON srs_review_events(card_id);
CREATE INDEX IF NOT EXISTS ix_srs_review_events_time ON srs_review_events(reviewed_at);
CREATE INDEX IF NOT EXISTS ix_srs_review_events_rating ON srs_review_events(rating);
