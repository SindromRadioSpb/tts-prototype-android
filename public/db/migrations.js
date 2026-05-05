// Browser SQLite migrations — точная копия серверных migrations/*.sql
// Каждый элемент = одна транзакция. Порядок критичен.
// schema_migrations tracker хранит применённые версии.

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
];
