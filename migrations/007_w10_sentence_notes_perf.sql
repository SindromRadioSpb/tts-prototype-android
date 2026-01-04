-- 007_w10_sentence_notes_perf.sql
-- PRO-PREMIUM: performance + canonical timestamps for sentence_notes

-- 1) Индексы под listNotesByTextId / будущий поиск
CREATE INDEX IF NOT EXISTS idx_sentence_notes_text_id
  ON sentence_notes(text_id);

CREATE INDEX IF NOT EXISTS idx_sentence_notes_text_id_updated_at
  ON sentence_notes(text_id, updated_at);

-- 2) Нормализация существующих timestamp из "YYYY-MM-DD HH:MM:SS" -> ISO "YYYY-MM-DDTHH:MM:SSZ"
UPDATE sentence_notes
SET
  created_at = CASE
    WHEN created_at LIKE '____-__-__ __:__:%' THEN REPLACE(created_at, ' ', 'T') || 'Z'
    ELSE created_at
  END,
  updated_at = CASE
    WHEN updated_at LIKE '____-__-__ __:__:%' THEN REPLACE(updated_at, ' ', 'T') || 'Z'
    ELSE updated_at
  END
WHERE
  created_at LIKE '____-__-__ __:__:%'
  OR updated_at LIKE '____-__-__ __:__:%';

-- 3) Триггеры: гарантируем ISO-формат на INSERT/UPDATE даже если репо пишет CURRENT_TIMESTAMP
-- Важно: условия предотвращают бесконечную рекурсию.
CREATE TRIGGER IF NOT EXISTS trg_sentence_notes_iso_after_insert
AFTER INSERT ON sentence_notes
BEGIN
  UPDATE sentence_notes
  SET
    created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sentence_notes_iso_after_update
AFTER UPDATE ON sentence_notes
WHEN
  NEW.updated_at IS NULL
  OR NEW.updated_at LIKE '____-__-__ __:__:%'
BEGIN
  UPDATE sentence_notes
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.id;
END;
