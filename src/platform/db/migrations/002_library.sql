-- 002_library.sql — Week 8: Library texts
-- Depends on 001_init.sql (users, groups, group_members, invites) + pgcrypto
-- Creates: library_texts

BEGIN;

-- updated_at helper (safe to re-run)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS library_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  title TEXT NOT NULL,
  source TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_texts_group_created_idx
  ON library_texts (group_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_library_texts_set_updated_at ON library_texts;
CREATE TRIGGER trg_library_texts_set_updated_at
BEFORE UPDATE ON library_texts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
