-- 004_progress.sql — Week 8: Progress
-- Creates: progress

BEGIN;

CREATE TABLE IF NOT EXISTS progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_id UUID NOT NULL REFERENCES library_texts(id) ON DELETE CASCADE,
  assignment_id UUID NULL REFERENCES assignments(id) ON DELETE SET NULL,

  -- Для корректного upsert при nullable assignment_id:
  -- assignment_key = assignment_id либо фиксированный UUID (для "общего прогресса по тексту")
  assignment_key UUID GENERATED ALWAYS AS (
    COALESCE(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,

  last_selected_row INTEGER NULL,
  last_played_row INTEGER NULL,
  completion INTEGER NULL CHECK (completion >= 0 AND completion <= 100),
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE progress
  DROP CONSTRAINT IF EXISTS progress_unique_key;

ALTER TABLE progress
  ADD CONSTRAINT progress_unique_key
  UNIQUE (user_id, group_id, text_id, assignment_key);

CREATE INDEX IF NOT EXISTS progress_group_text_idx
  ON progress (group_id, text_id);

CREATE INDEX IF NOT EXISTS progress_user_group_idx
  ON progress (user_id, group_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_progress_set_updated_at ON progress;
CREATE TRIGGER trg_progress_set_updated_at
BEFORE UPDATE ON progress
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
