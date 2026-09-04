// Browser SQLite migrations — точная копия серверных migrations/*.sql
// Каждый элемент = одна транзакция. Порядок критичен.
// schema_migrations tracker хранит применённые версии.

// One SQL authority shared by migration 051 and the repository's idempotent
// repair-on-access path for an installed client that missed a worker upgrade.
export const LEXICAL_RESOLUTION_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS lexical_resolution_events (
    id                    TEXT PRIMARY KEY,
    occurrence_id         TEXT NOT NULL,
    text_id               TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    sentence_id           TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    word_offset           INTEGER NOT NULL CHECK(word_offset >= 0),
    text_key              TEXT NOT NULL,
    order_index           INTEGER NOT NULL CHECK(order_index >= 0),
    surface_norm          TEXT NOT NULL,
    source_anchor         TEXT NOT NULL,
    action                TEXT NOT NULL CHECK(action IN ('confirm_candidate','manual_correction','reject_all','defer','clear')),
    chosen_json           TEXT CHECK(chosen_json IS NULL OR json_valid(chosen_json)),
    candidate_fingerprint TEXT NOT NULL,
    morph_model_version   TEXT,
    actor_kind            TEXT NOT NULL CHECK(actor_kind IN ('owner','teacher')),
    batch_id              TEXT,
    supersedes_id         TEXT,
    note                  TEXT,
    created_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_lexres_occurrence
    ON lexical_resolution_events(occurrence_id, created_at, id);
  CREATE INDEX IF NOT EXISTS ix_lexres_text
    ON lexical_resolution_events(text_id, order_index, word_offset, created_at);
  CREATE INDEX IF NOT EXISTS ix_lexres_batch
    ON lexical_resolution_events(batch_id) WHERE batch_id IS NOT NULL;`;

export const MIGRATIONS = [
  // 001_v3_bootstrap
  `CREATE TABLE IF NOT EXISTS v3_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    created_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO v3_bootstrap (id, created_at)
  VALUES (1, datetime('now'));`,

  // 002_v3_library
  `CREATE TABLE IF NOT EXISTS texts (
    id TEXT PRIMARY KEY,
    text_key TEXT NOT NULL,
    title TEXT NOT NULL,
    level TEXT,
    tags_json TEXT,
    source_text TEXT NOT NULL,
    source_meta_json TEXT,
    tts_profile_json TEXT,
    table_model_meta_json TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_opened_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_texts_text_key ON texts(text_key);
  CREATE INDEX IF NOT EXISTS ix_texts_archived_opened ON texts(is_archived, last_opened_at);
  CREATE INDEX IF NOT EXISTS ix_texts_created_at ON texts(created_at);
  CREATE INDEX IF NOT EXISTS ix_texts_updated_at ON texts(updated_at);
  CREATE TABLE IF NOT EXISTS sentences (
    id TEXT PRIMARY KEY,
    text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    he_plain TEXT,
    he_niqqud TEXT,
    translit TEXT,
    ru TEXT,
    row_hash TEXT,
    meta_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(text_id, order_index)
  );
  CREATE INDEX IF NOT EXISTS ix_sentences_text_order ON sentences(text_id, order_index);
  CREATE INDEX IF NOT EXISTS ix_sentences_text_id ON sentences(text_id);`,

  // 003_v3_progress
  `CREATE TABLE IF NOT EXISTS text_progress (
    text_id TEXT PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
    last_row_idx INTEGER,
    last_step_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ix_text_progress_updated_at ON text_progress(updated_at);`,

  // 004_v3_audio_assets
  `CREATE TABLE IF NOT EXISTS audio_assets (
    id TEXT PRIMARY KEY,
    asset_key TEXT NOT NULL UNIQUE,
    asset_type TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'audio/mpeg',
    duration_ms INTEGER,
    size_bytes INTEGER,
    tts_profile_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  CREATE INDEX IF NOT EXISTS ix_text_audio_text_id ON text_audio(text_id);`,

  // 005_week9_dashboard — история + meta поля
  `ALTER TABLE texts ADD COLUMN source TEXT NULL;
  ALTER TABLE texts ADD COLUMN topic TEXT NULL;
  ALTER TABLE texts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE texts ADD COLUMN pin_order INTEGER NULL;
  CREATE INDEX IF NOT EXISTS idx_texts_pinned ON texts(is_pinned, pin_order);
  CREATE INDEX IF NOT EXISTS idx_texts_level ON texts(level);
  CREATE TABLE IF NOT EXISTS history_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NULL,
    text_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    asset_key TEXT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(text_id) REFERENCES texts(id) ON DELETE CASCADE,
    FOREIGN KEY(sentence_id) REFERENCES sentences(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_history_events_created_at ON history_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_history_events_text_created_at ON history_events(text_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS recent_rows (
    text_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    seen_count INTEGER NOT NULL DEFAULT 1,
    last_asset_key TEXT NULL,
    PRIMARY KEY(text_id, sentence_id),
    FOREIGN KEY(text_id) REFERENCES texts(id) ON DELETE CASCADE,
    FOREIGN KEY(sentence_id) REFERENCES sentences(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_recent_rows_text_last_seen ON recent_rows(text_id, last_seen_at DESC);
  CREATE TABLE IF NOT EXISTS recent_texts (
    text_id TEXT NOT NULL PRIMARY KEY,
    last_seen_at TEXT NOT NULL,
    seen_count INTEGER NOT NULL DEFAULT 1,
    last_sentence_id TEXT NULL,
    last_asset_key TEXT NULL,
    FOREIGN KEY(text_id) REFERENCES texts(id) ON DELETE CASCADE,
    FOREIGN KEY(last_sentence_id) REFERENCES sentences(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_recent_texts_last_seen ON recent_texts(last_seen_at DESC);`,

  // 006_w10_sentence_notes
  `CREATE TABLE IF NOT EXISTS sentence_notes (
    id TEXT PRIMARY KEY,
    text_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
    FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
    UNIQUE(text_id, sentence_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sentence_notes_sentence_id ON sentence_notes(sentence_id);`,

  // 007_w10_sentence_notes_perf — индексы + ISO-триггеры
  `CREATE INDEX IF NOT EXISTS idx_sentence_notes_text_id ON sentence_notes(text_id);
  CREATE INDEX IF NOT EXISTS idx_sentence_notes_text_id_updated_at ON sentence_notes(text_id, updated_at);
  CREATE TRIGGER IF NOT EXISTS trg_sentence_notes_iso_after_insert
  AFTER INSERT ON sentence_notes
  BEGIN
    UPDATE sentence_notes
    SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = NEW.id;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sentence_notes_iso_after_update
  AFTER UPDATE ON sentence_notes
  WHEN NEW.updated_at IS NULL OR NEW.updated_at LIKE '____-__-__ __:__:%'
  BEGIN
    UPDATE sentence_notes
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = NEW.id;
  END;`,

  // 008_w9_tags_json_canon — пустые tags → []
  `UPDATE texts SET tags_json = '[]' WHERE tags_json IS NULL OR TRIM(tags_json) = '';
  CREATE INDEX IF NOT EXISTS idx_texts_topic ON texts(topic);
  CREATE INDEX IF NOT EXISTS idx_texts_updated_at ON texts(updated_at);`,

  // 009_hebrew_norm — колонка для нормализованного иврита
  `ALTER TABLE sentences ADD COLUMN he_norm TEXT;
  CREATE INDEX IF NOT EXISTS ix_sentences_he_norm ON sentences(he_norm);`,

  // 010_srs_tables
  `CREATE TABLE IF NOT EXISTS srs_cards (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'new',
    due_date TEXT,
    interval_days REAL NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    lapses INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_review_at TEXT,
    UNIQUE(entity_type, entity_id)
  );
  CREATE INDEX IF NOT EXISTS ix_srs_cards_due ON srs_cards(due_date);
  CREATE INDEX IF NOT EXISTS ix_srs_cards_state ON srs_cards(state);
  CREATE INDEX IF NOT EXISTS ix_srs_cards_entity ON srs_cards(entity_type, entity_id);
  CREATE TABLE IF NOT EXISTS srs_review_events (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    interval_before REAL,
    interval_after REAL,
    ease_before REAL,
    ease_after REAL,
    review_time_ms INTEGER,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ix_srs_review_events_card ON srs_review_events(card_id);
  CREATE INDEX IF NOT EXISTS ix_srs_review_events_time ON srs_review_events(reviewed_at);
  CREATE INDEX IF NOT EXISTS ix_srs_review_events_rating ON srs_review_events(rating);`,

  // 011_srs_sessions
  `CREATE TABLE IF NOT EXISTS srs_session_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    mode TEXT NOT NULL DEFAULT 'today',
    source TEXT,
    queue_json TEXT NOT NULL DEFAULT '[]',
    current_index INTEGER NOT NULL DEFAULT 0,
    cards_total INTEGER NOT NULL DEFAULT 0,
    cards_seen INTEGER NOT NULL DEFAULT 0,
    reviews_done INTEGER NOT NULL DEFAULT 0,
    stats_json TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_srs_session_runs_status ON srs_session_runs(status);
  CREATE INDEX IF NOT EXISTS ix_srs_session_runs_started_at ON srs_session_runs(started_at);`,

  // 012_srs_templates — rename+recreate srs_cards с template_id
  `CREATE TABLE IF NOT EXISTS srs_card_templates (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    card_kind TEXT NOT NULL,
    prompt_lang TEXT,
    answer_lang TEXT,
    front_schema_json TEXT NOT NULL DEFAULT '{}',
    back_schema_json TEXT NOT NULL DEFAULT '{}',
    answer_mode TEXT NOT NULL DEFAULT 'reveal',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO srs_card_templates
    (id, code, label, card_kind, prompt_lang, answer_lang, front_schema_json, back_schema_json, answer_mode, is_active, sort_order)
  VALUES
    ('tpl_ru_to_he','ru_to_he','Russian -> Hebrew','sentence','ru','he','{"prompt":"ru"}','{"answer":"he","extra":["translit","textTitle"]}','reveal',1,10),
    ('tpl_he_to_ru','he_to_ru','Hebrew -> Russian','sentence','he','ru','{"prompt":"he"}','{"answer":"ru","extra":["translit","textTitle"]}','reveal',1,20),
    ('tpl_audio_to_he','audio_to_he','Audio -> Hebrew','sentence_audio','audio','he','{"prompt":"audio"}','{"answer":"he","extra":["translit","textTitle"]}','reveal',0,30);
  ALTER TABLE srs_cards RENAME TO srs_cards_legacy_012;
  CREATE TABLE srs_cards (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    template_id TEXT NOT NULL REFERENCES srs_card_templates(id),
    source_sentence_id TEXT,
    source_note_id TEXT,
    meta_json TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT 'new',
    due_date TEXT,
    interval_days REAL NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    lapses INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_review_at TEXT,
    UNIQUE(entity_type, entity_id, template_id)
  );
  INSERT INTO srs_cards
    (id,entity_type,entity_id,template_id,source_sentence_id,source_note_id,meta_json,state,due_date,interval_days,ease_factor,lapses,reps,created_at,updated_at,last_review_at)
  SELECT id,entity_type,entity_id,'tpl_ru_to_he',
    CASE WHEN entity_type='sentence' THEN entity_id ELSE NULL END,
    NULL,'{}',state,due_date,interval_days,ease_factor,lapses,reps,created_at,updated_at,last_review_at
  FROM srs_cards_legacy_012;
  DROP TABLE srs_cards_legacy_012;
  CREATE INDEX IF NOT EXISTS ix_srs_cards_due ON srs_cards(due_date);
  CREATE INDEX IF NOT EXISTS ix_srs_cards_state ON srs_cards(state);
  CREATE INDEX IF NOT EXISTS ix_srs_cards_entity ON srs_cards(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS ix_srs_cards_template ON srs_cards(template_id);
  CREATE INDEX IF NOT EXISTS ix_srs_cards_entity_template ON srs_cards(entity_type, entity_id, template_id);`,

  // 013_srs_review_events_fk_fix — пересоздать с правильным FK
  `ALTER TABLE srs_review_events RENAME TO srs_review_events_legacy_013;
  CREATE TABLE srs_review_events (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    interval_before REAL,
    interval_after REAL,
    ease_before REAL,
    ease_after REAL,
    review_time_ms INTEGER,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO srs_review_events
    (id,card_id,rating,interval_before,interval_after,ease_before,ease_after,review_time_ms,reviewed_at)
  SELECT id,card_id,rating,interval_before,interval_after,ease_before,ease_after,review_time_ms,reviewed_at
  FROM srs_review_events_legacy_013;
  DROP TABLE srs_review_events_legacy_013;
  CREATE INDEX IF NOT EXISTS ix_srs_review_events_card ON srs_review_events(card_id);
  CREATE INDEX IF NOT EXISTS ix_srs_review_events_time ON srs_review_events(reviewed_at);
  CREATE INDEX IF NOT EXISTS ix_srs_review_events_rating ON srs_review_events(rating);`,

  // 014_srs_attempts
  `CREATE TABLE IF NOT EXISTS srs_attempts (
    id TEXT PRIMARY KEY,
    session_id TEXT NULL REFERENCES srs_session_runs(id) ON DELETE SET NULL,
    card_id TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
    attempt_type TEXT NOT NULL,
    user_answer TEXT,
    normalized_answer TEXT,
    normalized_expected TEXT,
    is_correct INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER,
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ix_srs_attempts_card ON srs_attempts(card_id);
  CREATE INDEX IF NOT EXISTS ix_srs_attempts_session ON srs_attempts(session_id);
  CREATE INDEX IF NOT EXISTS ix_srs_attempts_type ON srs_attempts(attempt_type);
  CREATE INDEX IF NOT EXISTS ix_srs_attempts_created ON srs_attempts(created_at);`,

  // 015_events_layer
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    session_id TEXT,
    text_id TEXT,
    sentence_id TEXT,
    note_id TEXT,
    card_id TEXT,
    source TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
  CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, ts);
  CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_text_id ON events(text_id);
  CREATE INDEX IF NOT EXISTS idx_events_sentence_id ON events(sentence_id);
  CREATE INDEX IF NOT EXISTS idx_events_card_id ON events(card_id);`,

  // 016_srs_card_exports
  `CREATE TABLE IF NOT EXISTS srs_card_exports (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    card_id TEXT NOT NULL,
    deck_name TEXT,
    model_name TEXT,
    template_code TEXT,
    external_note_id TEXT,
    external_card_ids_json TEXT NOT NULL DEFAULT '[]',
    export_hash TEXT NOT NULL,
    last_sync_status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT,
    exported_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY(card_id) REFERENCES srs_cards(id) ON DELETE CASCADE,
    UNIQUE(provider, card_id)
  );
  CREATE INDEX IF NOT EXISTS idx_srs_card_exports_provider_card ON srs_card_exports(provider, card_id);
  CREATE INDEX IF NOT EXISTS idx_srs_card_exports_note_id ON srs_card_exports(external_note_id);`,

  // 017_premium_translation
  `CREATE TABLE IF NOT EXISTS translation_doc_cache (
    cache_key TEXT PRIMARY KEY,
    source_hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    segmenter_version TEXT NOT NULL,
    nikud_version TEXT NOT NULL,
    translit_profile TEXT NOT NULL,
    translator_version TEXT NOT NULL,
    result_json TEXT NOT NULL,
    segments_count INTEGER NOT NULL DEFAULT 0,
    bytes_size INTEGER NOT NULL DEFAULT 0,
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_hit_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS ix_tdc_source_hash ON translation_doc_cache(source_hash);
  CREATE INDEX IF NOT EXISTS ix_tdc_provider ON translation_doc_cache(provider, target_lang);
  CREATE INDEX IF NOT EXISTS ix_tdc_last_hit_at ON translation_doc_cache(last_hit_at);
  CREATE TABLE IF NOT EXISTS translation_segment_cache (
    cache_key TEXT PRIMARY KEY,
    he_hash TEXT NOT NULL,
    he TEXT NOT NULL,
    he_niqqud TEXT,
    translit TEXT,
    ru TEXT,
    provider TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    nikud_version TEXT NOT NULL,
    translit_profile TEXT NOT NULL,
    translator_version TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_hit_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS ix_tsc_he_hash ON translation_segment_cache(he_hash);
  CREATE INDEX IF NOT EXISTS ix_tsc_provider ON translation_segment_cache(provider, target_lang);
  CREATE TABLE IF NOT EXISTS translation_overrides (
    id TEXT PRIMARY KEY,
    he_hash TEXT NOT NULL,
    he TEXT NOT NULL,
    he_niqqud TEXT,
    translit TEXT,
    ru TEXT,
    target_lang TEXT NOT NULL,
    provider_scope TEXT NOT NULL DEFAULT '*',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(he_hash, target_lang, provider_scope)
  );
  CREATE INDEX IF NOT EXISTS ix_tov_he_hash ON translation_overrides(he_hash, target_lang);
  CREATE TABLE IF NOT EXISTS translation_history (
    id TEXT PRIMARY KEY,
    text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    segmenter_version TEXT NOT NULL,
    nikud_version TEXT NOT NULL,
    translit_profile TEXT NOT NULL,
    translator_version TEXT NOT NULL,
    result_json TEXT NOT NULL,
    segments_count INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS ix_thist_text_created ON translation_history(text_id, created_at DESC);
  ALTER TABLE sentences ADD COLUMN translation_provider TEXT;
  ALTER TABLE sentences ADD COLUMN translation_meta_json TEXT;
  CREATE INDEX IF NOT EXISTS ix_sentences_translation_provider ON sentences(translation_provider);`,

  // 018_sentence_edits
  `ALTER TABLE sentences ADD COLUMN translit_ru TEXT;
  ALTER TABLE sentences ADD COLUMN edit_meta_json TEXT;`,

  // 019_strip_pipe_from_niqqud — только для существующих данных, на свежей БД no-op
  `UPDATE translation_segment_cache SET he_niqqud = REPLACE(he_niqqud,'|','') WHERE he_niqqud LIKE '%|%';
  UPDATE translation_segment_cache SET translit = REPLACE(translit,'|','') WHERE translit LIKE '%|%';
  UPDATE sentences SET he_niqqud = REPLACE(he_niqqud,'|','') WHERE he_niqqud LIKE '%|%';
  UPDATE sentences SET translit = REPLACE(translit,'|','') WHERE translit LIKE '%|%';
  UPDATE sentences SET translit_ru = REPLACE(translit_ru,'|','') WHERE translit_ru LIKE '%|%';
  UPDATE translation_doc_cache SET result_json = REPLACE(result_json,'|','') WHERE result_json LIKE '%|%';`,

  // 020_manual_smart_tag — premium UX (Direction 5 enhancement)
  // User can manually override the auto-derived "struggling"/"mastered"
  // smart-filter classification. Values: NULL = auto-only,
  // 'struggling' / 'mastered' = explicit override.
  // Mutually exclusive — single column, not two booleans.
  `ALTER TABLE texts ADD COLUMN manual_smart_tag TEXT;
  CREATE INDEX IF NOT EXISTS ix_texts_manual_smart_tag ON texts(manual_smart_tag) WHERE manual_smart_tag IS NOT NULL;`,

  // ── Direction 9 Premium Notes Redesign — migrations 021–025 ───────────
  // Phase 9.1 Foundation. Replaces sentence-pinned single-note model with
  // polymorphic targets + 5 note types + audio anchoring + bidirectional
  // links + version history + SRS micro-cards. See
  // docs/PREMIUM_NOTES_PLAN_v3_2.md for full design.

  // 021_notes_v2 — polymorphic notes table.
  // target_kind: 'sentence' (legacy + default for row notes), 'word'
  //   (specific word in a row), 'root' (3-letter Hebrew root, surfaces
  //   across texts), 'binyan' (verb pattern), 'text' (whole text),
  //   'note' (note-on-note, for backlink-style linking), 'free'
  //   (journal entry, no target).
  // note_type: 'free' (markdown only — default + sentence_notes legacy),
  //   'word_study', 'grammar_rule', 'translation_discrepancy',
  //   'pronunciation_note' (sealed schemas, see plan-doc M3).
  // body_json: typed payload per note_type. For 'free' it's {markdown}.
  // 64k cap (D5) — CHECK enforces; json_valid catches malformed JSON.
  `CREATE TABLE IF NOT EXISTS notes_v2 (
    id              TEXT PRIMARY KEY,
    target_kind     TEXT NOT NULL DEFAULT 'sentence' CHECK (target_kind IN
                      ('sentence','word','root','binyan','text','note','free')),
    target_id       TEXT,
    text_id         TEXT,
    note_type       TEXT NOT NULL DEFAULT 'free' CHECK (note_type IN
                      ('free','word_study','grammar_rule',
                       'translation_discrepancy','pronunciation_note')),
    title           TEXT NOT NULL DEFAULT '',
    body_json       TEXT NOT NULL DEFAULT '{}',
    audio_anchor_ms INTEGER,
    audio_asset_key TEXT,
    srs_card_id     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (LENGTH(body_json) <= 65536),
    CHECK (json_valid(body_json)),
    FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_notes_v2_target ON notes_v2(target_kind, target_id);
  CREATE INDEX IF NOT EXISTS ix_notes_v2_text ON notes_v2(text_id);
  CREATE INDEX IF NOT EXISTS ix_notes_v2_type ON notes_v2(note_type);
  CREATE INDEX IF NOT EXISTS ix_notes_v2_audio ON notes_v2(audio_anchor_ms)
    WHERE audio_anchor_ms IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_notes_v2_srs ON notes_v2(srs_card_id)
    WHERE srs_card_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_notes_v2_updated_at ON notes_v2(updated_at);
  CREATE TRIGGER IF NOT EXISTS trg_notes_v2_iso_updated_at
  AFTER UPDATE ON notes_v2
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE notes_v2
       SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = NEW.id;
  END;`,

  // 022_note_versions — M5 versioning. Snapshot per significant edit
  // (debounced ~30s in UI; or manual Save). FIFO retention 50 versions
  // per note (D6) — enforced by application code at write time, not in
  // schema.
  `CREATE TABLE IF NOT EXISTS note_versions (
    note_id        TEXT NOT NULL,
    version        INTEGER NOT NULL,
    body_json      TEXT NOT NULL,
    diff_summary   TEXT,
    edited_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (note_id, version),
    FOREIGN KEY (note_id) REFERENCES notes_v2(id) ON DELETE CASCADE,
    CHECK (LENGTH(body_json) <= 65536),
    CHECK (json_valid(body_json))
  );
  CREATE INDEX IF NOT EXISTS ix_note_versions_edited
    ON note_versions(note_id, edited_at);`,

  // 023_note_links — M4 bidirectional links + backlinks. Every [[…]]
  // reference parsed at save time becomes a row here. ON DELETE CASCADE
  // from the source note; broken links (deleted target) tolerated by UI.
  `CREATE TABLE IF NOT EXISTS note_links (
    from_note_id   TEXT NOT NULL,
    to_kind        TEXT NOT NULL CHECK (to_kind IN
                      ('note','word','root','binyan','text','sentence')),
    to_id          TEXT NOT NULL,
    link_alias     TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (from_note_id, to_kind, to_id),
    FOREIGN KEY (from_note_id) REFERENCES notes_v2(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_note_links_to ON note_links(to_kind, to_id);`,

  // 024_roots — Hebrew root reference table. Schema only; ~100 seed
  // entries (Plan C, see HEBREW_ROOT_EXTRACTOR_RESEARCH.md § 7) loaded
  // by application code in Phase 9.4 from public/data/HEBREW_COMMON_
  // ROOTS_SEED.json. User-added roots merge with seed via UNION query.
  // my_note_id: optional FK to a 'root'-target user note about this root.
  `CREATE TABLE IF NOT EXISTS roots (
    root_3letter   TEXT PRIMARY KEY,
    gloss          TEXT,
    my_note_id     TEXT,
    FOREIGN KEY (my_note_id) REFERENCES notes_v2(id) ON DELETE SET NULL
  );`,

  // 025_migrate_sentence_notes — copy legacy sentence_notes rows into
  // notes_v2 (target_kind='sentence', note_type='free', body_json wraps
  // the plaintext in {"markdown": "..."}), then drop the old table and
  // create a backwards-compat read-only VIEW with the same name + columns
  // so any straggling SELECT-only code (e.g. exportBundle) continues to
  // work without modification. Mutating callers (upsertNote / deleteNote)
  // are rewritten in Phase 9.1.B to operate on notes_v2 directly.
  `INSERT INTO notes_v2 (id, target_kind, target_id, text_id, note_type,
                         title, body_json, created_at, updated_at)
   SELECT id, 'sentence', sentence_id, text_id, 'free', '',
          json_object('markdown', note),
          COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     FROM sentence_notes;
   DROP TABLE sentence_notes;
   CREATE VIEW sentence_notes AS
     SELECT id,
            text_id,
            target_id AS sentence_id,
            COALESCE(json_extract(body_json, '$.markdown'), '') AS note,
            created_at,
            updated_at
       FROM notes_v2
      WHERE target_kind = 'sentence' AND note_type = 'free';`,

  // 026_note_card_templates — seed 4 SRS card_templates whose card_kind='note'.
  // Note → SRS conversion (Phase 9.3.C) picks the matching template by code,
  // creates an srs_cards row with entity_type='note' + entity_id=note.id, and
  // links the note back via notes_v2.srs_card_id. front/back schemas are
  // intentionally minimal — the trainer derives prompt/answer from the note's
  // body_json fields. INSERT OR IGNORE keeps migration idempotent (re-running
  // is a no-op).
  `INSERT OR IGNORE INTO srs_card_templates
    (id, code, label, card_kind, prompt_lang, answer_lang, front_schema_json, back_schema_json, answer_mode, is_active, sort_order)
  VALUES
    ('tpl_note_word_study',              'note_word_study',              'Note: Word',          'note', 'he', 'ru', '{"prompt":"word"}',         '{"answer":"meaning","extra":["niqqud_variant","mnemonic"]}', 'reveal', 1, 100),
    ('tpl_note_grammar_rule',            'note_grammar_rule',            'Note: Grammar rule',  'note', 'he', 'ru', '{"prompt":"rule_title"}',   '{"answer":"rule_body","extra":["examples"]}',                'reveal', 1, 110),
    ('tpl_note_translation_discrepancy', 'note_translation_discrepancy', 'Note: Translation',   'note', 'he', 'ru', '{"prompt":"source_text"}',  '{"answer":"translation_suggested","extra":["reasoning"]}',   'reveal', 1, 120),
    ('tpl_note_pronunciation_note',      'note_pronunciation_note',      'Note: Pronunciation', 'note', 'he', 'he', '{"prompt":"word"}',         '{"answer":"ipa","extra":["common_mistakes"]}',               'reveal', 1, 130);`,

  // 049_note_link_suggestions — v3.6 Smart Learning Graph Phase 4.
  // Durable learner DECISIONS on auto-suggested A2 connections (the
  // "Подтвердите связи" panel). Separate from note_links on purpose:
  // note_links stays the single durable link truth (manual [[…]] OR
  // a confirmed suggestion); this table records the lifecycle so the
  // generator's suppression contract can hide decided candidates
  // (rejected → forever; later → cooldown; confirmed → that reason).
  // PK includes reason_code so a pair decided for one reason can
  // still be suggested for another. Read/written ONLY by the
  // suggestion CRUD; never exported by default (export wiring is a
  // later additive step — see SMART_LEARNING_GRAPH_ROADMAP_v3_6 §5).
  // Idempotent (IF NOT EXISTS) — safe to re-run.
  `CREATE TABLE IF NOT EXISTS note_link_suggestions (
    from_note_id  TEXT NOT NULL,
    to_kind       TEXT NOT NULL CHECK (to_kind IN
                    ('note','word','root','binyan','text','sentence')),
    to_id         TEXT NOT NULL,
    reason_code   TEXT NOT NULL CHECK (reason_code IN
                    ('shared_root','shared_lemma','shared_binyan',
                     'same_text','cooccur')),
    evidence      TEXT,
    score         REAL NOT NULL DEFAULT 0,
    state         TEXT NOT NULL DEFAULT 'pending' CHECK (state IN
                    ('pending','confirmed','rejected','later')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    decided_at    TEXT,
    PRIMARY KEY (from_note_id, to_kind, to_id, reason_code),
    FOREIGN KEY (from_note_id) REFERENCES notes_v2(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_nls_from  ON note_link_suggestions(from_note_id);
  CREATE INDEX IF NOT EXISTS ix_nls_state ON note_link_suggestions(state);`,

  // 050_sentence_morph — Phase D. Pre-computed context-aware morphology
  // (Dicta) for a whole text, stored locally so the graph + word cards +
  // crosstext read Dicta-quality roots OFFLINE after a one-time enrichment.
  // One row per sentence; tokens_json holds the per-word records
  // [{ word, prefix, stem, lemma, lemmas, confident }]. model_version lets a
  // Dicta upgrade re-enrich. ON DELETE CASCADE keeps it tied to the text.
  `CREATE TABLE IF NOT EXISTS sentence_morph (
    sentence_id   TEXT PRIMARY KEY REFERENCES sentences(id) ON DELETE CASCADE,
    text_id       TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    tokens_json   TEXT NOT NULL,
    provider      TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ix_sentence_morph_text ON sentence_morph(text_id);`,

  // 051_lemma_inflection — ②. Conjugation (verbs) / declension (nouns/adj)
  // paradigms scraped from Pealim, cached locally so the word card shows full
  // tables OFFLINE after enrichment. One row per (lemma, binyan, model_version)
  // — binyan is '' for nominals (kept NOT NULL so the PK upserts cleanly; a
  // NULL PK column would defeat ON CONFLICT). paradigm_json is the lossless raw
  // slot→form map + metadata. Append-only; bumping model_version re-scrapes.
  `CREATE TABLE IF NOT EXISTS lemma_inflection (
    lemma         TEXT NOT NULL,
    binyan        TEXT NOT NULL DEFAULT '',
    model_version TEXT NOT NULL,
    pos           TEXT,
    kind          TEXT,
    paradigm_json TEXT NOT NULL,
    source        TEXT,
    pealim_id     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (lemma, binyan, model_version)
  );
  CREATE INDEX IF NOT EXISTS ix_lemma_inflection_lemma ON lemma_inflection(lemma);`,

  // 052_note_provenance — autogen provenance + canonical-lemma occurrences.
  // Additive & non-destructive. Existing notes become source='user', user_touched=1
  // (their edits are NEVER clobbered by regeneration). Auto/curated canonical notes
  // reuse target_kind='word' with target_id = gen_dedup_key (the target_kind CHECK
  // enum has no 'lemma' and SQLite can't ALTER a CHECK without a table rebuild);
  // one canonical note per (sense) lemma, enforced by ux_notes_v2_dedup. Position
  // provenance moves to note_occurrences (one note → many text occurrences) so the
  // reading view's per-row note list and the "+N words/+M roots" growth metric work
  // off a lemma-canonical model.
  `ALTER TABLE notes_v2 ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
  ALTER TABLE notes_v2 ADD COLUMN confidence REAL;
  ALTER TABLE notes_v2 ADD COLUMN model_version TEXT;
  ALTER TABLE notes_v2 ADD COLUMN user_touched INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE notes_v2 ADD COLUMN gen_dedup_key TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_notes_v2_dedup ON notes_v2(gen_dedup_key)
    WHERE gen_dedup_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_notes_v2_source ON notes_v2(source);
  CREATE TABLE IF NOT EXISTS note_occurrences (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id      TEXT NOT NULL,
    text_id      TEXT,
    sentence_id  TEXT,
    word_offset  INTEGER,
    surface      TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (note_id) REFERENCES notes_v2(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_note_occ_note ON note_occurrences(note_id);
  CREATE INDEX IF NOT EXISTS ix_note_occ_sentence ON note_occurrences(sentence_id);
  CREATE INDEX IF NOT EXISTS ix_note_occ_text ON note_occurrences(text_id);
  CREATE UNIQUE INDEX IF NOT EXISTS ux_note_occ ON note_occurrences(note_id, sentence_id, word_offset);`,

  // 053_anki_word_exports — per-word Anki SRS lifecycle (R-3.5). Records that a
  // word_study note was EXPORTED to an Anki deck so the UI can show «📤 В Anki»
  // immediately after export, before any sync (the export path otherwise leaves
  // NO local trace). body_hash = hash of body_json at export time → detect
  // «изменено после экспорта» (the Anki card is stale vs the current note).
  // Keyed by note_id (one canonical note → one export marker; re-export upserts).
  // The events(note_id) index speeds the per-note "last Anki grade" lookup that
  // the lifecycle reader runs (events had no note_id index).
  `CREATE TABLE IF NOT EXISTS anki_word_exports (
    note_id     TEXT PRIMARY KEY,
    deck_name   TEXT,
    model_name  TEXT,
    body_hash   TEXT,
    exported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_note_id ON events(note_id);`,

  // 054_shelves — BRR-P0-003 Reading Room shelf/collection model. A shelf is a
  // curated, ordered list of works in ONE track (accessible|literary) with an
  // editorial intro — a pedagogical route, not a flat list (R8). Members are
  // referenced by text_key (the only id that survives a bundle import; text id
  // is regenerated). items_json = ordered [{text_key, order}]. slug = the
  // shelf's stable, portable identity (upsert key on import). Carried additively
  // in bundle library.json.shelves[] and round-trips like texts/corpus.
  // Contract + validation: db/premium/shelfMeta.js.
  `CREATE TABLE IF NOT EXISTS shelves (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL,
    title           TEXT NOT NULL,
    track           TEXT NOT NULL,
    era             TEXT,
    genre           TEXT,
    editorial_intro TEXT,
    items_json      TEXT NOT NULL DEFAULT '[]',
    order_index     INTEGER,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_shelves_slug ON shelves(slug);
  CREATE INDEX IF NOT EXISTS ix_shelves_track_order ON shelves(track, order_index);`,

  // 055_shelf_canon_origin — BRR-P0-008 versioned canon dedup. Marks a shelf as
  // producer-published canon (origin='benyehuda-ingest') + the bundle version that
  // published it, so a version bump can reconcile (delete orphan / refresh) canon
  // shelves WITHOUT touching user-curated shelves (origin NULL). Additive, nullable;
  // legacy/user shelves stay NULL. (ADD COLUMN runs exactly once — version-tracked.)
  `ALTER TABLE shelves ADD COLUMN origin TEXT;
  ALTER TABLE shelves ADD COLUMN canon_version INTEGER;
  CREATE INDEX IF NOT EXISTS ix_shelves_origin ON shelves(origin);`,

  // 056_bookmarks — BRR-P2-003 Reading-Room passage bookmarks. A bookmark is a
  // position POINTER (sentence/row), NOT a study note — so it gets its own table
  // rather than overloading notes_v2 (whose note_type CHECK forbids 'bookmark' and
  // whose study semantics feed getKnownWordStates). text_id = local OPFS id
  // (FK CASCADE — bookmarks die with their text; foreign_keys=ON, db-worker.js).
  // text_key + sentence_id/order_index re-anchor across a bundle re-import. title +
  // snippet are denormalised (the work title + the he/ru line) so the global
  // bookmarks shelf and LIKE search need no body fetch — corpus bodies may not be
  // in OPFS. One bookmark per (text, sentence) row (toggle is idempotent).
  `CREATE TABLE IF NOT EXISTS bookmarks (
    id          TEXT PRIMARY KEY,
    text_id     TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    text_key    TEXT,
    sentence_id TEXT,
    order_index INTEGER,
    title       TEXT,
    snippet     TEXT,
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS ix_bookmarks_text ON bookmarks(text_id, order_index);
  CREATE INDEX IF NOT EXISTS ix_bookmarks_created ON bookmarks(created_at DESC);
  CREATE INDEX IF NOT EXISTS ix_bookmarks_key ON bookmarks(text_key);
  CREATE UNIQUE INDEX IF NOT EXISTS ux_bookmarks_pos ON bookmarks(text_id, sentence_id);`,

  // 057_word_status — BRR Epic 4 keystone. MANUAL reader-knowledge status, SEPARATE from
  // notes/srs/anki (so marking «known» never spawns a flashcard — the OPFS status store the
  // audit mandated). lemma_key = canonical NotesAutoGen.lemmaKey (pid:<id> | <norm-lemma>#<pos>),
  // byte-identical to the inline key in getKnownWordStates so it overlays the reader colouring +
  // i+1 directly. status ∈ l1|l2|l3|l4 (LingQ learning levels) | known | ignore; ABSENCE of a row
  // = new/unseen. Manual-wins over the SRS-derived overlay for the READING colour (a distinct axis
  // from the review schedule, which stays in srs_cards). No FK — a lemma can be marked with no note.
  `CREATE TABLE IF NOT EXISTS word_status (
    lemma_key  TEXT PRIMARY KEY,
    status     TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS ix_word_status_status ON word_status(status);`,

  // 058_word_status_srs — BRR Epic 4.3b Phase C2. Time-based cross-session spacing for recall
  // (SM2-lite): per-lemma next-due timestamp + interval/reps/lapses, ON the existing word_status row
  // (additive columns — a plain status set preserves these via UPSERT, only a recall answer updates
  // them). Absent srs_due = never recall-tested (always due). The reading-colour axis (status) is
  // unchanged; this is purely the review SCHEDULE, still device-local, NOT an Anki card.
  `ALTER TABLE word_status ADD COLUMN srs_due TEXT;
   ALTER TABLE word_status ADD COLUMN srs_interval REAL NOT NULL DEFAULT 0;
   ALTER TABLE word_status ADD COLUMN srs_reps INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE word_status ADD COLUMN srs_lapses INTEGER NOT NULL DEFAULT 0;
   CREATE INDEX IF NOT EXISTS ix_word_status_due ON word_status(srs_due);`,

  // 059_study_day — BRR Epic 4.3b Phase D7 (soft gamification). Per-day learning-activity LEDGER:
  // one row per LOCAL calendar day with the count of GENUINE recall answers (recalls) and the largest
  // trainable-pool size seen that day (available). This is the SINGLE SOURCE OF TRUTH for the daily goal
  // + streak — the streak (current/best/grace) is FOLDED from this ledger by the pure engine
  // (ReaderMorph.streakView), never stored redundantly (derived≠asserted, R9/R11 — no dual-write drift,
  // the UPSERT lesson). day = 'YYYY-MM-DD' (local). Skips and teach-views write NOTHING here (recall≠show,
  // reuses the D5 invariant). Device-local OPFS; the month-heatmap (D7.1) reads the same ledger for free.
  `CREATE TABLE IF NOT EXISTS study_day (
    day        TEXT PRIMARY KEY,
    recalls    INTEGER NOT NULL DEFAULT 0,
    available  INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`,

  // 060_word_status_srs_source — BRR Epic 4.3b Phase D2 (cross-text «due today»). The SOURCE sentence a
  // word was last recall-tested from, so the daily review queue can re-cloze a DUE word WITHOUT opening its
  // text (sentences of read texts live in OPFS — Studio + imported corpus). Anchored robustly: srs_sentence_id
  // = fast path; srs_text_key + srs_order_index = re-anchor across a delete/re-publish (sentence ids regenerate
  // on re-import — same pattern as bookmarks). srs_surface = the inflected form to blank. Additive, nullable;
  // a plain status set preserves them via UPSERT (only a recall answer writes them, COALESCE-guarded). Device-local.
  `ALTER TABLE word_status ADD COLUMN srs_text_key TEXT;
   ALTER TABLE word_status ADD COLUMN srs_sentence_id TEXT;
   ALTER TABLE word_status ADD COLUMN srs_order_index INTEGER;
   ALTER TABLE word_status ADD COLUMN srs_surface TEXT;`,

  // 061_text_progress_finished — BRR Epic 5 (graded-momentum) W1 «continue-mark-read». A durable
  // per-text «прочитано» mark so the «Продолжить чтение» shelf stops holding a fully-read text forever
  // (getContinueReading had NO completion cutoff → a 100%-read canon work sat on the shelf permanently).
  // finished_at = ISO timestamp the reader marked it read (NULL = unread). Additive, nullable; written by
  // a NARROW UPSERT (setTextFinished) that touches ONLY finished_at, so the 800ms scroll-writer (setProgress)
  // never clobbers it and a mark never lowers last_row_idx (UPSERT-preserve lesson, inv #2). getContinueReading
  // filters finished_at IS NULL; carried in the library bundle export/import for portability (R9). Device-local OPFS.
  `ALTER TABLE text_progress ADD COLUMN finished_at TEXT;`,

  // 061_text_user_meta — Studio↔Room compat Ф1 (BRR_STUDIO_ROOM_COMPAT_2026_07_02.md, D-B).
  // The learner's PERSONAL metadata layer over CORPUS texts (canon rows stay untouched — R9
  // derived≠asserted): tags/level/тема/manual smart-tag override live here, keyed by the STABLE
  // text_key so they survive a work's delete/re-import/re-shard (the bookmarks pattern; corpus
  // sentence/text ids regenerate on re-import, text_key does not). Own (non-corpus) texts keep
  // editing their `texts` row directly — no dual home for the same fact (the UPSERT lesson).
  `CREATE TABLE IF NOT EXISTS text_user_meta (
    text_key         TEXT PRIMARY KEY,
    level            TEXT,
    tags_json        TEXT,
    topic            TEXT,
    manual_smart_tag TEXT,
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`,

  // 041_review_log — Retention program P0 (RETENTION_PROGRAM_RECON_2026_07_02.md §3.2).
  // ⚠ Label numbering reset: earlier "NNN_" labels are FICTION (this array has 40 entries before
  // this one and the applied version = array index — the "061" label above is really version 40,
  // and "061" is even doubled). From here labels equal the REAL index (this entry = version 41);
  // smoke:memory-canon asserts label==index for new entries. Do not renumber old labels (comments
  // only — renaming them changes nothing and risks confusion in old docs).
  //
  // The append-only EVENT-TRUTH of word memory: every genuine recall attempt (Room recall/due-queue,
  // Studio trainer (P3), reading-tap (P5), Anki ingest (P4)) plus 'seed' snapshot rows that make the
  // scheduler state fully replayable from this log alone (independent-oracle gate, recon B4).
  // id is CONTENT-DETERMINISTIC + globally unique (LemmaCanon.reviewId 'app:<sha1-20>' |
  // 'anki:<reviewId>' | 'seed:<item_key>') so bundle merge = INSERT OR IGNORE with zero loss and
  // zero duplication across devices (recon B5). item_key = the canonical lemma key
  // (lemma-canon.js; 'sent:<text_key>#<order_index>#<template>' for sentence cards, P3).
  // kind: 'review' (scored attempt) | 'skip' (refusal — folded like Again by the ONE shared engine
  // step, excluded from metrics/optimizer) | 'seed' (grade NULL; SM2 snapshot in meta_json).
  // grade 1..4 (Again/Hard/Good/Easy); the binary Room loop writes 1|3. Scheduler state stays a
  // DERIVED cache on word_status.srs_* — this table is the source of truth (derived≠asserted).
  `CREATE TABLE IF NOT EXISTS review_log (
    id          TEXT PRIMARY KEY,
    item_key    TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'review',
    reviewed_at TEXT NOT NULL,
    grade       INTEGER,
    source      TEXT NOT NULL,
    channel     TEXT,
    latency_ms  INTEGER,
    meta_json   TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS ix_review_log_item ON review_log(item_key, reviewed_at);
  CREATE INDEX IF NOT EXISTS ix_review_log_time ON review_log(reviewed_at);`,

  // 042_word_status_fsrs — Retention P2 (recon §3.4; owner go after the P1.5 shadow-diff).
  // The DERIVED scheduler-state cache for the FSRS engine (fsrs-core.js) ON the word_status row:
  // stability/difficulty (the DSR memory state), the last-review timestamp, and the scheme marker
  // (NULL = legacy SM2-lite row not yet handed over | 'fsrs' = FSRS-owned). Additive + lazy-seed:
  // NOTHING is rescheduled by this migration — a word converts at its NEXT recall (fsrsStep seeds
  // from the SM2 snapshot and writes a 'seed' row into review_log, so replay(log) == state).
  // Existing srs_due/interval/reps/lapses stay live as PROJECTIONS (updated on every FSRS review)
  // — dueCounts / D2 queue / rankByWeakness / leech keep their semantics on fresh data.
  `ALTER TABLE word_status ADD COLUMN srs_stability REAL;
   ALTER TABLE word_status ADD COLUMN srs_difficulty REAL;
   ALTER TABLE word_status ADD COLUMN srs_reviewed_at TEXT;
   ALTER TABLE word_status ADD COLUMN srs_scheme TEXT;`,

  // 043_sync_state — CLG-P3 Browser Sync Bridge (AI_MENTOR_RECON_2026_07_04.md §4.3). DEVICE-LOCAL
  // sync cursors: up_cursor = rowid-watermark over the append-only review_log (outbox IS the log —
  // no separate queue, so a writer that "doesn't know about the outbox" cannot exist), down_cursor =
  // server ingested_at high-water mark, cutover_ok = the §4.3 cutover flag (set only after a
  // full-scan re-ingest reports 0 new rows). Deliberately NOT exported in bundles (cursors are
  // device identity, not learner data) and dies with an OPFS wipe (a fresh profile must full-sync).
  `CREATE TABLE IF NOT EXISTS sync_state (
    k TEXT PRIMARY KEY,
    v TEXT
  );`,

  // 044_artifact_sync_intents — Sync-hardening P2 (SYNC_HARDENING_P0P2_DESIGN §6.5/§6.9).
  // (1) Очередь delete/undelete-интентов облачных артефактов — ТАБЛИЦА, не JSON в sync_state
  // (RMW-гонка мультивкладки — критика F1-10); last-intent-wins per key обеспечивает enqueue
  // (снятие противоположного интента — Undo-сценарий F2-3); дренаж по id на следующем синке
  // Зала (Студия обычно без cloud-сессии — только энкьюит). Device-local, в бандлы не едет.
  // (2) lww_replace_backups — слим-снапшот текста ПЕРЕД каждым LWW-replace (кап 20, страховка
  // slow-clock edit-loss из risk-register §4 V2a: отстающие часы → правка тихо съедена
  // replace'ом); восстановление — вручную через консоль (importBundle(JSON.parse(payload_json))).
  `CREATE TABLE IF NOT EXISTS artifact_sync_intents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    op           TEXT NOT NULL CHECK(op IN ('delete','undelete')),
    artifact_key TEXT NOT NULL,
    deleted_at   TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS ix_artifact_intents_key ON artifact_sync_intents(artifact_key);
  CREATE TABLE IF NOT EXISTS lww_replace_backups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    text_key     TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`,

  // 045_studio_media_package_l3a — browser-local Correctable Media Package canon.
  // Raw normalized tracks and user-corrected tracks are separate logical tracks;
  // immutable revisions are canonical. Legacy passport/VTT are projections only.
  // Deliberately browser-only: no server schema, cloud sync or media upload.
  `CREATE TABLE IF NOT EXISTS studio_media_packages (
    package_id       TEXT PRIMARY KEY,
    media_sha256     TEXT,
    mime             TEXT,
    duration_ms      INTEGER,
    original_name    TEXT,
    opfs_path        TEXT,
    size_bytes       INTEGER,
    external_ref_json TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    deleted_at       TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_studio_packages_media_sha
    ON studio_media_packages(media_sha256)
    WHERE media_sha256 IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS studio_caption_tracks (
    track_id               TEXT PRIMARY KEY,
    package_id             TEXT NOT NULL REFERENCES studio_media_packages(package_id) ON DELETE CASCADE,
    role                   TEXT NOT NULL CHECK(role IN ('raw_original','user_corrected','translated','simplified')),
    language               TEXT,
    parent_track_id        TEXT REFERENCES studio_caption_tracks(track_id),
    current_revision_id    TEXT,
    draft_base_revision_id TEXT,
    draft_json             TEXT,
    draft_updated_at       TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_studio_tracks_package_role
    ON studio_caption_tracks(package_id, role);

  CREATE TABLE IF NOT EXISTS studio_caption_revisions (
    revision_id      TEXT PRIMARY KEY,
    track_id         TEXT NOT NULL REFERENCES studio_caption_tracks(track_id) ON DELETE CASCADE,
    parent_revision_id TEXT,
    revision_no      INTEGER NOT NULL,
    segments_json    TEXT NOT NULL,
    operations_json  TEXT,
    canonical_sha256 TEXT NOT NULL,
    author_kind      TEXT NOT NULL CHECK(author_kind IN ('provider','import','user')),
    provenance_json  TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    UNIQUE(track_id, revision_no)
  );
  CREATE INDEX IF NOT EXISTS ix_studio_revisions_track_no
    ON studio_caption_revisions(track_id, revision_no);

  CREATE TABLE IF NOT EXISTS studio_text_media_bindings (
    text_id         TEXT PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
    package_id      TEXT NOT NULL REFERENCES studio_media_packages(package_id) ON DELETE CASCADE,
    track_id        TEXT NOT NULL REFERENCES studio_caption_tracks(track_id),
    revision_id     TEXT NOT NULL REFERENCES studio_caption_revisions(revision_id),
    revision_sha256 TEXT NOT NULL,
    mapping_json    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_studio_bindings_package
    ON studio_text_media_bindings(package_id);
  CREATE INDEX IF NOT EXISTS ix_studio_bindings_revision
    ON studio_text_media_bindings(revision_id);`,

  // 046_studio_material_revision_workspace — browser-local immutable learning-table canon.
  // Lazy promotion only: existing texts/sentences remain the compatibility projection and
  // are never mass-backfilled. No server/cloud schema is implied by these OPFS tables.
  `CREATE TABLE IF NOT EXISTS studio_learning_materials (
    material_id               TEXT PRIMARY KEY,
    package_id                TEXT,
    text_id                   TEXT NOT NULL UNIQUE REFERENCES texts(id) ON DELETE CASCADE,
    portable_text_key         TEXT,
    current_table_revision_id TEXT,
    created_at                TEXT NOT NULL,
    updated_at                TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_studio_materials_package ON studio_learning_materials(package_id);

  CREATE TABLE IF NOT EXISTS studio_table_revisions (
    table_revision_id          TEXT PRIMARY KEY,
    material_id                TEXT NOT NULL REFERENCES studio_learning_materials(material_id) ON DELETE CASCADE,
    revision_no                INTEGER NOT NULL,
    parent_revision_id         TEXT,
    bound_caption_revision_id  TEXT,
    bound_caption_revision_sha256 TEXT,
    content_sha256             TEXT NOT NULL,
    mapping_sha256             TEXT NOT NULL,
    provider_context_json      TEXT NOT NULL DEFAULT '{}',
    impact_json                TEXT NOT NULL DEFAULT '{}',
    created_at                 TEXT NOT NULL,
    committed_at               TEXT NOT NULL,
    UNIQUE(material_id, revision_no)
  );
  CREATE INDEX IF NOT EXISTS ix_studio_table_revisions_material_no
    ON studio_table_revisions(material_id, revision_no);

  CREATE TABLE IF NOT EXISTS studio_learning_row_versions (
    row_version_id  TEXT PRIMARY KEY,
    stable_row_id   TEXT NOT NULL,
    content_sha256  TEXT NOT NULL,
    he_plain        TEXT NOT NULL DEFAULT '',
    he_niqqud       TEXT NOT NULL DEFAULT '',
    translit        TEXT NOT NULL DEFAULT '',
    translit_ru     TEXT NOT NULL DEFAULT '',
    ru              TEXT NOT NULL DEFAULT '',
    field_meta_json TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_studio_row_versions_stable
    ON studio_learning_row_versions(stable_row_id, created_at);

  CREATE TABLE IF NOT EXISTS studio_table_revision_rows (
    table_revision_id      TEXT NOT NULL REFERENCES studio_table_revisions(table_revision_id) ON DELETE CASCADE,
    row_version_id         TEXT NOT NULL REFERENCES studio_learning_row_versions(row_version_id),
    order_index            INTEGER NOT NULL,
    caption_segment_id     TEXT,
    source_segment_ids_json TEXT NOT NULL DEFAULT '[]',
    mapping_meta_json      TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY(table_revision_id, order_index),
    UNIQUE(table_revision_id, row_version_id)
  );
  CREATE INDEX IF NOT EXISTS ix_studio_table_rows_caption
    ON studio_table_revision_rows(table_revision_id, caption_segment_id);`,

  // 047_studio_portable_import_receipts — P2 Portable Learning Package v2.
  // Derived Artifact Graph remains pure: no registry/edge/content-copy tables. This additive
  // metadata-only receipt stores hashes, counts, portable↔local IDs and rollback pointers so
  // verified imports are durable, idempotent and explicitly reversible after a cold reopen.
  `CREATE TABLE IF NOT EXISTS studio_portable_import_receipts (
    receipt_id             TEXT PRIMARY KEY,
    portable_package_id    TEXT NOT NULL,
    content_root_sha256    TEXT NOT NULL,
    manifest_sha256        TEXT NOT NULL,
    schema_version         INTEGER NOT NULL CHECK(schema_version = 2),
    package_mode           TEXT NOT NULL CHECK(package_mode IN ('snapshot','archive')),
    status                 TEXT NOT NULL CHECK(status IN ('committed','rolled_back')),
    plan_sha256            TEXT NOT NULL,
    result_sha256          TEXT NOT NULL,
    counts_json            TEXT NOT NULL,
    id_map_json            TEXT NOT NULL,
    rollback_json          TEXT NOT NULL,
    missing_media_json     TEXT NOT NULL DEFAULT '[]',
    created_at             TEXT NOT NULL,
    rolled_back_at         TEXT,
    UNIQUE(portable_package_id, content_root_sha256)
  );
  CREATE INDEX IF NOT EXISTS ix_studio_portable_receipts_root
    ON studio_portable_import_receipts(content_root_sha256, status);`,

  // 048_studio_portable_export_receipts — P4 Import Center backup provenance.
  // Append-only metadata distinguishes generated bytes from an explicit owner-saved assertion;
  // it is neither package/content truth nor evidence that an external file still exists.
  `CREATE TABLE IF NOT EXISTS studio_portable_export_receipts (
    receipt_id          TEXT PRIMARY KEY,
    event_kind         TEXT NOT NULL CHECK(event_kind IN ('generated','owner_saved')),
    parent_receipt_id  TEXT REFERENCES studio_portable_export_receipts(receipt_id),
    scope_kind         TEXT NOT NULL CHECK(scope_kind IN ('library','material','text_card')),
    portable_scope_id  TEXT NOT NULL,
    format_kind        TEXT NOT NULL CHECK(format_kind IN (
      'full_zip','archive_lplp','snapshot_lplp','text_zip','compatibility_json'
    )),
    source_state_sha256 TEXT NOT NULL,
    artifact_sha256    TEXT NOT NULL,
    size_bytes         INTEGER NOT NULL CHECK(size_bytes >= 0),
    destination_kind   TEXT CHECK(destination_kind IS NULL OR destination_kind IN (
      'files_icloud','files_local','share_sheet','other'
    )),
    app_version        TEXT NOT NULL,
    details_json       TEXT NOT NULL DEFAULT '{}',
    created_at         TEXT NOT NULL,
    CHECK(
      (event_kind='generated' AND parent_receipt_id IS NULL AND destination_kind IS NULL) OR
      (event_kind='owner_saved' AND parent_receipt_id IS NOT NULL AND destination_kind IS NOT NULL)
    )
  );
  CREATE INDEX IF NOT EXISTS ix_studio_portable_export_scope
    ON studio_portable_export_receipts(scope_kind, portable_scope_id, created_at);
  CREATE INDEX IF NOT EXISTS ix_studio_portable_export_artifact
    ON studio_portable_export_receipts(artifact_sha256, event_kind);`,

  // 049_room_learning_compass_cache — B7 Learning Compass 2.0.
  // Local-only DERIVED lexical ingredients. Never stores a title, body, learner state or
  // reading session; every row is invalidated by exact content/entitlement/resolver revisions.
  `CREATE TABLE IF NOT EXISTS room_learning_compass_cache (
    cache_key            TEXT PRIMARY KEY,
    source_class         TEXT NOT NULL CHECK(source_class IN ('mytext','group')),
    source_key           TEXT NOT NULL,
    content_revision     TEXT NOT NULL,
    content_sha256       TEXT NOT NULL,
    entitlement_revision TEXT,
    resolver_version     TEXT NOT NULL,
    ingredients_json     TEXT NOT NULL CHECK(json_valid(ingredients_json)),
    size_bytes           INTEGER NOT NULL CHECK(size_bytes >= 0),
    built_at             TEXT NOT NULL,
    last_used_at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_room_compass_cache_source
    ON room_learning_compass_cache(source_class, source_key);
  CREATE INDEX IF NOT EXISTS ix_room_compass_cache_lru
    ON room_learning_compass_cache(last_used_at, built_at);`,
  // 050_word_context — Room Trainer T2 (ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02 §6).
  // DEVICE-LOCAL DERIVED cache of verified occurrences of a scheduled word, so the cross-text
  // queue can rotate a word through DIFFERENT real sentences instead of re-serving the single
  // pinned word_status.srs_* anchor for ever (encoding specificity, R2).
  //
  // Derived, never asserted: nothing here is an event, nothing syncs, and every row is
  // rebuildable from the local texts/sentences tables. Invalidation is a DELETE — a keyer
  // bump drops the bank and reading refills it. `surface` is the verified inflected form in
  // THAT sentence, so rotation can re-cloze without re-resolving.
  `CREATE TABLE IF NOT EXISTS word_context (
    lemma_key     TEXT NOT NULL,
    text_key      TEXT NOT NULL,
    order_index   INTEGER NOT NULL,
    sentence_id   TEXT,
    surface       TEXT NOT NULL,
    source_class  TEXT NOT NULL CHECK(source_class IN ('mytext','byehuda','public','group')),
    corpus_id     TEXT,
    keyer_version TEXT NOT NULL,
    verified_at   TEXT NOT NULL,
    PRIMARY KEY (lemma_key, text_key, order_index)
  );
  CREATE INDEX IF NOT EXISTS ix_word_context_lemma ON word_context(lemma_key, source_class);
  CREATE INDEX IF NOT EXISTS ix_word_context_scope ON word_context(source_class, corpus_id, lemma_key);
  CREATE INDEX IF NOT EXISTS ix_word_context_keyer ON word_context(keyer_version);`,
  // 051_lexical_resolution_events — P0.5 LinguistPro + Obsidian.
  // Owner/teacher decisions are an append-only overlay over sentence_morph;
  // they never rewrite provider evidence or touch review_log / FSRS.
  LEXICAL_RESOLUTION_SCHEMA_SQL,
];
