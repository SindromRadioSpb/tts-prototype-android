-- 003_v3_progress.sql
-- Progress v3.0: server-side resume state per text.

CREATE TABLE IF NOT EXISTS text_progress (
  text_id TEXT PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
  last_row_idx INTEGER,
  last_step_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS ix_text_progress_updated_at ON text_progress(updated_at);
