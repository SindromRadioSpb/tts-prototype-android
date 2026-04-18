-- 017_premium_translation.sql
-- Premium translation pipeline: versioned doc + segment caches, provider-agnostic
-- overrides, restorable history, and provenance columns on sentences.
-- Без BEGIN/COMMIT (раннер сам оборачивает).

-- =============================================================================
-- 1) Document-level cache: keyed by full pipeline version + provider + source.
-- =============================================================================
CREATE TABLE IF NOT EXISTS translation_doc_cache (
  cache_key         TEXT PRIMARY KEY,           -- sha256(versions + provider + target_lang + normalized_source)
  source_hash       TEXT NOT NULL,              -- sha256(normalized_source) — same across versions
  provider          TEXT NOT NULL,              -- 'gcp' | 'madlad' | 'manual' | 'legacy-gemini'
  target_lang       TEXT NOT NULL,              -- 'ru' | 'en' | ...
  segmenter_version TEXT NOT NULL,
  nikud_version     TEXT NOT NULL,
  translit_profile  TEXT NOT NULL,
  translator_version TEXT NOT NULL,
  result_json       TEXT NOT NULL,              -- [{segment_index, he, he_niqqud, translit, ru}, ...]
  segments_count    INTEGER NOT NULL DEFAULT 0,
  bytes_size        INTEGER NOT NULL DEFAULT 0, -- for size-cap GC
  hit_count         INTEGER NOT NULL DEFAULT 0,
  last_hit_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS ix_tdc_source_hash  ON translation_doc_cache(source_hash);
CREATE INDEX IF NOT EXISTS ix_tdc_provider     ON translation_doc_cache(provider, target_lang);
CREATE INDEX IF NOT EXISTS ix_tdc_last_hit_at  ON translation_doc_cache(last_hit_at);
CREATE INDEX IF NOT EXISTS ix_tdc_created_at   ON translation_doc_cache(created_at);

-- =============================================================================
-- 2) Segment-level cache: per normalized Hebrew segment.
-- =============================================================================
CREATE TABLE IF NOT EXISTS translation_segment_cache (
  cache_key          TEXT PRIMARY KEY,          -- sha256(versions + provider + target_lang + normalized_he)
  he_hash            TEXT NOT NULL,             -- sha256(normalized_he)
  he                 TEXT NOT NULL,             -- normalized Hebrew (display-level)
  he_niqqud          TEXT,
  translit           TEXT,
  ru                 TEXT,
  provider           TEXT NOT NULL,
  target_lang        TEXT NOT NULL,
  nikud_version      TEXT NOT NULL,
  translit_profile   TEXT NOT NULL,
  translator_version TEXT NOT NULL,
  hit_count          INTEGER NOT NULL DEFAULT 0,
  last_hit_at        TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS ix_tsc_he_hash     ON translation_segment_cache(he_hash);
CREATE INDEX IF NOT EXISTS ix_tsc_provider    ON translation_segment_cache(provider, target_lang);
CREATE INDEX IF NOT EXISTS ix_tsc_last_hit_at ON translation_segment_cache(last_hit_at);
CREATE INDEX IF NOT EXISTS ix_tsc_created_at  ON translation_segment_cache(created_at);

-- =============================================================================
-- 3) Manual overrides: user-edited niqqud/translit/ru for a Hebrew segment.
--    Provider-agnostic by default (provider_scope = '*'); can be scoped to a
--    specific provider when the user explicitly pins one (e.g. 'gcp').
-- =============================================================================
CREATE TABLE IF NOT EXISTS translation_overrides (
  id              TEXT PRIMARY KEY,
  he_hash         TEXT NOT NULL,                -- sha256(normalized_he)
  he              TEXT NOT NULL,                -- normalized Hebrew (for recovery/inspection)
  he_niqqud       TEXT,
  translit        TEXT,
  ru              TEXT,
  target_lang     TEXT NOT NULL,
  provider_scope  TEXT NOT NULL DEFAULT '*',    -- '*' | 'gcp' | 'madlad' | 'manual' | ...
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(he_hash, target_lang, provider_scope)
);

CREATE INDEX IF NOT EXISTS ix_tov_he_hash      ON translation_overrides(he_hash, target_lang);
CREATE INDEX IF NOT EXISTS ix_tov_updated_at   ON translation_overrides(updated_at);

-- =============================================================================
-- 4) Translation history: restorable snapshots per text.
-- =============================================================================
CREATE TABLE IF NOT EXISTS translation_history (
  id                 TEXT PRIMARY KEY,
  text_id            TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,
  target_lang        TEXT NOT NULL,
  segmenter_version  TEXT NOT NULL,
  nikud_version      TEXT NOT NULL,
  translit_profile   TEXT NOT NULL,
  translator_version TEXT NOT NULL,
  result_json        TEXT NOT NULL,             -- full rows snapshot
  segments_count     INTEGER NOT NULL DEFAULT 0,
  note               TEXT,                      -- optional user label
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS ix_thist_text_created  ON translation_history(text_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_thist_created_at    ON translation_history(created_at);

-- =============================================================================
-- 5) Provenance on sentences: which provider/versions produced the current row.
--    Kept separate from row_hash so re-translation can stamp provenance without
--    invalidating semantic identity.
-- =============================================================================
ALTER TABLE sentences ADD COLUMN translation_provider TEXT;
ALTER TABLE sentences ADD COLUMN translation_meta_json TEXT;

CREATE INDEX IF NOT EXISTS ix_sentences_translation_provider
  ON sentences(translation_provider);
