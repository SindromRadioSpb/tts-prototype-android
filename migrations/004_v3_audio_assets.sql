-- 004_v3_audio_assets.sql
-- Audio assets (dedup) + links to sentences/texts

CREATE TABLE IF NOT EXISTS audio_assets (
  id TEXT PRIMARY KEY,
  asset_key TEXT NOT NULL UNIQUE,
  asset_type TEXT NOT NULL,          -- 'row' | 'full'
  relative_path TEXT NOT NULL,        -- e.g. audio-cache/<asset_key>.mp3
  mime TEXT NOT NULL DEFAULT 'audio/mpeg',
  duration_ms INTEGER,
  size_bytes INTEGER,
  tts_profile_json TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_audio_assets_last_used_at ON audio_assets(last_used_at);
CREATE INDEX IF NOT EXISTS ix_audio_assets_asset_type ON audio_assets(asset_type);

CREATE TABLE IF NOT EXISTS sentence_audio (
  sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
  audio_id TEXT NOT NULL REFERENCES audio_assets(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (sentence_id, audio_id)
);

CREATE INDEX IF NOT EXISTS ix_sentence_audio_sentence_id ON sentence_audio(sentence_id);

CREATE TABLE IF NOT EXISTS text_audio (
  text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  audio_id TEXT NOT NULL REFERENCES audio_assets(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (text_id, audio_id)
);

CREATE INDEX IF NOT EXISTS ix_text_audio_text_id ON text_audio(text_id);
