-- 012_srs_templates.sql
-- PATCH-05: template-driven SRS cards

CREATE TABLE IF NOT EXISTS srs_card_templates (
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
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

INSERT OR IGNORE INTO srs_card_templates (
  id, code, label, card_kind, prompt_lang, answer_lang,
  front_schema_json, back_schema_json, answer_mode, is_active, sort_order
) VALUES
  (
    'tpl_ru_to_he',
    'ru_to_he',
    'Russian -> Hebrew',
    'sentence',
    'ru',
    'he',
    '{"prompt":"ru"}',
    '{"answer":"he","extra":["translit","textTitle"]}',
    'reveal',
    1,
    10
  ),
  (
    'tpl_he_to_ru',
    'he_to_ru',
    'Hebrew -> Russian',
    'sentence',
    'he',
    'ru',
    '{"prompt":"he"}',
    '{"answer":"ru","extra":["translit","textTitle"]}',
    'reveal',
    1,
    20
  ),
  (
    'tpl_audio_to_he',
    'audio_to_he',
    'Audio -> Hebrew',
    'sentence_audio',
    'audio',
    'he',
    '{"prompt":"audio"}',
    '{"answer":"he","extra":["translit","textTitle"]}',
    'reveal',
    0,
    30
  );

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
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_review_at TEXT,
  UNIQUE(entity_type, entity_id, template_id)
);

INSERT INTO srs_cards (
  id, entity_type, entity_id, template_id, source_sentence_id, source_note_id, meta_json,
  state, due_date, interval_days, ease_factor, lapses, reps,
  created_at, updated_at, last_review_at
)
SELECT
  id,
  entity_type,
  entity_id,
  'tpl_ru_to_he',
  CASE WHEN entity_type = 'sentence' THEN entity_id ELSE NULL END,
  NULL,
  '{}',
  state,
  due_date,
  interval_days,
  ease_factor,
  lapses,
  reps,
  created_at,
  updated_at,
  last_review_at
FROM srs_cards_legacy_012;

DROP TABLE srs_cards_legacy_012;

CREATE INDEX IF NOT EXISTS ix_srs_cards_due ON srs_cards(due_date);
CREATE INDEX IF NOT EXISTS ix_srs_cards_state ON srs_cards(state);
CREATE INDEX IF NOT EXISTS ix_srs_cards_entity ON srs_cards(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_srs_cards_template ON srs_cards(template_id);
CREATE INDEX IF NOT EXISTS ix_srs_cards_entity_template ON srs_cards(entity_type, entity_id, template_id);
