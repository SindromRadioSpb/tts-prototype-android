-- 009_hebrew_norm.sql
-- PATCH-04: Add hebrew normalization column for search
-- Normalization: strip niqqud (vowel points), final forms → regular, lowercase

-- Add normalized hebrew column to sentences
ALTER TABLE sentences ADD COLUMN he_norm TEXT;

-- Index for search on normalized hebrew
CREATE INDEX IF NOT EXISTS ix_sentences_he_norm ON sentences(he_norm);

-- Note: Backfill he_norm values will be done by application code
-- using db/hebrewNorm.js after migration runs
