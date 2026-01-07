-- 008_w9_tags_json_canon.sql
-- W9-TAGS-DB-01: canonicalize tags_json + indexes

-- 1) NULL / empty => []
UPDATE texts
SET tags_json = '[]'
WHERE tags_json IS NULL OR TRIM(tags_json) = '';

-- 2) If not a JSON array (does not start with '['), wrap as a single tag
UPDATE texts
SET tags_json =
  '["' || REPLACE(TRIM(tags_json), '"', '\"') || '"]'
WHERE tags_json IS NOT NULL
  AND TRIM(tags_json) <> ''
  AND SUBSTR(LTRIM(tags_json), 1, 1) <> '[';

-- 3) Indexes (recommended)
CREATE INDEX IF NOT EXISTS idx_texts_level ON texts(level);
CREATE INDEX IF NOT EXISTS idx_texts_topic ON texts(topic);
CREATE INDEX IF NOT EXISTS idx_texts_updated_at ON texts(updated_at);
