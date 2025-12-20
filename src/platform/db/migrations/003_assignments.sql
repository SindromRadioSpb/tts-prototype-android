-- 003_assignments.sql — Week 8: Assignments
-- Creates: assignments

BEGIN;

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text_id UUID NOT NULL REFERENCES library_texts(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('training', 'history')),
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignments_group_created_idx
  ON assignments (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assignments_text_idx
  ON assignments (text_id);

COMMIT;
